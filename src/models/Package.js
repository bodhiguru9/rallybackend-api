const { getDB } = require('../config/database');
const { ObjectId } = require('mongodb');
const Counter = require('./Counter');

/**
 * Package Model
 * Handles event packages created by organisers
 */
class Package {
  constructor(data) {
    this.packageId = data.packageId; // Sequential package ID (PKG1, PKG2, PKG3, ...)
    this.organiserId = data.organiserId; // Organiser who created the package
    this.packageName = data.packageName; // Package name
    this.packageDescription = data.packageDescription || null; // Package description
    this.sports = Array.isArray(data.sports) ? data.sports : []; // Sports list
    this.eventType = data.eventType || null; // Event type
    this.credits = typeof data.credits === 'number' ? data.credits : (data.credits ? parseInt(data.credits) : 0); // Credits granted on purchase
    this.packagePrice = data.packagePrice; // Package price
    this.validityMonths = data.validityMonths; // How many months the package is valid
    this.maxEvents = data.maxEvents; // Maximum number of events that can be joined
    this.eventIds = data.eventIds || []; // Array of event IDs included in this package
    this.isActive = data.isActive !== undefined ? data.isActive : true; // Whether package is active
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  /**
   * Create a new package
   */
  static async create(packageData) {
    const db = getDB();
    const packagesCollection = db.collection('packages');

    // Generate sequential package ID
    const packageId = await Counter.getNextPackageId();

    // Convert organiserId to ObjectId
    let organiserId;
    try {
      organiserId = typeof packageData.organiserId === 'string' 
        ? new ObjectId(packageData.organiserId) 
        : packageData.organiserId;
    } catch (error) {
      throw new Error('Invalid organiser ID format');
    }

    // Convert eventIds to ObjectIds
    const eventIds = (packageData.eventIds || []).map(eventId => {
      try {
        return typeof eventId === 'string' ? new ObjectId(eventId) : eventId;
      } catch (error) {
        throw new Error(`Invalid event ID format: ${eventId}`);
      }
    });

    const packageObj = new Package({
      ...packageData,
      packageId,
      organiserId,
      eventIds,
    });

    packageObj.createdAt = new Date();
    packageObj.updatedAt = new Date();

    const result = await packagesCollection.insertOne(packageObj);

    return {
      _id: result.insertedId,
      ...packageObj,
    };
  }

  /**
   * Find package by ID (sequential ID like PKG1, PKG2, etc. or MongoDB ObjectId)
   */
  static async findById(packageId) {
    const db = getDB();
    const packagesCollection = db.collection('packages');

    // Check if it's a sequential ID (PKG1, PKG2, etc.)
    if (typeof packageId === 'string' && packageId.startsWith('PKG')) {
      return await packagesCollection.findOne({ packageId: packageId });
    }

    // Otherwise, treat as MongoDB ObjectId
    let objectId;
    try {
      objectId = typeof packageId === 'string' ? new ObjectId(packageId) : packageId;
    } catch (error) {
      return null;
    }

    return await packagesCollection.findOne({ _id: objectId });
  }

  /**
   * Find packages by organiser
   */
  static async findByOrganiser(organiserId, limit = 50, skip = 0) {
    const db = getDB();
    const packagesCollection = db.collection('packages');

    let objectId;
    try {
      objectId = typeof organiserId === 'string' ? new ObjectId(organiserId) : organiserId;
    } catch (error) {
      return [];
    }

    return await packagesCollection
      .find({ organiserId: objectId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .toArray();
  }

  /**
   * Find all active packages
   */
  static async findActive(limit = 50, skip = 0) {
    const db = getDB();
    const packagesCollection = db.collection('packages');

    return await packagesCollection
      .find({ isActive: true })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .toArray();
  }

  /**
   * Update package
   */
  static async updateById(packageId, updateData) {
    const db = getDB();
    const packagesCollection = db.collection('packages');

    let query;
    // Check if it's a sequential ID (PKG1, PKG2, etc.)
    if (typeof packageId === 'string' && packageId.startsWith('PKG')) {
      query = { packageId: packageId };
    } else {
      // Otherwise, treat as MongoDB ObjectId
      let objectId;
      try {
        objectId = typeof packageId === 'string' ? new ObjectId(packageId) : packageId;
      } catch (error) {
        return false;
      }
      query = { _id: objectId };
    }

    // Convert eventIds to ObjectIds if provided
    if (updateData.eventIds) {
      updateData.eventIds = updateData.eventIds.map(eventId => {
        try {
          return typeof eventId === 'string' ? new ObjectId(eventId) : eventId;
        } catch (error) {
          throw new Error(`Invalid event ID format: ${eventId}`);
        }
      });
    }

    updateData.updatedAt = new Date();

    const result = await packagesCollection.updateOne(
      query,
      { $set: updateData }
    );

    return result.modifiedCount > 0;
  }

  /**
   * Delete package
   */
  static async deleteById(packageId) {
    const db = getDB();
    const packagesCollection = db.collection('packages');

    let query;
    // Check if it's a sequential ID (PKG1, PKG2, etc.)
    if (typeof packageId === 'string' && packageId.startsWith('PKG')) {
      query = { packageId: packageId };
    } else {
      // Otherwise, treat as MongoDB ObjectId
      let objectId;
      try {
        objectId = typeof packageId === 'string' ? new ObjectId(packageId) : packageId;
      } catch (error) {
        return false;
      }
      query = { _id: objectId };
    }

    const result = await packagesCollection.deleteOne(query);
    return result.deletedCount > 0;
  }
}

module.exports = Package;
