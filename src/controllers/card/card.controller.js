const stripe = require('stripe');
const SavedCard = require('../../models/SavedCard');
const User = require('../../models/User');

// Initialize Stripe lazily (only when needed)
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
 * IMPORTANT (PCI):
 * This API does NOT store CVV or full card number. It stores# Task: Investigate Saved Cards Logic

- [x] Find backend implementation of `/api/cards`
- [x] Verify if cards are filtered by user ID
- [x] Check `BookingModal.tsx` for any frontend-side filtering
- [x] Confirm if it shows all cards or only user's cards
- [x] Implement diagnostic logging and secondary filter in the backend
- [x] Implement diagnostic logging in the frontend (PaymentMethodsScreen)
- [/] Verify fix (Deployment pending by user)
- [ ] Final confirmation of data privacy
 will be fetched from Stripe
 * - cardNumber (optional): Card number (can be full or masked) - required if paymentMethodId is not provided
 * - expiry / expMonth / expYear (optional): Card expiry information
 * - cardHolderName (optional)
 * - isDefault (optional, boolean)
 */
const createSavedCard = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const paymentMethodId = req.body.paymentMethodId || req.body.payment_method_id;
    const cardHolderName = req.body.cardHolderName ?? req.body.card_holder_name ?? null;
    const cardNumber = req.body.cardNumber ?? req.body.card_number ?? null;
    const isDefault = req.body.isDefault ?? req.body.is_default ?? false;
    const expiryRaw = req.body.expiry ?? req.body.expiryDate ?? req.body.expiry_date ?? req.body.mmYY ?? req.body.mm_yy ?? null;
    const expMonthRaw = req.body.expMonth ?? req.body.exp_month ?? null;
    const expYearRaw = req.body.expYear ?? req.body.exp_year ?? null;

    // If paymentMethodId is not provided, cardNumber is required
    if (!paymentMethodId && !cardNumber) {
      return res.status(400).json({
        success: false,
        error: 'Either paymentMethodId or cardNumber is required',
      });
    }

    // Optional expiry parsing (MM/YY or MM/YYYY) - for validation only
    const parseExpiry = (value) => {
      if (!value) return null;
      if (typeof value !== 'string') return null;
      const v = value.trim();
      const m = v.match(/^(\d{1,2})\s*\/\s*(\d{2}|\d{4})$/);
      if (!m) return null;
      const month = parseInt(m[1], 10);
      let year = parseInt(m[2], 10);
      if (Number.isNaN(month) || Number.isNaN(year)) return null;
      if (year < 100) year = 2000 + year; // 25 -> 2025
      if (month < 1 || month > 12) return null;
      return { expMonth: month, expYear: year };
    };

    let stripePaymentMethodId = null;
    let brand = null;
    let last4 = null;
    let expMonth = null;
    let expYear = null;
    let formattedExpiry = null;

    const stripeInstance = getStripeInstance();

    // If paymentMethodId is provided, fetch card details from Stripe and attach to Customer
    if (paymentMethodId && typeof paymentMethodId === 'string' && paymentMethodId.trim()) {
      const pmId = paymentMethodId.trim();

      // Ensure user has a Stripe Customer ID and attach PaymentMethod
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      let stripeCustomerId = user.stripeCustomerId || user.stripe_customer_id || null;
      if (stripeCustomerId) {
        try {
          // Validate customer exists
          await stripeInstance.customers.retrieve(stripeCustomerId);
        } catch (e) {
          stripeCustomerId = null;
        }
      }

      if (!stripeCustomerId) {
        const customer = await stripeInstance.customers.create({
          email: user.email || undefined,
          phone: user.mobileNumber || undefined,
          metadata: {
            mongoUserId: user._id.toString(),
            userId: String(user.userId),
          },
        });
        stripeCustomerId = customer.id;
        await User.updateById(userId, { stripeCustomerId });
      }

      // Attach PaymentMethod to Customer (Ignore if already attached)
      try {
        const pm = await stripeInstance.paymentMethods.retrieve(pmId);
        if (pm.customer !== stripeCustomerId) {
          await stripeInstance.paymentMethods.attach(pmId, {
            customer: stripeCustomerId,
          });
        }
        
        stripePaymentMethodId = pm.id;
        brand = pm.card?.brand || null;
        last4 = pm.card?.last4 || null;
        expMonth = pm.card?.exp_month || null;
        expYear = pm.card?.exp_year || null;
      } catch (attachError) {
        // If it's already attached to another customer, we might have a problem
        // but for now we just log it and proceed if we can retrieve it
        console.error('Stripe PM attach error:', attachError.message);
        if (!stripePaymentMethodId) {
          const pm = await stripeInstance.paymentMethods.retrieve(pmId);
          stripePaymentMethodId = pm.id;
          brand = pm.card?.brand || null;
          last4 = pm.card?.last4 || null;
          expMonth = pm.card?.exp_month || null;
          expYear = pm.card?.exp_year || null;
        }
      }

      // Validate provided expiry (if provided) matches Stripe card expiry
      const parsedExpiry = parseExpiry(expiryRaw);
      const providedExpMonth =
        expMonthRaw !== null && expMonthRaw !== undefined && expMonthRaw !== ''
          ? parseInt(expMonthRaw, 10)
          : parsedExpiry?.expMonth;
      const providedExpYear =
        expYearRaw !== null && expYearRaw !== undefined && expYearRaw !== ''
          ? parseInt(expYearRaw, 10)
          : parsedExpiry?.expYear;

      if (providedExpMonth || providedExpYear) {
        if (
          !expMonth ||
          !expYear ||
          (providedExpMonth && providedExpMonth !== expMonth) ||
          (providedExpYear && providedExpYear !== expYear)
        ) {
          return res.status(400).json({
            success: false,
            error: 'Expiry does not match the card expiry returned by Stripe',
            received: {
              expMonth: providedExpMonth || null,
              expYear: providedExpYear || null,
              expiry: expiryRaw || null,
            },
            stripe: {
              expMonth: expMonth,
              expYear: expYear,
            },
          });
        }
      }

      // Format expiry from Stripe data
      if (expMonth && expYear) {
        const month = String(expMonth).padStart(2, '0');
        const year = String(expYear).slice(-2);
        formattedExpiry = `${month}/${year}`;
      }
    } else {
      // If paymentMethodId is not provided, use provided card details
      const parsedExpiry = parseExpiry(expiryRaw);
      expMonth =
        expMonthRaw !== null && expMonthRaw !== undefined && expMonthRaw !== ''
          ? parseInt(expMonthRaw, 10)
          : parsedExpiry?.expMonth;
      expYear =
        expYearRaw !== null && expYearRaw !== undefined && expYearRaw !== ''
          ? parseInt(expYearRaw, 10)
          : parsedExpiry?.expYear;

      // Format expiry from provided data
      if (expiryRaw && typeof expiryRaw === 'string' && expiryRaw.trim()) {
        formattedExpiry = expiryRaw.trim();
      } else if (expMonth && expYear) {
        const month = String(expMonth).padStart(2, '0');
        const year = String(expYear).slice(-2);
        formattedExpiry = `${month}/${year}`;
      }

      // Extract last4 from cardNumber if provided
      if (cardNumber && typeof cardNumber === 'string') {
        const trimmedCardNumber = cardNumber.trim().replace(/\s+/g, '');
        if (trimmedCardNumber.length >= 4) {
          last4 = trimmedCardNumber.slice(-4);
        }
      }
    }

    const created = await SavedCard.create({
      userId,
      stripePaymentMethodId: stripePaymentMethodId,
      brand: brand,
      last4: last4,
      cardNumber: cardNumber ? String(cardNumber).trim() : null,
      expiry: formattedExpiry,
      expMonth: expMonth,
      expYear: expYear,
      cardHolderName: cardHolderName ? String(cardHolderName) : null,
      isDefault: !!isDefault,
    });

    // If set default, ensure only one default
    if (isDefault) {
      await SavedCard.setDefault(created.cardId, userId);
    }

    res.status(201).json({
      success: true,
      message: 'Card saved successfully',
      data: {
        card: {
          cardId: created.cardId,
          brand: created.brand,
          last4: created.last4,
          cardNumber: created.cardNumber || null,
          expiry: created.expiry || null,
          expMonth: created.expMonth,
          expYear: created.expYear,
          cardHolderName: created.cardHolderName,
          isDefault: !!created.isDefault,
          stripePaymentMethodId: created.stripePaymentMethodId,
          createdAt: created.createdAt,
        },
      },
    });
  } catch (error) {
    // Handle duplicate card (unique index)
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        error: 'This card is already saved',
      });
    }
    next(error);
  }
};

