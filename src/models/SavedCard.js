const { getDB } = require('../config/database');
const { ObjectId } = require('mongodb');
const { getNextUniqueCardId } = require('../utils/idManager');

/**
 * SavedCard Model
 *
 * IMPORTANT (PCI):
 * - Do NOT store full card number (PAN) or CVV in the database.
 * - Store only a tokenized reference (e.g., Stripe PaymentMethod ID) and non-sensitive metadata.
 */
class SavedCard {
  constructor(data) {
    this.cardId = data.cardId; // Sequential/custom card ID (CARD1, CARD2, ...)
    this.userId = data.userId; // ObjectId
    this.stripePaymentMethodId = data.stripePaymentMethodId; // string (pm_...)
    this.brand = data.brand || null; // e.g. "visa"
    this.last4 = data.last4 || null; // e.g. "4242"
    this.cardNumber = data.cardNumber || null; // Full or masked card number (optional)
    this.expiry = data.expiry || null; // Expiry date string (e.g., "12/25" or "12/2025")
    this.expMonth = data.expMonth || null; // number
    this.expYear = data.expYear || null; // number
    this.cardHolderName = data.cardHolderName || null; // optional
    this.isDefault = data.isDefault || false;
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  static collection() {
    const db = getDB();
    return db.collection('savedCards');
  }

  static async createIndexes() {
    const col = this.collection();
    await col.createIndex({ cardId: 1 }, { unique: true });
    await col.createIndex({ userId: 1, stripePaymentMethodId: 1 }, { unique: true });
    await col.createIndex({ userId: 1, isDefault: 1 });
    await col.createIndex({ createdAt: -1 });
  }

  static async create(data) {
    const col = this.collection();

    let userObjectId;
    try {
      userObjectId = typeof data.userId === 'string' ? new ObjectId(data.userId) : data.userId;
    } catch (e) {
      throw new Error('Invalid user ID format');
    }

    const cardId = await getNextUniqueCardId();

    const doc = new SavedCard({
      ...data,
      cardId,
      userId: userObjectId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await col.insertOne(doc);
    return { _id: result.insertedId, ...doc };
  }

  static async findByUser(userId) {
    if (!userId) {
      console.warn('[DEBUG] SavedCard.findByUser called without userId');
      return [];
    }
    const col = this.collection();
    const userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
    
    // DEBUG LOGS
    console.log(`[DEBUG] SavedCard.findByUser - Original userId: ${userId} (Type: ${typeof userId})`);
    console.log(`[DEBUG] SavedCard.findByUser - Querying with userObjectId: ${userObjectId} (Type: ${typeof userObjectId}, IsObjectId: ${userObjectId instanceof ObjectId})`);
    
    const results = await col.find({ userId: userObjectId }).sort({ isDefault: -1, createdAt: -1 }).toArray();
    console.log(`[DEBUG] SavedCard.findByUser - Results count: ${results.length}`);
    
    return results;
  }

  static async findByIdForUser(cardId, userId) {
    const col = this.collection();
    const userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;

    // Primary lookup by custom cardId
    const byCardId = await col.findOne({ cardId: String(cardId), userId: userObjectId });
    if (byCardId) return byCardId;

    // Backward-compat fallback: allow Mongo _id lookup if a legacy record exists
    try {
      const cardObjectId = typeof cardId === 'string' ? new ObjectId(cardId) : cardId;
      return await col.findOne({ _id: cardObjectId, userId: userObjectId });
    } catch (e) {
      return null;
    }
  }

  static async setDefault(cardId, userId) {
    const col = this.collection();
    const userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;

    // Unset any existing default
    await col.updateMany({ userId: userObjectId, isDefault: true }, { $set: { isDefault: false, updatedAt: new Date() } });

    const result = await col.updateOne(
      { cardId: String(cardId), userId: userObjectId },
      { $set: { isDefault: true, updatedAt: new Date() } }
    );

    return result.modifiedCount > 0;
  }

  static async updateForUser(cardId, userId, updateData) {
    const col = this.collection();
    const userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;

    const $set = { updatedAt: new Date() };
    if (updateData.cardHolderName !== undefined) $set.cardHolderName = updateData.cardHolderName;
    if (updateData.isDefault !== undefined) $set.isDefault = !!updateData.isDefault;

    // If setting default true, ensure only one default
    if (updateData.isDefault === true) {
      await col.updateMany({ userId: userObjectId, isDefault: true }, { $set: { isDefault: false, updatedAt: new Date() } });
    }

    const result = await col.updateOne({ cardId: String(cardId), userId: userObjectId }, { $set });
    return result.modifiedCount > 0;
  }

  static async deleteForUser(cardId, userId) {
    const col = this.collection();
    const userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
    const result = await col.deleteOne({ cardId: String(cardId), userId: userObjectId });

    // Backward-compat fallback
    if (result.deletedCount === 0) {
      try {
        const cardObjectId = typeof cardId === 'string' ? new ObjectId(cardId) : cardId;
        const legacyResult = await col.deleteOne({ _id: cardObjectId, userId: userObjectId });
        return legacyResult.deletedCount > 0;
      } catch (e) {
        return false;
      }
    }
    return result.deletedCount > 0;
  }
}

module.exports = SavedCard;

