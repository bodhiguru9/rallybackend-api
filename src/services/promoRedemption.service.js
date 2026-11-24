/**
 * Promo redemption lifecycle (promo-code-plan.md section 4.2).
 *
 *   reserve  -> status 'reserved'  (usedCount +1, expiresAt = now + 30 min)
 *   confirm  -> status 'confirmed' (payment succeeded; idempotent)
 *   release  -> status 'released'  (payment failed / abandoned / expired; usedCount -1)
 *   refund   -> status 'refunded'  (booking cancelled after payment; usedCount -1, rallyDueAmount 0)
 *
 * usedCount on the promo code always equals reserved + confirmed redemptions. Every state change is an
 * atomic findOneAndUpdate filtered on the expected current status, so repeats and races are no-ops.
 */
const { ObjectId } = require('mongodb');
const { getDB } = require('../config/database');
const PromoRedemption = require('../models/PromoRedemption');
const { PromoError } = require('./pricing.service');

const RESERVATION_MINUTES = 30;
const SWEEP_INTERVAL_MS = 60 * 1000;

const toObjectId = (id) => (id === null || id === undefined ? null : id instanceof ObjectId ? id : new ObjectId(String(id)));

/** findOneAndUpdate returns the document (driver 6+) or { value } (older); normalise. */
const unwrap = (r) => (r && !r._id && Object.prototype.hasOwnProperty.call(r, 'value') ? r.value : r);

const codes = () => getDB().collection('promoCodes');
const redemptions = () => getDB().collection('promoRedemptions');

async function decrementUsed(promoCodeId) {
  await codes().updateOne({ _id: promoCodeId, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 }, $set: { updatedAt: new Date() } });
}

/** Match filter for "the redemptions of this order". Accepts any of the ids. */
function orderFilter({ bookingId, paymentId, stripePaymentIntentId, packagePurchaseId, redemptionIds }) {
  const f = {};
  if (redemptionIds && redemptionIds.length) {
    f._id = { $in: redemptionIds.map(toObjectId) };
  }
  if (bookingId) {
    f.bookingId = toObjectId(bookingId);
  }
  if (paymentId) {
    f.paymentId = toObjectId(paymentId);
  }
  if (stripePaymentIntentId) {
    f.stripePaymentIntentId = stripePaymentIntentId;
  }
  if (packagePurchaseId) {
    f.packagePurchaseId = toObjectId(packagePurchaseId);
  }
  if (Object.keys(f).length === 0) {
    throw new Error('A redemption identifier is required');
  }
  return f;
}

/**
 * Reserve every validated code of a quote. All-or-nothing: if any code can't be reserved, the ones already
 * reserved are rolled back and a PromoError is thrown.
 *
 * @param {object} p
 * @param {object} p.quote       result of pricing.quote
 * @param {Array}  p.validated   validated codes from pricing.quoteDetailed ([{ promoCode }])
 * @param {object} p.target      target from pricing.quoteDetailed
 * @param {string|ObjectId} p.userId
 * @param {object} [p.context]   { bookingId, paymentId, stripePaymentIntentId, packagePurchaseId, occurrenceStart }
 * @returns {Promise<object[]>} the created redemption documents
 */
