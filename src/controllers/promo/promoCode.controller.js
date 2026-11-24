const PromoCode = require('../../models/PromoCode');
const pricingService = require('../../services/pricing.service');
const { findEventById } = require('../../utils/eventHelper');

/**
 * Player-facing promo endpoints: /quote and the legacy /validate.
 * Organiser CRUD lives in organiserPromo.controller.js (with ownership checks).
 */

/**
 * @desc    Validate promo code
 * @route   POST /api/promo-codes/validate
 * @access  Public
 */
const validatePromoCode = async (req, res, next) => {
  try {
    const { code, eventId, amount } = req.body;

    if (!code || !eventId || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Code, eventId, and amount are required',
      });
    }

    const userId = req.user ? req.user.id : null;
    const numericAmount = parseFloat(amount);
    let validation;

    if (userId) {
      // Same rules as /quote (owner, sport, eligibility, limits). The legacy response shape is kept:
      // discount on the client-sent pre-VAT amount, no VAT line.
      const event = await findEventById(eventId);
      const unit = Number((event && (event.gameJoinPrice ?? event.eventPricePerGuest)) || 0);
      const guestsCount = unit > 0 ? Math.max(1, Math.round(numericAmount / unit)) : 1;
      try {
        const { validated } = await pricingService.quoteDetailed({
          targetType: 'event',
          eventId,
          guestsCount,
          userId,
          codes: [code],
        });
        const discountAmount = pricingService.computeCodeDiscount(validated[0].promoCode, numericAmount);
        validation = {
          promoCode: validated[0].promoCode,
          discountAmount,
          finalAmount: pricingService.round2(numericAmount - discountAmount),
        };
      } catch (quoteError) {
        if (quoteError instanceof pricingService.PromoError) {
          return res.status(400).json({ success: false, error: quoteError.message, code: quoteError.code });
        }
        throw quoteError;
      }
    } else {
      // Anonymous callers can't be checked for eligibility; keep the old behaviour
      validation = await PromoCode.validateAndApply(code, eventId, userId, numericAmount);
    }

    res.status(200).json({
      success: true,
      message: 'Promo code is valid',
      data: {
        promoCode: {
          code: validation.promoCode.code,
          description: validation.promoCode.description,
          discountType: validation.promoCode.discountType,
          discountValue: validation.promoCode.discountValue,
        },
        originalAmount: numericAmount,
        discountAmount: validation.discountAmount,
        finalAmount: validation.finalAmount,
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message || 'Invalid promo code',
    });
  }
};

/**
 * @desc    Server-side price quote for a checkout (event or package), with promo codes
 * @route   POST /api/promo-codes/quote
 * @access  Private
 */
const quotePromo = async (req, res, next) => {
  try {
    const {
      targetType = 'event',
      eventId,
      occurrenceStart,
      packageId,
      guestsCount,
      promoCodes,
      promoCode,
    } = req.body || {};

    if (!['event', 'package'].includes(targetType)) {
      return res.status(400).json({ success: false, message: 'targetType must be event or package', code: 'NOT_APPLICABLE' });
    }
    if (promoCodes !== undefined && !Array.isArray(promoCodes)) {
      return res.status(400).json({ success: false, message: 'promoCodes must be an array', code: 'INVALID' });
    }

    // Accept the legacy single "promoCode" string too
    const codes = Array.isArray(promoCodes) ? promoCodes : (promoCode ? [promoCode] : []);

    const quote = await pricingService.quote({
      targetType,
      eventId,
      occurrenceStart,
      packageId,
      guestsCount: guestsCount === undefined ? 1 : Number(guestsCount),
      userId: req.user.id,
      codes,
    });

    return res.status(200).json({ success: true, data: { quote } });
  } catch (error) {
    if (error instanceof pricingService.PromoError) {
      return res.status(error.statusCode).json({ success: false, message: error.message, code: error.code });
    }
    next(error);
  }
};

module.exports = {
  quotePromo,
  validatePromoCode,
};
