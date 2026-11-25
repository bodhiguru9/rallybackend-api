/**
 * Pricing service: the single place that turns (target, guests, promo codes) into a price.
 *
 * Used by POST /api/promo-codes/quote and (milestone 3) bookEvent, createPaymentOrder and
 * purchasePackage. The price is always loaded server-side; no client amount is trusted.
 *
 * Rules (promo-code-plan.md section 4.1):
 *   base      = (gameJoinPrice ?? eventPricePerGuest) x guests, or packagePrice
 *   discount  = capped at base; percentage codes honour maxDiscountAmount; rounded to 2 dp
 *   VAT       = 5% of the EVENT PRICE (originalAmount), not of the discounted price: round(base x 5%, 2).
 *               A booking that ends up free (subtotal 0) has no VAT. final = subtotal + VAT
 *               (e.g. 100 AED, 20% code -> subtotal 80, VAT 5, final 85)
 */
const { ObjectId } = require('mongodb');
const { getDB } = require('../config/database');
const PromoCode = require('../models/PromoCode');
const Package = require('../models/Package');
const { findEventById } = require('../utils/eventHelper');

const VAT_RATE = 0.05;
// Stripe rejects AED charges below this (final amount including VAT)
const STRIPE_MIN_AED = 2;
const MAX_PROMO_CODES_PER_ORDER = Math.max(1, parseInt(process.env.MAX_PROMO_CODES_PER_ORDER, 10) || 1);

/** Error with a stable code the app maps to a friendly message. */
class PromoError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'PromoError';
    this.code = code;
    this.statusCode = 400;
  }
}

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const toObjectId = (id) => {
  if (id instanceof ObjectId) {
    return id;
  }
  try {
    return new ObjectId(String(id));
  } catch (e) {
    return null;
  }
};

const sameId = (a, b) => !!a && !!b && String(a) === String(b);

/**
 * Discount one code gives on a given base amount (pure).
 * @returns {number} discount in AED, 2 dp, never above base
 */
function computeCodeDiscount(promoCode, base) {
  let discount = 0;
  if (promoCode.discountType === 'percentage') {
    discount = (base * promoCode.discountValue) / 100;
    if (promoCode.maxDiscountAmount) {
      discount = Math.min(discount, promoCode.maxDiscountAmount);
    }
  } else if (promoCode.discountType === 'fixed') {
    discount = promoCode.discountValue;
  }
  return round2(Math.min(Math.max(discount, 0), base));
}

/**
 * Combine already-validated codes into totals (pure).
 * @param {number} base pre-VAT price
 * @param {Array<{promoCode: object}>} codes validated codes (priority order)
 */
function buildTotals(base, codes) {
  let remaining = round2(base);
  const appliedPromos = [];
  let rallyFundedDiscount = 0;
  let organiserFundedDiscount = 0;

  for (const { promoCode } of codes) {
    const discountAmount = computeCodeDiscount(promoCode, remaining);
    remaining = round2(remaining - discountAmount);
    appliedPromos.push({ code: promoCode.code, fundedBy: promoCode.fundedBy, discountAmount });
    if (promoCode.fundedBy === 'rally') {
      rallyFundedDiscount = round2(rallyFundedDiscount + discountAmount);
    } else {
      organiserFundedDiscount = round2(organiserFundedDiscount + discountAmount);
    }
  }

  const originalAmount = round2(base);
  let subtotal = remaining;
  // VAT is charged on the event price, not on the discounted price. A fully discounted (free) booking has no VAT.
  const vatAmount = subtotal > 0 ? round2(originalAmount * VAT_RATE) : 0;
  let finalAmount = round2(subtotal + vatAmount);

  // A code must not leave a charge Stripe would reject (0 < total < STRIPE_MIN_AED): give back part of the
  // last code's discount so the player pays exactly the minimum, and the quote matches the charge.
  // VAT is fixed (5% of the price), so the subtotal that makes the total exactly 2.00 is 2 - VAT.
  if (appliedPromos.length > 0 && finalAmount > 0 && finalAmount < STRIPE_MIN_AED) {
    if (round2(originalAmount + vatAmount) < STRIPE_MIN_AED) {
      // The booking itself is below what Stripe accepts once VAT is added: a code can't make it payable
      throw new PromoError('NOT_APPLICABLE', 'Promo codes can\'t be used on this booking');
    }
    const minSubtotal = Math.max(0.01, round2(STRIPE_MIN_AED - vatAmount));
    const giveBack = round2(minSubtotal - subtotal);
    const last = appliedPromos[appliedPromos.length - 1];
    last.discountAmount = round2(last.discountAmount - giveBack);
    if (last.fundedBy === 'rally') {
      rallyFundedDiscount = round2(rallyFundedDiscount - giveBack);
    } else {
      organiserFundedDiscount = round2(organiserFundedDiscount - giveBack);
    }
    subtotal = minSubtotal;
    finalAmount = round2(subtotal + vatAmount);
  }
  const discountAmount = round2(originalAmount - subtotal);

  return {
    originalAmount,
    discountAmount,
    subtotal,
    vatAmount,
    finalAmount,
    appliedPromos,
    rallyFundedDiscount,
    organiserFundedDiscount,
  };
}