/**
 * @desc    Get saved cards for logged-in user
 * @route   GET /api/cards
 * @access  Private
 */
const getSavedCards = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const cards = await SavedCard.findByUser(userId);

    // DEBUG LOGS
    console.log(`[DEBUG] getSavedCards - User ID: ${userId} (Type: ${typeof userId})`);
    console.log(`[DEBUG] getSavedCards - Cards found: ${cards.length}`);
    if (cards.length > 0) {
      console.log(`[DEBUG] getSavedCards - First card userId: ${cards[0].userId}`);
    }

    res.status(200).json({
      success: true,
      debugUserId: userId,
      debugCardsCount: cards.length,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
      data: {
        cards: cards
          .filter(c => c.userId && c.userId.toString() === userId.toString()) // Double check filter
          .map((c) => ({
            cardId: c.cardId || c._id.toString(),
            debugCardUserId: c.userId, // Add this for diagnosis
            brand: c.brand,
          last4: c.last4,
          cardNumber: c.cardNumber || null,
          expiry: c.expiry || null,
          expMonth: c.expMonth,
          expYear: c.expYear,
          cardHolderName: c.cardHolderName || null,
          isDefault: !!c.isDefault,
          stripePaymentMethodId: c.stripePaymentMethodId,
          createdAt: c.createdAt,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get one saved card by id (must belong to user)
 * @route   GET /api/cards/:cardId
 * @access  Private
 */
const getSavedCard = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { cardId } = req.params;

    const card = await SavedCard.findByIdForUser(cardId, userId);
    if (!card) {
      return res.status(404).json({ success: false, error: 'Card not found' });
    }

    res.status(200).json({
      success: true,
      data: {
        card: {
          cardId: card.cardId || card._id.toString(),
          brand: card.brand,
          last4: card.last4,
          cardNumber: card.cardNumber || null,
          expiry: card.expiry || null,
          expMonth: card.expMonth,
          expYear: card.expYear,
          cardHolderName: card.cardHolderName || null,
          isDefault: !!card.isDefault,
          stripePaymentMethodId: card.stripePaymentMethodId,
          createdAt: card.createdAt,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update saved card (cardHolderName and/or isDefault)
 * @route   PUT /api/cards/:cardId
 * @access  Private
 */
const updateSavedCard = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { cardId } = req.params;

    const cardHolderName = req.body.cardHolderName ?? req.body.card_holder_name;
    const isDefault = req.body.isDefault ?? req.body.is_default;

    const updateData = {};
    if (cardHolderName !== undefined) {
      updateData.cardHolderName = cardHolderName === null ? null : String(cardHolderName);
    }
    if (isDefault !== undefined) {
      updateData.isDefault = !!isDefault;
    }

    const ok = await SavedCard.updateForUser(cardId, userId, updateData);
    if (!ok) {
      return res.status(404).json({ success: false, error: 'Card not found or not updated' });
    }

    const updated = await SavedCard.findByIdForUser(cardId, userId);
    res.status(200).json({
      success: true,
      message: 'Card updated successfully',
      data: {
        card: {
          cardId: updated.cardId || updated._id.toString(),
          brand: updated.brand,
          last4: updated.last4,
          cardNumber: updated.cardNumber || null,
          expiry: updated.expiry || null,
          expMonth: updated.expMonth,
          expYear: updated.expYear,
          cardHolderName: updated.cardHolderName || null,
          isDefault: !!updated.isDefault,
          stripePaymentMethodId: updated.stripePaymentMethodId,
          updatedAt: updated.updatedAt,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete saved card
 * @route   DELETE /api/cards/:cardId
 * @access  Private
 */
const deleteSavedCard = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { cardId } = req.params;

    const ok = await SavedCard.deleteForUser(cardId, userId);
    if (!ok) {
      return res.status(404).json({ success: false, error: 'Card not found' });
    }

    res.status(200).json({
      success: true,
      message: 'Card deleted successfully',
      data: { deletedAt: new Date() },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update saved card CVC (Stripe-compliant)
 * @route   POST /api/cards/:cardId/cvc-update
 * @access  Private
 *
 * Body:
 * - cvcToken (required): token generated on frontend via Stripe.js createToken('cvc_update', {cvc})
 *
 * Notes:
 * - We do NOT accept/store raw CVV.
 * - This updates the PaymentMethod on Stripe with a cvc_token.
 */
const updateSavedCardCvc = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { cardId } = req.params;
    const cvcToken = req.body.cvcToken || req.body.cvc_token;

    if (!cvcToken || typeof cvcToken !== 'string' || cvcToken.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'cvcToken is required (generate it on frontend via Stripe.js cvc_update token)',
      });
    }

    const card = await SavedCard.findByIdForUser(cardId, userId);
    if (!card) {
      return res.status(404).json({ success: false, error: 'Card not found' });
    }

    const stripeInstance = getStripeInstance();

    const updatedPm = await stripeInstance.paymentMethods.update(card.stripePaymentMethodId, {
      card: { cvc_token: cvcToken.trim() },
    });

    res.status(200).json({
      success: true,
      message: 'Card CVC updated successfully',
      data: {
        cardId: card.cardId || card._id.toString(),
        stripePaymentMethodId: card.stripePaymentMethodId,
        cvcCheck: updatedPm?.card?.checks?.cvc_check || null,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  /**
   * @desc    Create Stripe SetupIntent (for securely collecting/saving card)
   * @route   POST /api/cards/setup-intent
   * @access  Private
   *
   * Returns:
   * - setupIntentId
   * - clientSecret
   */
  createSetupIntent: async (req, res, next) => {
    try {
      const userId = req.user.id;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      const stripeInstance = getStripeInstance();

      // Ensure we have a Stripe Customer ID for this user (needed to re-use cards later)
      let stripeCustomerId = user.stripeCustomerId || user.stripe_customer_id || null;

      if (stripeCustomerId) {
        try {
          // Validate customer exists
          await stripeInstance.customers.retrieve(stripeCustomerId);
        } catch (e) {
          stripeCustomerId = null;
        }
      }

      if (!stripeCustomerId) {
        const customer = await stripeInstance.customers.create({
          email: user.email || undefined,
          phone: user.mobileNumber || undefined,
          metadata: {
            mongoUserId: user._id.toString(),
            userId: String(user.userId),
            userType: user.userType || '',
          },
        });

        stripeCustomerId = customer.id;

        // Persist on user document for future reuse
        await User.updateById(userId, { stripeCustomerId });
      }

      const setupIntent = await stripeInstance.setupIntents.create({
        customer: stripeCustomerId,
        payment_method_types: ['card'],
        usage: 'off_session',
      });

      res.status(200).json({
        success: true,
        data: {
          setupIntentId: setupIntent.id,
          clientSecret: setupIntent.client_secret,
          customerId: stripeCustomerId,
        },
      });
    } catch (error) {
      next(error);
    }
  },
  createSavedCard,
  getSavedCards,
  getSavedCard,
  updateSavedCard,
  updateSavedCardCvc,
  deleteSavedCard,
};

