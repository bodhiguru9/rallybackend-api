/**
 * Small helpers shared by every checkout path (bookEvent, createPaymentOrder, purchasePackage) so the
 * promo fields, Stripe metadata and error responses are identical everywhere.
 */
const { PromoError } = require('./pricing.service');
const promoRedemption = require('./promoRedemption.service');
const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const PromoCode = require('../models/PromoCode');

/**
 * Promo codes from a request: new `promoCodes` array, plus the legacy single `promoCode` / `promo_code`
 * (body or query) used by older app builds. Returns trimmed, upper-cased, de-duplicated codes.
 */
function extractCodes(req) {
  const body = req.body || {};
  const query = req.query || {};
  const raw = [];

  if (Array.isArray(body.promoCodes)) {
    raw.push(...body.promoCodes);
  } else if (typeof body.promoCodes === 'string') {
    raw.push(...body.promoCodes.split(','));
  }
  for (const legacy of [query.promoCode, body.promoCode, body.promo_code]) {
    if (typeof legacy === 'string') {
      raw.push(legacy);
    }
  }

  return [...new Set(raw.map((c) => String(c || '').trim().toUpperCase()).filter(Boolean))];
}

/** Respond to a PromoError (stable `code` for the app). Returns true if it was one. */
function respondIfPromoError(res, err) {
  if (err instanceof PromoError) {
    res.status(err.statusCode || 400).json({ success: false, error: err.message, message: err.message, code: err.code });
    return true;
  }
  return false;
}

/**
 * Fields persisted on Booking / Payment / PackagePurchase.
 * @param {object} quote
 * @param {Array} validated      [{ promoCode }] aligned with quote.appliedPromos
 * @param {Array} [redemptions]  created redemptions, same order (optional; adds redemptionId)
 */
function buildPromoFields(quote, validated = [], redemptions = []) {
  const appliedPromos = quote.appliedPromos.map((applied, i) => ({
    promoCodeId: validated[i] ? validated[i].promoCode._id : null,
    code: applied.code,
    fundedBy: applied.fundedBy,
    discountAmount: applied.discountAmount,
    redemptionId: redemptions[i] ? redemptions[i].redemptionId : null,
  }));
  return {
    appliedPromos,
    vatAmount: quote.vatAmount,
    rallyFundedDiscount: quote.rallyFundedDiscount,
    organiserFundedDiscount: quote.organiserFundedDiscount,
    // legacy fields older app builds still read
    promoCode: appliedPromos[0] ? appliedPromos[0].code : null,
    promoCodeId: appliedPromos[0] ? appliedPromos[0].promoCodeId : null,
    discountAmount: quote.discountAmount,
  };
}

/** Stripe metadata (all values are strings) describing the promo split. */
function buildPromoMetadata(quote, organiserId) {
  const funders = [...new Set(quote.appliedPromos.map((p) => p.fundedBy))];
  const meta = {
    originalAmount: String(quote.originalAmount),
    discountAmount: String(quote.discountAmount),
    rallyFundedDiscount: String(quote.rallyFundedDiscount),
    organiserFundedDiscount: String(quote.organiserFundedDiscount),
    promoCodes: quote.appliedPromos.map((p) => p.code).join(','),
    promoFundedBy: funders.length > 1 ? 'mixed' : funders[0] || '',
  };
  if (organiserId) {
    meta.organiserId = String(organiserId);
  }
  if (quote.appliedPromos[0]) {
    meta.promoCode = quote.appliedPromos[0].code; // legacy
  }
  return meta;
}

/** Same code set (order-insensitive)? Used to decide whether a pending booking can be reused. */
function sameCodeSet(booking, codes) {
  const existing = Array.isArray(booking.appliedPromos) && booking.appliedPromos.length > 0
    ? booking.appliedPromos.map((p) => p.code)
    : booking.promoCode ? [booking.promoCode] : [];
  const a = [...new Set(existing.map((c) => String(c).toUpperCase()))].sort().join(',');
  const b = [...codes].sort().join(',');
  return a === b;
}

/**
 * The player changed the promo codes on a pending booking: cancel its PaymentIntent, give back the
 * reservation and close the old booking so a fresh one can be created.
 * @returns {Promise<boolean>} false if the PaymentIntent can't be cancelled because payment is already underway
 */
async function supersedePendingBooking(booking, stripeInstance) {
  if (booking.paymentIntentId) {
    try {
      await stripeInstance.paymentIntents.cancel(booking.paymentIntentId);
    } catch (err) {
      let status = null;
      try {
        status = (await stripeInstance.paymentIntents.retrieve(booking.paymentIntentId)).status;
      } catch (e) {
        status = null;
      }
      if (status !== 'canceled') {
        return false; // succeeded / processing: don't touch it
      }
    }
    const payment = await Payment.findByStripePaymentIntentId(booking.paymentIntentId);
    if (payment) {
      await Payment.updateStatus(payment.paymentId || payment._id, 'failed');
    }
  }
  await promoRedemption.release({ bookingId: booking._id }, 'superseded');
  await Booking.updateStatus(booking.bookingId, 'failed');
  return true;
}

/**
 * Call only from the Payment.claimSuccess winner branch (webhook and verifyPayment).
 * Confirms the reserved redemption(s). Payments created before promo redemptions existed (no
 * redemption rows) fall back to the legacy usage counter.
 */
async function confirmPromoForPayment(payment, paymentIntentId) {
  const changed = await promoRedemption.confirm({ stripePaymentIntentId: paymentIntentId });
  const hasNewFields = Array.isArray(payment.appliedPromos) && payment.appliedPromos.length > 0;
  if (changed === 0 && payment.promoCodeId && !hasNewFields) {
    await PromoCode.incrementUsage(payment.promoCodeId);
  }
  return changed;
}

/** Promo fields of a Payment, as stored on a PackagePurchase. */
function promoFieldsFromPayment(payment) {
  return {
    promoCode: payment.promoCode || null,
    discountAmount: payment.discountAmount || 0,
    appliedPromos: payment.appliedPromos || [],
    vatAmount: payment.vatAmount || 0,
    rallyFundedDiscount: payment.rallyFundedDiscount || 0,
    organiserFundedDiscount: payment.organiserFundedDiscount || 0,
  };
}

module.exports = { promoFieldsFromPayment, confirmPromoForPayment, supersedePendingBooking, extractCodes, respondIfPromoError, buildPromoFields, buildPromoMetadata, sameCodeSet };