/** The target's price, owner and sports, loaded from the database. */
async function loadTarget({ targetType, eventId, packageId, guestsCount }) {
  if (targetType === 'package') {
    const pkg = packageId ? await Package.findById(packageId) : null;
    if (!pkg) {
      throw new PromoError('NOT_APPLICABLE', 'Package not found');
    }
    return {
      targetType,
      organiserId: pkg.organiserId,
      sports: pkg.sports || [],
      targetId: pkg._id,
      base: Number(pkg.packagePrice) || 0,
      event: null,
      pkg,
    };
  }

  const event = eventId ? await findEventById(eventId) : null;
  if (!event) {
    throw new PromoError('NOT_APPLICABLE', 'Event not found');
  }
  const guests = Number.isInteger(guestsCount) && guestsCount >= 1 ? guestsCount : 1;
  const unit = Number(event.gameJoinPrice ?? event.eventPricePerGuest ?? 0);
  return {
    targetType: 'event',
    organiserId: event.creatorId,
    sports: event.eventSports || [],
    targetId: event._id,
    base: (Number.isNaN(unit) ? 0 : unit) * guests,
    guests,
    event,
    pkg: null,
  };
}

/** Has this player ever completed a booking with this organiser (or on Rally when organiserId is null)? */
async function hasPriorBooking(userId, organiserId, db = getDB()) {
  const filter = { userId: toObjectId(userId), status: 'booked' };
  if (organiserId) {
    const orgObj = toObjectId(organiserId);
    const events = await db
      .collection('events')
      .find({ creatorId: { $in: [orgObj, String(organiserId)] } }, { projection: { _id: 1 } })
      .toArray();
    if (events.length === 0) {
      return false;
    }
    filter.eventId = { $in: events.map((e) => e._id) };
  }
  const found = await db.collection('bookings').findOne(filter, { projection: { _id: 1 } });
  return !!found;
}

async function isFollowing(userId, organiserId, db = getDB()) {
  const found = await db
    .collection('follows')
    .findOne({ followerId: toObjectId(userId), followingId: toObjectId(organiserId) }, { projection: { _id: 1 } });
  return !!found;
}

/** Player's reserved (not expired) + confirmed uses of a code, optionally ignoring one booking's own reservation. */
async function countUserRedemptions(userId, promoCodeId, excludeBookingId, db = getDB()) {
  const now = new Date();
  const filter = {
    userId: toObjectId(userId),
    promoCodeId,
    $or: [{ status: 'confirmed' }, { status: 'reserved', expiresAt: { $gt: now } }],
  };
  if (excludeBookingId) {
    filter.bookingId = { $ne: toObjectId(excludeBookingId) };
  }
  return db.collection('promoRedemptions').countDocuments(filter);
}

