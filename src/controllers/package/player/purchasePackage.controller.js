const Package = require('../../../models/Package');
const PackagePurchase = require('../../../models/PackagePurchase');
const Payment = require('../../../models/Payment');
const User = require('../../../models/User');
const stripe = require('stripe');
const pricingService = require('../../../services/pricing.service');
const promoRedemption = require('../../../services/promoRedemption.service');
const {
  extractCodes,
  respondIfPromoError,
  buildPromoFields,
  buildPromoMetadata,
} = require('../../../services/promoCheckout.service');

// Initialize Stripe lazily
let stripeInstance = null;
const getStripeInstance = () => {
  if (!stripeInstance) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error('Stripe credentials not configured. Please set STRIPE_SECRET_KEY in environment variables.');
    }
    stripeInstance = stripe(secretKey);
  }
  return stripeInstance;
};

/**
 * @desc    Purchase a package (Initiate Stripe Payment) (Player only)
 * @route   POST /api/packages/:packageId/purchase
 * @access  Private (Player)
 */
const purchasePackage = async (req, res, next) => {
  try {
    // Check if user is a player
    if (req.user.userType !== 'player') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Only players can purchase packages.',
        userType: req.user.userType,
        requiredType: 'player',
      });
    }

    const userId = req.user.id;
    const { packageId } = req.params;

    // Verify package exists
    const package = await Package.findById(packageId);
    if (!package) {
      return res.status(404).json({
        success: false,
        error: 'Package not found',
      });
    }

    if (!package.isActive) {
      return res.status(400).json({
        success: false,
        error: 'Package is not active',
      });
    }

    // Check if user already has an active purchase of this package
    const existingPurchases = await PackagePurchase.findActiveByUser(userId);
    const hasActivePurchase = existingPurchases.some(
      p => p.packageId.toString() === package._id.toString() && 
           new Date(p.expiryDate) > new Date() &&
           p.isActive !== false
    );

    if (hasActivePurchase) {
      return res.status(400).json({
        success: false,
        error: 'You already have an active purchase of this package',
      });
    }

    // Price comes from the server-side quote (package price, promo codes, 5% VAT)
    let quoteResult;
    try {
      quoteResult = await pricingService.quoteDetailed({
        targetType: 'package',
        packageId: package._id,
        userId,
        codes: extractCodes(req),
      });
    } catch (quoteError) {
      if (respondIfPromoError(res, quoteError)) {
        return;
      }
      throw quoteError;
    }
    const { quote, validated, target } = quoteResult;
    const basePrice = quote.originalAmount;
    const finalAmount = quote.finalAmount;
    const amountInCents = Math.round(finalAmount * 100);

    // Reserve the promo use(s); confirmed when the payment succeeds (or right away for a free package)
    let redemptions = [];
    if (validated.length > 0) {
      try {
        redemptions = await promoRedemption.reserve({ quote, validated, target, userId, context: {} });
      } catch (reserveError) {
        if (respondIfPromoError(res, reserveError)) {
          return;
        }
        throw reserveError;
      }
    }
    const promoFields = buildPromoFields(quote, validated, redemptions);

    // If free package (0 AED)
    if (amountInCents <= 0) {
      const purchaseData = {
        userId,
        packageId: package._id,
        organiserId: package.organiserId,
        validityMonths: package.validityMonths || 1,
        maxEvents: package.maxEvents || 0,
        promoCode: promoFields.promoCode,
        discountAmount: promoFields.discountAmount,
        appliedPromos: promoFields.appliedPromos,
        vatAmount: promoFields.vatAmount,
        rallyFundedDiscount: promoFields.rallyFundedDiscount,
        organiserFundedDiscount: promoFields.organiserFundedDiscount,
      };

      let purchase;
      try {
        purchase = await PackagePurchase.create(purchaseData);
      } catch (purchaseError) {
        await promoRedemption.release({ redemptionIds: redemptions.map((r) => r._id) }, 'purchase_failed');
        throw purchaseError;
      }

      // A 100% code: confirm the use now and keep a 0 AED payment record (no Stripe)
      if (redemptions.length > 0) {
        const freePayment = await Payment.create({
          userId,
          packageId: package._id,
          organiserId: package.organiserId,
          purchaseId: purchase._id,
          type: 'package',
          amount: basePrice,
          discountAmount: promoFields.discountAmount,
          finalAmount: 0,
          currency: 'aed',
          promoCodeId: promoFields.promoCodeId,
          promoCode: promoFields.promoCode,
          appliedPromos: promoFields.appliedPromos,
          vatAmount: promoFields.vatAmount,
          rallyFundedDiscount: promoFields.rallyFundedDiscount,
          organiserFundedDiscount: promoFields.organiserFundedDiscount,
          stripePaymentIntentId: `free_pkg_${purchase._id}`, // synthetic: not a Stripe id
          paymentMethod: 'promo_free',
          status: 'success',
          metadata: buildPromoMetadata(quote, package.organiserId),
        });
        await promoRedemption.attach(redemptions.map((r) => r._id), {
          paymentId: freePayment._id,
          packagePurchaseId: purchase._id,
        });
        await promoRedemption.confirm({ redemptionIds: redemptions.map((r) => r._id) });
      }

      // Send notifications (in-app + FCM push) for package acquisition
      try {
        const { notifyOnPackagePurchase } = require('../../../services/packageNotification.service');
        notifyOnPackagePurchase({
          buyerId: userId,
          organiserId: package.organiserId,
          package,
          purchase,
        }).catch((notifErr) => {
          console.error('Free package notification error:', notifErr.message);
        });
      } catch (notifErr) {
        console.error('Free package notification error:', notifErr.message);
      }

      return res.status(201).json({
        success: true,
        message: 'Package acquired successfully',
        data: {
          isFreePackage: true,
          paymentRequired: false,
          purchase: {
            purchaseId: purchase._id.toString(),
            packageId: package.packageId,
            packageName: package.packageName,
            purchaseDate: purchase.purchaseDate,
            expiryDate: purchase.expiryDate,
            isActive: purchase.isActive,
          },
        },
      });
    }

    // Get user details
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Ensure user has a valid Stripe customer ID
    const stripeInstance = getStripeInstance();
    let customerId = user.stripeCustomerId || user.stripe_customer_id || null;
    if (customerId) {
      try {
        const customer = await stripeInstance.customers.retrieve(customerId);
        if (customer.deleted) {
          customerId = null;
        }
      } catch (e) {
        customerId = null;
      }
    }

    if (!customerId) {
      const customer = await stripeInstance.customers.create({
        email: user.email || undefined,
        name: user.fullName || undefined,
        phone: user.mobileNumber || undefined,
        metadata: {
          mongoUserId: user._id.toString(),
          userId: String(user.userId),
        },
      });
      customerId = customer.id;
      await User.updateById(userId, { stripeCustomerId: customerId });
      user.stripeCustomerId = customerId;
    }

    const metadata = {
      type: 'package',
      packageId: package.packageId,
      packageMongoId: package._id.toString(),
      packageName: package.packageName,
      userId: String(userId),
      playerId: user.userId ? String(user.userId) : '',
      playerName: user.fullName || '',
      organiserId: package.organiserId ? String(package.organiserId) : '',
      ...buildPromoMetadata(quote, package.organiserId),
    };

    // Create Stripe payment intent
    let paymentIntent;
    try {
      paymentIntent = await stripeInstance.paymentIntents.create({
        amount: amountInCents,
        currency: 'aed',
        customer: customerId,
        metadata: metadata,
        description: `Purchase of ${package.packageName} by ${user.fullName || user.email}`,
      });
    } catch (piError) {
      await promoRedemption.release({ redemptionIds: redemptions.map((r) => r._id) }, 'payment_intent_failed');
      throw piError;
    }

    // Create pending Payment record
    const paymentData = {
      userId: userId,
      packageId: package._id,
      organiserId: package.organiserId,
      type: 'package',
      amount: basePrice,
      discountAmount: promoFields.discountAmount,
      finalAmount: finalAmount,
      currency: 'aed',
      promoCodeId: promoFields.promoCodeId,
      promoCode: promoFields.promoCode,
      appliedPromos: promoFields.appliedPromos,
      vatAmount: promoFields.vatAmount,
      rallyFundedDiscount: promoFields.rallyFundedDiscount,
      organiserFundedDiscount: promoFields.organiserFundedDiscount,
      stripePaymentIntentId: paymentIntent.id,
      status: 'pending',
      metadata: metadata,
    };

    const payment = await Payment.create(paymentData);

    if (redemptions.length > 0) {
      await promoRedemption.attach(redemptions.map((r) => r._id), {
        paymentId: payment._id,
        stripePaymentIntentId: paymentIntent.id,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Package payment initiated successfully',
      data: {
        package: {
          packageId: package.packageId,
          packageName: package.packageName,
          packagePrice: basePrice,
          validityMonths: package.validityMonths,
        },
        payment: {
          paymentId: payment.paymentId,
          status: 'pending',
          originalAmount: basePrice,
          discountAmount: promoFields.discountAmount,
          subtotal: quote.subtotal,
          vatAmount: promoFields.vatAmount,
          rallyFundedDiscount: promoFields.rallyFundedDiscount,
          organiserFundedDiscount: promoFields.organiserFundedDiscount,
          appliedPromos: promoFields.appliedPromos,
          promoCode: promoFields.promoCode,
          finalAmount: finalAmount,
          finalAmountInCents: amountInCents,
          currency: 'aed',
          stripePaymentIntentId: paymentIntent.id,
        },
        paymentIntent: {
          id: paymentIntent.id,
          clientSecret: paymentIntent.client_secret,
          amount: paymentIntent.amount,
          amountInDollars: (paymentIntent.amount / 100).toFixed(2),
          currency: paymentIntent.currency,
          status: paymentIntent.status,
          description: paymentIntent.description,
        },
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
        isFreePackage: false,
        paymentRequired: true,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = purchasePackage;