async function reserve({ quote, validated, target, userId, context = {} }) {
  const created = [];
  const now = new Date();
  const expiresAt = new Date(now.getTime() + RESERVATION_MINUTES * 60 * 1000);

  const rollback = async () => {
    for (const r of created) {
      await redemptions().updateOne({ _id: r._id, status: 'reserved' }, { $set: { status: 'released', releasedAt: new Date(), releaseReason: 'reserve_failed', updatedAt: new Date() } });
      await decrementUsed(r.promoCodeId);
    }
  };

  try {
    for (let i = 0; i < validated.length; i++) {
      const { promoCode } = validated[i];
      const applied = quote.appliedPromos[i];

      // Atomic "use one": succeeds only while the code is live and under its total limit
      const updated = unwrap(
        await codes().findOneAndUpdate(
          {
            _id: promoCode._id,
            isActive: true,
            archivedAt: null,
            $or: [{ usageLimit: null }, { usageLimit: { $exists: false } }, { $expr: { $lt: ['$usedCount', '$usageLimit'] } }],
          },
          { $inc: { usedCount: 1 }, $set: { updatedAt: now } },
          { returnDocument: 'after' }
        )
      );
      if (!updated) {
        throw new PromoError('LIMIT_REACHED', 'This promo code has been fully redeemed');
      }

      let redemption;
      try {
        redemption = await PromoRedemption.create({
          promoCodeId: promoCode._id,
          codeSnapshot: promoCode.code,
          fundedBy: promoCode.fundedBy,
          discountType: promoCode.discountType,
          discountValue: promoCode.discountValue,
          userId,
          organiserId: target.organiserId,
          targetType: target.targetType,
          eventId: target.event ? target.event._id : null,
          parentEventId: target.event ? target.event.eventId || null : null,
          occurrenceStart: context.occurrenceStart || null,
          packageId: target.pkg ? target.pkg._id : null,
          bookingId: context.bookingId || null,
          packagePurchaseId: context.packagePurchaseId || null,
          paymentId: context.paymentId || null,
          stripePaymentIntentId: context.stripePaymentIntentId || null,
          originalAmount: quote.originalAmount,
          discountAmount: applied.discountAmount,
          paidAmount: quote.subtotal,
          vatAmount: quote.vatAmount,
          status: 'reserved',
          reservedAt: now,
          expiresAt,
        });
      } catch (err) {
        await decrementUsed(promoCode._id); // roll back the increment if the insert fails
        throw err;
      }
      created.push(redemption);

      // Per-player limit under concurrency: re-count after inserting; back out if we went over
      if (promoCode.userUsageLimit !== null && promoCode.userUsageLimit !== undefined) {
        const mine = await redemptions().countDocuments({
          userId: toObjectId(userId),
          promoCodeId: promoCode._id,
          $or: [{ status: 'confirmed' }, { status: 'reserved', expiresAt: { $gt: now } }],
        });
        if (mine > promoCode.userUsageLimit) {
          throw new PromoError('USER_LIMIT_REACHED', 'You have already used this promo code');
        }
      }
    }
  } catch (err) {
    await rollback();
    throw err;
  }
  return created;
}

/** Attach checkout ids to reserved redemptions once the booking/payment/PaymentIntent exist. */
async function attach(redemptionIds, ids) {
  const set = { updatedAt: new Date() };
  for (const k of ['bookingId', 'paymentId', 'packagePurchaseId']) {
    if (ids[k]) {
      set[k] = toObjectId(ids[k]);
    }
  }
  if (ids.stripePaymentIntentId) {
    set.stripePaymentIntentId = ids.stripePaymentIntentId;
  }
  await redemptions().updateMany({ _id: { $in: redemptionIds.map(toObjectId) } }, { $set: set });
}

/**
 * Confirm after payment success. Idempotent. Call only from the Payment.claimSuccess winner branch.
 * A redemption the sweeper already released (late payment) is re-claimed, because the player has paid.
 * @returns {Promise<number>} how many redemptions changed to confirmed
 */
async function confirm(ids) {
  const filter = orderFilter(ids);
  const now = new Date();
  let changed = 0;

  const rows = await redemptions().find({ ...filter, status: { $in: ['reserved', 'released'] } }).toArray();
  for (const row of rows) {
    const res = unwrap(
      await redemptions().findOneAndUpdate(
        { _id: row._id, status: row.status },
        { $set: { status: 'confirmed', confirmedAt: now, releasedAt: null, releaseReason: null, expiresAt: null, updatedAt: now } },
        { returnDocument: 'after' }
      )
    );
    if (res) {
      changed++;
      if (row.status === 'released') {
        await codes().updateOne({ _id: row.promoCodeId }, { $inc: { usedCount: 1 }, $set: { updatedAt: now } });
      }
    }
  }
  return changed;
}