/** Validate one code against the target and the player. Throws PromoError. */
async function validateCode(promoCode, target, ctx) {
  const now = new Date();
  const { userId, excludeBookingId } = ctx;

  if (!promoCode.isActive) {
    throw new PromoError('PAUSED', 'This promo code is paused');
  }
  if (promoCode.validFrom && new Date(promoCode.validFrom) > now) {
    throw new PromoError('NOT_STARTED', 'This promo code is not active yet');
  }
  if (promoCode.validUntil && new Date(promoCode.validUntil) < now) {
    throw new PromoError('EXPIRED', 'This promo code has expired');
  }

  // Scope: target type, owner, sport, specific events/packages
  const appliesTo = promoCode.appliesTo || 'events';
  if (appliesTo !== 'both' && appliesTo !== `${target.targetType}s`) {
    throw new PromoError('NOT_APPLICABLE', 'This promo code does not apply to this booking');
  }
  if (promoCode.ownerType === 'organiser' && !sameId(promoCode.ownerId, target.organiserId)) {
    throw new PromoError('NOT_APPLICABLE', 'This promo code does not apply to this organiser');
  }
  if (Array.isArray(promoCode.sports) && promoCode.sports.length > 0) {
    const wanted = promoCode.sports.map((s) => String(s).toLowerCase());
    const has = (target.sports || []).some((s) => wanted.includes(String(s).toLowerCase()));
    if (!has) {
      throw new PromoError('NOT_APPLICABLE', 'This promo code does not apply to this sport');
    }
  }
  const scopedIds = target.targetType === 'package' ? promoCode.packageIds : promoCode.eventIds;
  if (Array.isArray(scopedIds) && scopedIds.length > 0 && !scopedIds.some((id) => sameId(id, target.targetId))) {
    throw new PromoError('NOT_APPLICABLE', 'This promo code does not apply to this booking');
  }

  // Eligibility
  if (promoCode.eligibility === 'first_booking') {
    const orgScope = promoCode.ownerType === 'organiser' ? target.organiserId : null;
    if (await hasPriorBooking(userId, orgScope)) {
      throw new PromoError('NOT_ELIGIBLE_FIRST_BOOKING', 'This promo code is for first bookings only');
    }
  } else if (promoCode.eligibility === 'subscribers') {
    if (!(await isFollowing(userId, target.organiserId))) {
      throw new PromoError('NOT_ELIGIBLE_SUBSCRIBERS', 'This promo code is for subscribers only');
    }
  }

  if (target.base <= 0) {
    throw new PromoError('NOT_APPLICABLE', 'Promo codes cannot be used on free bookings');
  }

  if (promoCode.minPurchaseAmount && target.base < promoCode.minPurchaseAmount) {
    throw new PromoError('MIN_PURCHASE', `Minimum purchase amount of AED ${promoCode.minPurchaseAmount} required`);
  }

  // Limits
  if (promoCode.usageLimit !== null && promoCode.usageLimit !== undefined) {
    let used = promoCode.usedCount || 0;
    if (excludeBookingId) {
      const own = await getDB()
        .collection('promoRedemptions')
        .countDocuments({ promoCodeId: promoCode._id, bookingId: toObjectId(excludeBookingId), status: 'reserved' });
      used -= own;
    }
    if (used >= promoCode.usageLimit) {
      throw new PromoError('LIMIT_REACHED', 'This promo code has been fully redeemed');
    }
  }
  if (promoCode.userUsageLimit !== null && promoCode.userUsageLimit !== undefined) {
    const used = await countUserRedemptions(userId, promoCode._id, excludeBookingId);
    if (used >= promoCode.userUsageLimit) {
      throw new PromoError('USER_LIMIT_REACHED', 'You have already used this promo code');
    }
  }
}

/**
 * Price a checkout, returning the quote plus the validated code documents (for reserve()).
 * @param {object} args { targetType, eventId, occurrenceStart, packageId, guestsCount, userId, codes[], excludeBookingId }
 * @throws {PromoError}
 */
async function quoteDetailed(args) {
  const rawCodes = Array.isArray(args.codes) ? args.codes : [];
  const codes = [...new Set(rawCodes.map((c) => String(c || '').trim().toUpperCase()).filter(Boolean))];

  if (codes.length > MAX_PROMO_CODES_PER_ORDER) {
    throw new PromoError('TOO_MANY_CODES', `Only ${MAX_PROMO_CODES_PER_ORDER} promo code(s) can be used per booking`);
  }

  const target = await loadTarget(args);
  const validated = [];
  for (const code of codes) {
    const promoCode = await PromoCode.findByCode(code);
    if (!promoCode) {
      throw new PromoError('INVALID', 'This promo code is not valid');
    }
    await validateCode(promoCode, target, args);
    validated.push({ promoCode });
  }

  if (validated.length > 1 && validated.some(({ promoCode }) => !promoCode.stackable)) {
    throw new PromoError('TOO_MANY_CODES', 'These promo codes cannot be combined');
  }
  validated.sort((a, b) => (b.promoCode.priority || 0) - (a.promoCode.priority || 0));

  const quote = buildTotals(target.base, validated);
  return { quote, validated, target };
}

/** Quote only (what the /quote endpoint returns). */
async function quote(args) {
  const { quote: result } = await quoteDetailed(args);
  return result;
}

module.exports = {
  quote,
  quoteDetailed,
  PromoError,
  MAX_PROMO_CODES_PER_ORDER,
  VAT_RATE,
  STRIPE_MIN_AED,
  // exported for unit tests
  round2,
  computeCodeDiscount,
  buildTotals,
};
