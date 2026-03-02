const { getDB } = require('../config/database');
const { ObjectId } = require('mongodb');

/**
 * PackagePurchase Model
 * Handles player package purchases and usage tracking
 */
class PackagePurchase {
  constructor(data) {
    this.purchaseId = data.purchaseId; // Sequential purchase ID
    this.userId = data.userId; // Player who purchased
    this.packageId = data.packageId; // Package that was purchased
    this.organiserId = data.organiserId; // Organiser who created the package
    this.purchaseDate = data.purchaseDate || new Date(); // When package was purchased
    this.expiryDate = data.expiryDate; // When package expires
    this.eventsJoined = data.eventsJoined || 0; // Number of events joined using this package
    this.maxEvents = data.maxEvents; // Maximum events allowed in package
    this.isActive = data.isActive !== undefined ? data.isActive : true; // Whether package is still valid
    this.joinedEventIds = data.joinedEventIds || []; // Array of event IDs that were joined using this package
    this.creditsAdded = data.creditsAdded || 0; // Credits added on purchase
    this.cancelledAt = data.cancelledAt || null; // When purchase was cancelled
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  /**
   * Create a new package purchase
   */
  static async create(purchaseData) {
    const db = getDB();
    const purchasesCollection = db.collection('packagePurchases');

    // Convert IDs to ObjectIds
    let userId, packageId, organiserId;
    try {
      userId = typeof purchaseData.userId === 'string' 
        ? new ObjectId(purchaseData.userId) 
        : purchaseData.userId;
      packageId = typeof purchaseData.packageId === 'string' 
        ? new ObjectId(purchaseData.packageId) 
        : purchaseData.packageId;
      organiserId = typeof purchaseData.organiserId === 'string' 
        ? new ObjectId(purchaseData.organiserId) 
        : purchaseData.organiserId;
    } catch (error) {
      throw new Error('Invalid ID format');
    }

    // Calculate expiry date based on validity months
    const purchaseDate = new Date();
    const expiryDate = new Date(purchaseDate);
    expiryDate.setMonth(expiryDate.getMonth() + purchaseData.validityMonths);

    const purchase = new PackagePurchase({
      ...purchaseData,
      userId,
      packageId,
      organiserId,
      purchaseDate,
      expiryDate,
    });

    purchase.createdAt = new Date();
    purchase.updatedAt = new Date();

    const result = await purchasesCollection.insertOne(purchase);

    return {
      _id: result.insertedId,
      ...purchase,
    };
  }

  /**
   * Mark expired or fully used purchases as inactive
   */
  static async expirePurchases(filter = {}) {
    const db = getDB();
    const purchasesCollection = db.collection('packagePurchases');
    const now = new Date();

    await purchasesCollection.updateMany(
      {
        ...filter,
        isActive: true,
        $or: [
          { expiryDate: { $lte: now } },
          { $expr: { $gte: ['$eventsJoined', '$maxEvents'] } },
        ],
      },
      { $set: { isActive: false, updatedAt: now } }
    );
  }

  /**
   * Find purchase by ID (MongoDB ObjectId)
   */
  static async findById(purchaseId) {
    const db = getDB();
    const purchasesCollection = db.collection('packagePurchases');

    let objectId;
    try {
      objectId = typeof purchaseId === 'string' ? new ObjectId(purchaseId) : purchaseId;
    } catch (error) {
      return null;
    }

    return await purchasesCollection.findOne({ _id: objectId });
  }

  /**
   * Find active purchases by user
   */
  static async findActiveByUser(userId, limit = 50, skip = 0) {
    const db = getDB();
    const purchasesCollection = db.collection('packagePurchases');

    let userObjectId;
    try {
      userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
    } catch (error) {
      return [];
    }

    const now = new Date();
    await this.expirePurchases({ userId: userObjectId });

    return await purchasesCollection
      .find({
        userId: userObjectId,
        isActive: true,
        expiryDate: { $gt: now }, // Not expired
      })
      .sort({ purchaseDate: -1 })
      .limit(limit)
      .skip(skip)
      .toArray();
  }

  /**
   * Find all purchases by user (including expired)
   */
  static async findByUser(userId, limit = 50, skip = 0) {
    const db = getDB();
    const purchasesCollection = db.collection('packagePurchases');

    let userObjectId;
    try {
      userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
    } catch (error) {
      return [];
    }

    await this.expirePurchases({ userId: userObjectId });

    return await purchasesCollection
      .find({ userId: userObjectId })
      .sort({ purchaseDate: -1 })
      .limit(limit)
      .skip(skip)
      .toArray();
  }

  /**
   * Find purchases by package
   */
  static async findByPackage(packageId, limit = 50, skip = 0) {
    const db = getDB();
    const purchasesCollection = db.collection('packagePurchases');

    let packageObjectId;
    try {
      packageObjectId = typeof packageId === 'string' ? new ObjectId(packageId) : packageId;
    } catch (error) {
      return [];
    }

    return await purchasesCollection
      .find({ packageId: packageObjectId })
      .sort({ purchaseDate: -1 })
      .limit(limit)
      .skip(skip)
      .toArray();
  }

  /**
   * Find purchases by organiser (to see who bought packages)
   */
  static async findByOrganiser(organiserId, limit = 50, skip = 0) {
    const db = getDB();
    const purchasesCollection = db.collection('packagePurchases');

    let organiserObjectId;
    try {
      organiserObjectId = typeof organiserId === 'string' ? new ObjectId(organiserId) : organiserId;
    } catch (error) {
      return [];
    }

    await this.expirePurchases({ organiserId: organiserObjectId });

    return await purchasesCollection
      .find({ organiserId: organiserObjectId })
      .sort({ purchaseDate: -1 })
      .limit(limit)
      .skip(skip)
      .toArray();
  }

  /**
   * Update purchase (e.g., when event is joined)
   */
  static async updateById(purchaseId, updateData) {
    const db = getDB();
    const purchasesCollection = db.collection('packagePurchases');

    let objectId;
    try {
      objectId = typeof purchaseId === 'string' ? new ObjectId(purchaseId) : purchaseId;
    } catch (error) {
      return false;
    }

    updateData.updatedAt = new Date();

    const result = await purchasesCollection.updateOne(
      { _id: objectId },
      { $set: updateData }
    );

    return result.modifiedCount > 0;
  }

  /**
   * Increment events joined count
   */
  static async incrementEventsJoined(purchaseId, eventId) {
    const db = getDB();
    const purchasesCollection = db.collection('packagePurchases');

    let purchaseObjectId, eventObjectId;
    try {
      purchaseObjectId = typeof purchaseId === 'string' ? new ObjectId(purchaseId) : purchaseId;
      eventObjectId = typeof eventId === 'string' ? new ObjectId(eventId) : eventId;
    } catch (error) {
      return false;
    }

    const result = await purchasesCollection.updateOne(
      { _id: purchaseObjectId },
      {
        $inc: { eventsJoined: 1 },
        $push: { joinedEventIds: eventObjectId },
        $set: { updatedAt: new Date() },
      }
    );

    await this.expirePurchases({ _id: purchaseObjectId });

    return result.modifiedCount > 0;
  }

  /**
   * Check if user has active package with available events
   */
  static async findAvailablePackageForUser(userId, organiserId = null) {
    const db = getDB();
    const purchasesCollection = db.collection('packagePurchases');

    let userObjectId;
    try {
      userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
    } catch (error) {
      return null;
    }

    await this.expirePurchases({ userId: userObjectId });

    const query = {
      userId: userObjectId,
      isActive: true,
      expiryDate: { $gt: new Date() }, // Not expired
      $expr: { $lt: ['$eventsJoined', '$maxEvents'] }, // Has available events
    };

    if (organiserId) {
      let organiserObjectId;
      try {
        organiserObjectId = typeof organiserId === 'string' ? new ObjectId(organiserId) : organiserId;
        query.organiserId = organiserObjectId;
      } catch (error) {
        return null;
      }
    }

    return await purchasesCollection.findOne(query);
  }

  /**
   * Get users who attended events (for organiser)
   */
  static async getUsersByEvent(eventId) {
    const db = getDB();
    const purchasesCollection = db.collection('packagePurchases');

    let eventObjectId;
    try {
      eventObjectId = typeof eventId === 'string' ? new ObjectId(eventId) : eventId;
    } catch (error) {
      return [];
    }

    return await purchasesCollection
      .find({ joinedEventIds: eventObjectId })
      .toArray();
  }
}

module.exports = PackagePurchase;
