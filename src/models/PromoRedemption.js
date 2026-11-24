const { getDB } = require('../config/database');
const { ObjectId } = require('mongodb');
const Counter = require('./Counter');

const STATUSES = ['reserved', 'confirmed', 'released', 'refunded'];
const TARGET_TYPES = ['event', 'package'];

function toObjectId(id) {
  if (id === null || id === undefined) {
    return null;
  }
  try {
    return typeof id === 'string' ? new ObjectId(id) : id;
  } catch (error) {
    throw new Error('Invalid ID format');
  }
}

/**
 * PromoRedemption Model
 * Immutable-by-design record of one promo code use (source of truth for tracking and
 * any future payout report). The reserve/confirm/release/refund state machine lives in
 * src/services/promoRedemption.service.js; this model only builds and stores records.
 */
class PromoRedemption {
  constructor(data) {
    this.redemptionId = data.redemptionId; // PRD1, PRD2, ...
    this.promoCodeId = data.promoCodeId; // promoCodes._id
    this.codeSnapshot = data.codeSnapshot; // code string at the time of use
    this.fundedBy = data.fundedBy; // 'rally' | 'organiser'
    this.discountType = data.discountType;
    this.discountValue = data.discountValue;

    this.userId = data.userId;
    this.organiserId = data.organiserId;

    this.targetType = data.targetType; // 'event' | 'package'
    this.eventId = data.eventId || null;
    this.parentEventId = data.parentEventId || null; // sequential id like E95
    this.occurrenceStart = data.occurrenceStart || null;
    this.packageId = data.packageId || null;

    this.bookingId = data.bookingId || null;
    this.packagePurchaseId = data.packagePurchaseId || null;
    this.paymentId = data.paymentId || null;
    this.stripePaymentIntentId = data.stripePaymentIntentId || null;

    this.originalAmount = data.originalAmount; // pre-VAT gross
    this.discountAmount = data.discountAmount; // this code's discount
    this.paidAmount = data.paidAmount; // pre-VAT, after all discounts
    this.vatAmount = data.vatAmount || 0;
    this.rallyDueAmount = data.rallyDueAmount || 0; // = discountAmount when fundedBy='rally', 0 once refunded

    this.status = data.status || 'reserved';
    this.reservedAt = data.reservedAt || new Date();
    this.expiresAt = data.expiresAt || null;
    this.confirmedAt = data.confirmedAt || null;
    this.releasedAt = data.releasedAt || null;
    this.releaseReason = data.releaseReason || null;

    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  /**
   * Insert a new redemption record. Normalises ids to ObjectIds and fills rallyDueAmount.
   */
  static async create(data) {
    if (!STATUSES.includes(data.status || 'reserved')) {
      throw new Error('Invalid redemption status');
    }
    if (!TARGET_TYPES.includes(data.targetType)) {
      throw new Error('targetType must be \'event\' or \'package\'');
    }

    const db = getDB();
    const redemptionId = await Counter.getNextPromoRedemptionId();

    const redemption = new PromoRedemption({
      ...data,
      redemptionId,
      promoCodeId: toObjectId(data.promoCodeId),
      userId: toObjectId(data.userId),
      organiserId: toObjectId(data.organiserId),
      eventId: toObjectId(data.eventId),
      packageId: toObjectId(data.packageId),
      bookingId: toObjectId(data.bookingId),
      packagePurchaseId: toObjectId(data.packagePurchaseId),
      paymentId: toObjectId(data.paymentId),
      rallyDueAmount: data.fundedBy === 'rally' ? data.discountAmount : 0,
    });

    const result = await db.collection('promoRedemptions').insertOne(redemption);
    return { _id: result.insertedId, ...redemption };
  }

  static async findByRedemptionId(redemptionId) {
    return getDB().collection('promoRedemptions').findOne({ redemptionId });
  }
}

PromoRedemption.STATUSES = STATUSES;
PromoRedemption.TARGET_TYPES = TARGET_TYPES;

module.exports = PromoRedemption;
