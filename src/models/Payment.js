const { getDB } = require('../config/database');
const { ObjectId } = require('mongodb');
const Counter = require('./Counter');

class Payment {
  constructor(data) {
    this.paymentId = data.paymentId;
    this.userId = data.userId;
    this.eventId = data.eventId; // Parent event Mongo _id
    this.parentEventId = data.parentEventId || null; // Sequential eventId like E95
    this.bookingId = data.bookingId || null;
    this.occurrenceStart = data.occurrenceStart || null;
    this.occurrenceEnd = data.occurrenceEnd || null;

    this.amount = data.amount;
    this.discountAmount = data.discountAmount || 0;
    this.finalAmount = data.finalAmount;
    this.promoCodeId = data.promoCodeId || null;
    this.promoCode = data.promoCode || null;
    this.stripePaymentIntentId = data.stripePaymentIntentId;
    this.stripePaymentId = data.stripePaymentId || null;
    this.stripePaymentMethod = data.stripePaymentMethod || null;
    this.status = data.status || 'pending';
    this.paymentMethod = data.paymentMethod || 'stripe';
    this.metadata = data.metadata || {};

    this.refundId = data.refundId || null;
    this.refundStatus = data.refundStatus || null;
    this.refundAmount = data.refundAmount || 0;
    this.refundedAt = data.refundedAt || null;
    this.refundReason = data.refundReason || null;

    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  static async create(paymentData) {
    const db = getDB();
    const paymentsCollection = db.collection('payments');

    const { getNextUniquePaymentId } = require('../utils/idManager');
    const paymentId = await getNextUniquePaymentId();

    let userId, eventId, promoCodeId;
    try {
      userId = typeof paymentData.userId === 'string' ? new ObjectId(paymentData.userId) : paymentData.userId;
      eventId = typeof paymentData.eventId === 'string' ? new ObjectId(paymentData.eventId) : paymentData.eventId;
      if (paymentData.promoCodeId) {
        promoCodeId = typeof paymentData.promoCodeId === 'string' ? new ObjectId(paymentData.promoCodeId) : paymentData.promoCodeId;
      }
    } catch (error) {
      throw new Error('Invalid ID format');
    }

    const payment = new Payment({
      ...paymentData,
      paymentId,
      userId,
      eventId,
      promoCodeId,
      occurrenceStart: paymentData.occurrenceStart ? new Date(paymentData.occurrenceStart).toISOString() : null,
      occurrenceEnd: paymentData.occurrenceEnd ? new Date(paymentData.occurrenceEnd).toISOString() : null,
    });

    const result = await paymentsCollection.insertOne(payment);

    return {
      _id: result.insertedId,
      ...payment,
    };
  }

  static async findByStripePaymentIntentId(paymentIntentId) {
    const db = getDB();
    const paymentsCollection = db.collection('payments');

    return await paymentsCollection.findOne({
      stripePaymentIntentId: paymentIntentId,
    });
  }

  static async findById(paymentId) {
    const db = getDB();
    const paymentsCollection = db.collection('payments');

    if (typeof paymentId === 'string' && paymentId.startsWith('PAY')) {
      return await paymentsCollection.findOne({ paymentId });
    }

    let objectId;
    try {
      objectId = typeof paymentId === 'string' ? new ObjectId(paymentId) : paymentId;
    } catch (error) {
      return null;
    }

    return await paymentsCollection.findOne({ _id: objectId });
  }

  static buildQuery(paymentId) {
    if (typeof paymentId === 'string' && paymentId.startsWith('PAY')) {
      return { paymentId };
    }

    try {
      const objectId = typeof paymentId === 'string' ? new ObjectId(paymentId) : paymentId;
      return { _id: objectId };
    } catch (error) {
      return null;
    }
  }

  static async updateStatus(paymentId, status, stripePaymentId = null, stripePaymentMethod = null) {
    const db = getDB();
    const paymentsCollection = db.collection('payments');

    const query = this.buildQuery(paymentId);
    if (!query) return false;

    const updateData = {
      status,
      updatedAt: new Date(),
    };

    if (stripePaymentId) updateData.stripePaymentId = stripePaymentId;
    if (stripePaymentMethod) updateData.stripePaymentMethod = stripePaymentMethod;

    const result = await paymentsCollection.updateOne(query, { $set: updateData });
    return result.modifiedCount > 0;
  }

  static async markRefunded(paymentId, refundData = {}) {
    const db = getDB();
    const paymentsCollection = db.collection('payments');

    const query = this.buildQuery(paymentId);
    if (!query) return false;

    const updateData = {
      status: 'refunded',
      refundId: refundData.refundId || null,
      refundStatus: refundData.refundStatus || 'succeeded',
      refundAmount: refundData.refundAmount || 0,
      refundedAt: refundData.refundedAt || new Date(),
      refundReason: refundData.refundReason || 'Refund processed',
      updatedAt: new Date(),
    };

    const result = await paymentsCollection.updateOne(query, { $set: updateData });
    return result.modifiedCount > 0;
  }

  static async markRefundNotEligible(paymentId, reason = 'Refund not eligible') {
    const db = getDB();
    const paymentsCollection = db.collection('payments');

    const query = this.buildQuery(paymentId);
    if (!query) return false;

    const result = await paymentsCollection.updateOne(query, {
      $set: {
        refundStatus: 'not_eligible',
        refundReason: reason,
        updatedAt: new Date(),
      },
    });

    return result.modifiedCount > 0;
  }

  static async markRefundFailed(paymentId, reason = 'Refund failed') {
    const db = getDB();
    const paymentsCollection = db.collection('payments');

    const query = this.buildQuery(paymentId);
    if (!query) return false;

    const result = await paymentsCollection.updateOne(query, {
      $set: {
        refundStatus: 'failed',
        refundReason: reason,
        updatedAt: new Date(),
      },
    });

    return result.modifiedCount > 0;
  }
}

module.exports = Payment;