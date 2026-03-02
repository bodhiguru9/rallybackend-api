const { getDB } = require('../config/database');
const { ObjectId } = require('mongodb');
const Counter = require('./Counter');

/**
 * PromoCode Model
 * Handles promo code creation and management
 */
class PromoCode {
  constructor(data) {
    this.promoCodeId = data.promoCodeId; // Sequential promo code ID (PRO1, PRO2, PRO3, etc.)
    this.code = data.code; // Promo code string (e.g., "SUMMER20")
    this.description = data.description || null; // Description of the promo code
    this.discountType = data.discountType; // 'percentage' or 'fixed'
    this.discountValue = data.discountValue; // Discount amount (percentage or fixed amount)
    this.minPurchaseAmount = data.minPurchaseAmount || 0; // Minimum purchase amount to use this code
    this.maxDiscountAmount = data.maxDiscountAmount || null; // Maximum discount amount (for percentage discounts)
    this.eventIds = data.eventIds || []; // Array of event IDs this promo code applies to (empty = all events)
    this.usageLimit = data.usageLimit || null; // Total usage limit (null = unlimited)
    this.usedCount = data.usedCount || 0; // Current usage count
    this.userUsageLimit = data.userUsageLimit || 1; // How many times a single user can use this code
    this.validFrom = data.validFrom || new Date(); // Start date
    this.validUntil = data.validUntil || null; // End date (null = no expiry)
    this.isActive = data.isActive !== undefined ? data.isActive : true; // Active status
    this.createdBy = data.createdBy; // Admin/organiser who created this code
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  /**
   * Create a new promo code
   */
  static async create(promoCodeData) {
    const db = getDB();
    const promoCodesCollection = db.collection('promoCodes');

    // Check if code already exists
    const existing = await promoCodesCollection.findOne({
      code: promoCodeData.code.toUpperCase(),
    });

    if (existing) {
      throw new Error('Promo code already exists');
    }

    // Generate sequential promo code ID
    const promoCodeId = await Counter.getNextPromoCodeId();

    // Convert eventIds to ObjectIds if provided
    let eventIds = [];
    if (promoCodeData.eventIds && Array.isArray(promoCodeData.eventIds)) {
      eventIds = promoCodeData.eventIds.map((id) => {
        try {
          return typeof id === 'string' ? new ObjectId(id) : id;
        } catch (error) {
          return null;
        }
      }).filter((id) => id !== null);
    }

    const promoCode = new PromoCode({
      ...promoCodeData,
      promoCodeId: promoCodeId,
      code: promoCodeData.code.toUpperCase(),
      eventIds: eventIds,
    });

    const result = await promoCodesCollection.insertOne(promoCode);

    return {
      _id: result.insertedId,
      ...promoCode,
    };
  }

  /**
   * Find promo code by code string
   */
  static async findByCode(code) {
    const db = getDB();
    const promoCodesCollection = db.collection('promoCodes');

    return await promoCodesCollection.findOne({
      code: code.toUpperCase(),
    });
  }

  /**
   * Find promo code by ID (sequential ID like PRO1, PRO2, etc. or MongoDB ObjectId)
   */
  static async findById(promoCodeId) {
    const db = getDB();
    const promoCodesCollection = db.collection('promoCodes');

    // Check if it's a sequential ID (PRO1, PRO2, etc.)
    if (typeof promoCodeId === 'string' && promoCodeId.startsWith('PRO')) {
      return await promoCodesCollection.findOne({ promoCodeId: promoCodeId });
    }

    // Otherwise, treat as MongoDB ObjectId
    let objectId;
    try {
      objectId = typeof promoCodeId === 'string' ? new ObjectId(promoCodeId) : promoCodeId;
    } catch (error) {
      return null;
    }

    return await promoCodesCollection.findOne({ _id: objectId });
  }

  /**
   * Get all promo codes with filters
   */
  static async findAll(filters = {}, limit = 50, skip = 0) {
    const db = getDB();
    const promoCodesCollection = db.collection('promoCodes');

    const query = {};

    if (filters.isActive !== undefined) {
      query.isActive = filters.isActive;
    }

    if (filters.eventId) {
      let eventObjectId;
      try {
        eventObjectId = typeof filters.eventId === 'string' ? new ObjectId(filters.eventId) : filters.eventId;
        query.$or = [
          { eventIds: { $size: 0 } }, // Applies to all events
          { eventIds: eventObjectId }, // Applies to this specific event
        ];
      } catch (error) {
        return [];
      }
    }

    return await promoCodesCollection
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .toArray();
  }

  /**
   * Validate and apply promo code
   * Returns discount amount if valid, throws error if invalid
   */
  static async validateAndApply(code, eventId, userId, amount) {
    const db = getDB();
    const promoCodesCollection = db.collection('promoCodes');
    const paymentsCollection = db.collection('payments');

    // Find promo code
    const promoCode = await this.findByCode(code);
    if (!promoCode) {
      throw new Error('Invalid promo code');
    }

    // Check if active
    if (!promoCode.isActive) {
      throw new Error('Promo code is not active');
    }

    // Check validity dates
    const now = new Date();
    if (promoCode.validFrom && new Date(promoCode.validFrom) > now) {
      throw new Error('Promo code is not yet valid');
    }

    if (promoCode.validUntil && new Date(promoCode.validUntil) < now) {
      throw new Error('Promo code has expired');
    }

    // Check if applies to this event
    if (promoCode.eventIds && promoCode.eventIds.length > 0) {
      let eventObjectId;
      try {
        eventObjectId = typeof eventId === 'string' ? new ObjectId(eventId) : eventId;
        const eventIdString = eventObjectId.toString();
        const isValidEvent = promoCode.eventIds.some((id) => id.toString() === eventIdString);
        if (!isValidEvent) {
          throw new Error('Promo code does not apply to this event');
        }
      } catch (error) {
        throw new Error('Promo code does not apply to this event');
      }
    }

    // Check minimum purchase amount
    if (amount < promoCode.minPurchaseAmount) {
      throw new Error(`Minimum purchase amount of ₹${promoCode.minPurchaseAmount} required`);
    }

    // Check total usage limit
    if (promoCode.usageLimit && promoCode.usedCount >= promoCode.usageLimit) {
      throw new Error('Promo code usage limit reached');
    }

    // Check user usage limit
    if (userId) {
      let userObjectId;
      try {
        userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
      } catch (error) {
        throw new Error('Invalid user ID');
      }

      const userUsageCount = await paymentsCollection.countDocuments({
        userId: userObjectId,
        promoCodeId: promoCode._id,
        status: 'success',
      });

      if (userUsageCount >= promoCode.userUsageLimit) {
        throw new Error('You have reached the maximum usage limit for this promo code');
      }
    }

    // Calculate discount
    let discountAmount = 0;
    if (promoCode.discountType === 'percentage') {
      discountAmount = (amount * promoCode.discountValue) / 100;
      if (promoCode.maxDiscountAmount) {
        discountAmount = Math.min(discountAmount, promoCode.maxDiscountAmount);
      }
    } else if (promoCode.discountType === 'fixed') {
      discountAmount = Math.min(promoCode.discountValue, amount);
    }

    return {
      promoCode: promoCode,
      discountAmount: discountAmount,
      finalAmount: amount - discountAmount,
    };
  }

  /**
   * Update promo code (by sequential ID or MongoDB ObjectId)
   */
  static async updateById(promoCodeId, updateData) {
    const db = getDB();
    const promoCodesCollection = db.collection('promoCodes');

    let query;
    // Check if it's a sequential ID (PRO1, PRO2, etc.)
    if (typeof promoCodeId === 'string' && promoCodeId.startsWith('PRO')) {
      query = { promoCodeId: promoCodeId };
    } else {
      // Otherwise, treat as MongoDB ObjectId
      let objectId;
      try {
        objectId = typeof promoCodeId === 'string' ? new ObjectId(promoCodeId) : promoCodeId;
      } catch (error) {
        return false;
      }
      query = { _id: objectId };
    }

    // Convert eventIds to ObjectIds if provided
    if (updateData.eventIds && Array.isArray(updateData.eventIds)) {
      updateData.eventIds = updateData.eventIds.map((id) => {
        try {
          return typeof id === 'string' ? new ObjectId(id) : id;
        } catch (error) {
          return null;
        }
      }).filter((id) => id !== null);
    }

    updateData.updatedAt = new Date();

    const result = await promoCodesCollection.updateOne(
      query,
      { $set: updateData }
    );

    return result.modifiedCount > 0;
  }

  /**
   * Delete promo code (by sequential ID or MongoDB ObjectId)
   */
  static async deleteById(promoCodeId) {
    const db = getDB();
    const promoCodesCollection = db.collection('promoCodes');

    let query;
    // Check if it's a sequential ID (PRO1, PRO2, etc.)
    if (typeof promoCodeId === 'string' && promoCodeId.startsWith('PRO')) {
      query = { promoCodeId: promoCodeId };
    } else {
      // Otherwise, treat as MongoDB ObjectId
      let objectId;
      try {
        objectId = typeof promoCodeId === 'string' ? new ObjectId(promoCodeId) : promoCodeId;
      } catch (error) {
        return false;
      }
      query = { _id: objectId };
    }

    const result = await promoCodesCollection.deleteOne(query);
    return result.deletedCount > 0;
  }

  /**
   * Increment usage count (by sequential ID or MongoDB ObjectId)
   */
  static async incrementUsage(promoCodeId) {
    const db = getDB();
    const promoCodesCollection = db.collection('promoCodes');

    let query;
    // Check if it's a sequential ID (PRO1, PRO2, etc.)
    if (typeof promoCodeId === 'string' && promoCodeId.startsWith('PRO')) {
      query = { promoCodeId: promoCodeId };
    } else {
      // Otherwise, treat as MongoDB ObjectId
      let objectId;
      try {
        objectId = typeof promoCodeId === 'string' ? new ObjectId(promoCodeId) : promoCodeId;
      } catch (error) {
        return false;
      }
      query = { _id: objectId };
    }

    const result = await promoCodesCollection.updateOne(
      query,
      { $inc: { usedCount: 1 } }
    );

    return result.modifiedCount > 0;
  }
}

module.exports = PromoCode;

