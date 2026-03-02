const { getDB } = require('../config/database');
const { ObjectId } = require('mongodb');
const Counter = require('./Counter');

/**
 * Payment Model
 * Handles payment transactions
 */
class Payment {
  constructor(data) {
    this.paymentId = data.paymentId; // Sequential payment ID (PAY1, PAY2, PAY3, etc.)
    this.userId = data.userId; // User who made the payment
    this.eventId = data.eventId; // Event for which payment was made
    this.amount = data.amount; // Original amount
    this.discountAmount = data.discountAmount || 0; // Discount from promo code
    this.finalAmount = data.finalAmount; // Final amount after discount
    this.promoCodeId = data.promoCodeId || null; // Promo code used (if any)
    this.promoCode = data.promoCode || null; // Promo code string (for reference)
    this.stripePaymentIntentId = data.stripePaymentIntentId; // Stripe Payment Intent ID
    this.stripePaymentId = data.stripePaymentId || null; // Stripe Payment ID
    this.stripePaymentMethod = data.stripePaymentMethod || null; // Stripe Payment Method ID
    this.status = data.status || 'pending'; // 'pending', 'success', 'failed', 'refunded'
    this.paymentMethod = data.paymentMethod || 'stripe'; // Payment method
    this.metadata = data.metadata || {}; // Additional metadata
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  /**
   * Create a new payment record
   */
  static async create(paymentData) {
    const db = getDB();
    const paymentsCollection = db.collection('payments');

    // Generate sequential payment ID with uniqueness verification
    const { getNextUniquePaymentId } = require('../utils/idManager');
    const paymentId = await getNextUniquePaymentId();

    // Convert IDs to ObjectIds
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
      paymentId: paymentId,
      userId,
      eventId,
      promoCodeId,
    });

    const result = await paymentsCollection.insertOne(payment);

    return {
      _id: result.insertedId,
      ...payment,
    };
  }

  /**
   * Find payment by Stripe Payment Intent ID
   */
  static async findByStripePaymentIntentId(paymentIntentId) {
    const db = getDB();
    const paymentsCollection = db.collection('payments');

    return await paymentsCollection.findOne({
      stripePaymentIntentId: paymentIntentId,
    });
  }

  /**
   * Find payment by ID (sequential ID like PAY1, PAY2, etc. or MongoDB ObjectId)
   */
  static async findById(paymentId) {
    const db = getDB();
    const paymentsCollection = db.collection('payments');

    // Check if it's a sequential ID (PAY1, PAY2, etc.)
    if (typeof paymentId === 'string' && paymentId.startsWith('PAY')) {
      return await paymentsCollection.findOne({ paymentId: paymentId });
    }

    // Otherwise, treat as MongoDB ObjectId
    let objectId;
    try {
      objectId = typeof paymentId === 'string' ? new ObjectId(paymentId) : paymentId;
    } catch (error) {
      return null;
    }

    return await paymentsCollection.findOne({ _id: objectId });
  }

  /**
   * Update payment status (by sequential ID or MongoDB ObjectId)
   */
  static async updateStatus(paymentId, status, stripePaymentId = null, stripePaymentMethod = null) {
    const db = getDB();
    const paymentsCollection = db.collection('payments');

    let query;
    // Check if it's a sequential ID (PAY1, PAY2, etc.)
    if (typeof paymentId === 'string' && paymentId.startsWith('PAY')) {
      query = { paymentId: paymentId };
    } else {
      // Otherwise, treat as MongoDB ObjectId
      let objectId;
      try {
        objectId = typeof paymentId === 'string' ? new ObjectId(paymentId) : paymentId;
      } catch (error) {
        return false;
      }
      query = { _id: objectId };
    }

    const updateData = {
      status,
      updatedAt: new Date(),
    };

    if (stripePaymentId) {
      updateData.stripePaymentId = stripePaymentId;
    }

    if (stripePaymentMethod) {
      updateData.stripePaymentMethod = stripePaymentMethod;
    }

    const result = await paymentsCollection.updateOne(
      query,
      { $set: updateData }
    );

    return result.modifiedCount > 0;
  }

  /**
   * Get payments by user
   * Accepts sequential userId (1, 2, 3, etc.) or MongoDB ObjectId
   */
  static async findByUser(userId, limit = 50, skip = 0) {
    const db = getDB();
    const paymentsCollection = db.collection('payments');
    const usersCollection = db.collection('users');

    let userObjectId;

    // Check if it's a sequential userId (number)
    if (!isNaN(userId) && parseInt(userId).toString() === userId.toString()) {
      // Find user by sequential userId
      const user = await usersCollection.findOne({ userId: parseInt(userId) });
      if (!user) {
        return [];
      }
      userObjectId = user._id;
    } else {
      // Treat as MongoDB ObjectId
      try {
        userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
      } catch (error) {
        return [];
      }
    }

    return await paymentsCollection
      .find({ userId: userObjectId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .toArray();
  }

  /**
   * Get payments by event
   */
  static async findByEvent(eventId, limit = 50, skip = 0) {
    const db = getDB();
    const paymentsCollection = db.collection('payments');

    let eventObjectId;
    try {
      eventObjectId = typeof eventId === 'string' ? new ObjectId(eventId) : eventId;
    } catch (error) {
      return [];
    }

    return await paymentsCollection
      .find({ eventId: eventObjectId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .toArray();
  }
}

module.exports = Payment;

