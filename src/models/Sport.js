const { getDB } = require('../config/database');
const { ObjectId } = require('mongodb');
const Counter = require('./Counter');

/**
 * Sport Model
 * Handles sport creation and management
 */
class Sport {
  constructor(data) {
    this.sportId = data.sportId; // Sequential sport ID (SP1, SP2, SP3, etc.)
    this.name = data.name; // Sport name (e.g., "Cricket", "Football", "Swimming")
    this.description = data.description || null; // Description of the sport
    this.icon = data.icon || null; // Sport icon/image URL
    this.isActive = data.isActive !== undefined ? data.isActive : true; // Active status
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  /**
   * Create a new sport
   */
  static async create(sportData) {
    const db = getDB();
    const sportsCollection = db.collection('sports');

    // Check if sport name already exists (case-insensitive)
    const existing = await sportsCollection.findOne({
      name: { $regex: new RegExp(`^${sportData.name}$`, 'i') },
    });

    if (existing) {
      throw new Error('Sport with this name already exists');
    }

    // Generate sequential sport ID
    const sportId = await Counter.getNextSportId();

    const sport = new Sport({
      ...sportData,
      sportId: sportId,
      name: sportData.name.trim(),
    });

    const result = await sportsCollection.insertOne(sport);

    // Return sport with sequential ID (SP1, SP2, etc.) - MongoDB _id is for internal use only
    return {
      _id: result.insertedId, // Keep for internal database operations
      sportId: sport.sportId, // Sequential ID (SP1, SP2, SP3, etc.)
      name: sport.name,
      description: sport.description,
      icon: sport.icon,
      isActive: sport.isActive,
      createdAt: sport.createdAt,
      updatedAt: sport.updatedAt,
    };
  }

  /**
   * Find sport by ID (sequential ID or MongoDB ObjectId)
   */
  static async findById(id) {
    const db = getDB();
    const sportsCollection = db.collection('sports');

    // Check if it's a sequential ID (SP1, SP2, etc.)
    if (typeof id === 'string' && id.startsWith('SP')) {
      return await sportsCollection.findOne({ sportId: id });
    }

    // Otherwise, treat as MongoDB ObjectId
    let objectId;
    try {
      objectId = typeof id === 'string' ? new ObjectId(id) : id;
    } catch (error) {
      return null;
    }

    return await sportsCollection.findOne({ _id: objectId });
  }

  /**
   * Find sport by name (case-insensitive)
   */
  static async findByName(name) {
    const db = getDB();
    const sportsCollection = db.collection('sports');

    return await sportsCollection.findOne({
      name: { $regex: new RegExp(`^${name}$`, 'i') },
    });
  }

  /**
   * Get all sports
   */
  static async findAll(filters = {}) {
    const db = getDB();
    const sportsCollection = db.collection('sports');

    const query = {};

    // Filter by active status if provided
    if (filters.isActive !== undefined) {
      query.isActive = filters.isActive;
    }

    return await sportsCollection
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();
  }

  /**
   * Update sport by ID
   */
  static async updateById(id, updateData) {
    const db = getDB();
    const sportsCollection = db.collection('sports');

    let query;
    // Check if it's a sequential ID (SP1, SP2, etc.)
    if (typeof id === 'string' && id.startsWith('SP')) {
      query = { sportId: id };
    } else {
      // Otherwise, treat as MongoDB ObjectId
      let objectId;
      try {
        objectId = typeof id === 'string' ? new ObjectId(id) : id;
      } catch (error) {
        return false;
      }
      query = { _id: objectId };
    }

    // If name is being updated, check for duplicates
    if (updateData.name) {
      const existing = await sportsCollection.findOne({
        name: { $regex: new RegExp(`^${updateData.name.trim()}$`, 'i') },
        ...(query.sportId ? { sportId: { $ne: query.sportId } } : { _id: { $ne: query._id } }),
      });

      if (existing) {
        throw new Error('Sport with this name already exists');
      }

      updateData.name = updateData.name.trim();
    }

    updateData.updatedAt = new Date();

    const result = await sportsCollection.updateOne(query, { $set: updateData });

    return result.modifiedCount > 0;
  }

  /**
   * Delete sport by ID
   */
  static async deleteById(id) {
    const db = getDB();
    const sportsCollection = db.collection('sports');

    let query;
    // Check if it's a sequential ID (SP1, SP2, etc.)
    if (typeof id === 'string' && id.startsWith('SP')) {
      query = { sportId: id };
    } else {
      // Otherwise, treat as MongoDB ObjectId
      let objectId;
      try {
        objectId = typeof id === 'string' ? new ObjectId(id) : id;
      } catch (error) {
        return false;
      }
      query = { _id: objectId };
    }

    const result = await sportsCollection.deleteOne(query);

    return result.deletedCount > 0;
  }
}

module.exports = Sport;

