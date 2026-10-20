const Package = require('../../../models/Package');
const PackagePurchase = require('../../../models/PackagePurchase');
const Payment = require('../../../models/Payment');
const User = require('../../../models/User');
const stripe = require('stripe');

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

    // Pricing calculation with 5% VAT
    const basePrice = parseFloat(package.packagePrice) || 0;
    const vatRate = 0.05;
    const vatAmount = Math.round(basePrice * vatRate * 100) / 100;
    const finalAmount = basePrice + vatAmount;
    const amountInCents = Math.round(finalAmount * 100);

    // If free package (0 AED)
    if (amountInCents <= 0) {
      const purchaseData = {
        userId,
        packageId: package._id,
        organiserId: package.organiserId,
        validityMonths: package.validityMonths || 1,
        maxEvents: package.maxEvents || 0,
      };

      const purchase = await PackagePurchase.create(purchaseData);

      // Send notifications for free package acquisition
      try {
        const Notification = require('../../../models/Notification');
        const buyer = await User.findById(userId);
        await Notification.create(
          package.organiserId,
          'package_purchase',
          'Package Purchased',
          `${buyer?.fullName || 'A player'} has acquired your package: ${package.packageName}`,
          {
            packageId: package.packageId,
            purchaseId: purchase._id.toString(),
            userId: userId.toString(),
            organiserId: package.organiserId ? package.organiserId.toString() : '',
          }
        );
        await Notification.create(
          userId,
          'package_purchase_confirmed',
          'Package Purchase Confirmed',
          `You have successfully acquired ${package.packageName}!`,
          {
            packageId: package.packageId,
            packageName: package.packageName,
            purchaseId: purchase._id.toString(),
            organiserId: package.organiserId ? package.organiserId.toString() : '',
          }
        );
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
    };

    // Create Stripe payment intent
    const paymentIntent = await stripeInstance.paymentIntents.create({
      amount: amountInCents,
      currency: 'aed',
      customer: customerId,
      metadata: metadata,
      description: `Purchase of ${package.packageName} by ${user.fullName || user.email}`,
    });

    // Create pending Payment record
    const paymentData = {
      userId: userId,
      packageId: package._id,
      organiserId: package.organiserId,
      type: 'package',
      amount: basePrice,
      discountAmount: 0,
      finalAmount: finalAmount,
      currency: 'aed',
      stripePaymentIntentId: paymentIntent.id,
      status: 'pending',
      metadata: metadata,
    };

    const payment = await Payment.create(paymentData);

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