/** Give back the use of reserved redemptions (payment failed/cancelled, abandoned, code set changed). Idempotent. */
async function release(ids, reason = 'released') {
  const filter = orderFilter(ids);
  const now = new Date();
  let changed = 0;

  const rows = await redemptions().find({ ...filter, status: 'reserved' }).toArray();
  for (const row of rows) {
    const res = unwrap(
      await redemptions().findOneAndUpdate(
        { _id: row._id, status: 'reserved' },
        { $set: { status: 'released', releasedAt: now, releaseReason: reason, rallyDueAmount: 0, updatedAt: now } }
      )
    );
    if (res) {
      changed++;
      await decrementUsed(row.promoCodeId);
    }
  }
  return changed;
}

/** A paid booking was cancelled/refunded: mark refunded, zero the Rally top-up, give the use back. Idempotent. */
async function refund(ids, reason = 'refunded') {
  const filter = orderFilter(ids);
  const now = new Date();
  let changed = 0;

  const rows = await redemptions().find({ ...filter, status: 'confirmed' }).toArray();
  for (const row of rows) {
    const res = unwrap(
      await redemptions().findOneAndUpdate(
        { _id: row._id, status: 'confirmed' },
        { $set: { status: 'refunded', rallyDueAmount: 0, releasedAt: now, releaseReason: reason, updatedAt: now } }
      )
    );
    if (res) {
      changed++;
      await decrementUsed(row.promoCodeId);
    }
  }
  return changed;
}

/** Free (0 AED) checkout: reserve and confirm in one go. */
async function reserveAndConfirm(args) {
  const created = await reserve(args);
  await confirm({ redemptionIds: created.map((r) => r._id) });
  return created;
}

/**
 * Release reserved redemptions past expiresAt and cancel their still-pending PaymentIntents.
 * If a PaymentIntent can't be cancelled (e.g. it already succeeded) the reservation is left for the webhook.
 * @param {object} [opts] { now, cancelPaymentIntent: async (id) => void }
 */
async function sweepExpired({ now = new Date(), cancelPaymentIntent } = {}) {
  const stale = await redemptions().find({ status: 'reserved', expiresAt: { $lte: now } }).limit(200).toArray();
  let released = 0;
  let skipped = 0;

  for (const row of stale) {
    if (row.stripePaymentIntentId && cancelPaymentIntent) {
      try {
        await cancelPaymentIntent(row.stripePaymentIntentId);
      } catch (err) {
        skipped++;
        console.warn(`[promo-sweeper] could not cancel ${row.stripePaymentIntentId}: ${err.message}`);
        continue;
      }
    }
    released += await release({ redemptionIds: [row._id] }, 'expired');
  }
  return { released, skipped };
}

let sweeperTimer = null;

/** Start the periodic sweeper (idempotent, safe in every process: transitions are atomic). */
function startSweeper(intervalMs = SWEEP_INTERVAL_MS) {
  if (sweeperTimer) {
    return sweeperTimer;
  }
  const cancelPaymentIntent = async (id) => {
    if (!process.env.STRIPE_SECRET_KEY) {
      return;
    }
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    await stripe.paymentIntents.cancel(id);
  };
  sweeperTimer = setInterval(async () => {
    try {
      const r = await sweepExpired({ cancelPaymentIntent });
      if (r.released > 0 || r.skipped > 0) {
        console.log('[promo-sweeper]', r);
      }
    } catch (err) {
      console.error('[promo-sweeper] failed:', err.message);
    }
  }, intervalMs);
  if (sweeperTimer.unref) {
    sweeperTimer.unref();
  }
  return sweeperTimer;
}

function stopSweeper() {
  if (sweeperTimer) {
    clearInterval(sweeperTimer);
    sweeperTimer = null;
  }
}

module.exports = {
  RESERVATION_MINUTES,
  reserve,
  attach,
  confirm,
  release,
  refund,
  reserveAndConfirm,
  sweepExpired,
  startSweeper,
  stopSweeper,
};
