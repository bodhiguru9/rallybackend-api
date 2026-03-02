const { getDB } = require('../config/database');
const { ObjectId } = require('mongodb');

/**
 * EventBlock Model
 * Handles block/unblock relationships between users and events
 * Optimized with proper indexing and efficient queries
 */
class EventBlock {
  /**
   * Create an event block relationship
   * @param {string|ObjectId} userId - User who is blocking the event
   * @param {string|ObjectId} eventId - Event that is being blocked
   */
  static async create(userId, eventId) {
    const db = getDB();
    const eventBlocksCollection = db.collection('eventBlocks');

    // Convert to ObjectId if string
    const userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
    const eventObjectId = typeof eventId === 'string' ? new ObjectId(eventId) : eventId;

    // Check if already blocked
    const existing = await eventBlocksCollection.findOne({
      userId: userObjectId,
      eventId: eventObjectId,
    });

    if (existing) {
      throw new Error('Event is already blocked');
    }

    const now = new Date();
    const result = await eventBlocksCollection.insertOne({
      userId: userObjectId,
      eventId: eventObjectId,
      createdAt: now,
    });

    return result.insertedId;
  }

  /**
   * Remove an event block relationship
   * @param {string|ObjectId} userId - User who blocked
   * @param {string|ObjectId} eventId - Event that was blocked
   */
  static async remove(userId, eventId) {
    const db = getDB();
    const eventBlocksCollection = db.collection('eventBlocks');

    const userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
    const eventObjectId = typeof eventId === 'string' ? new ObjectId(eventId) : eventId;

    const result = await eventBlocksCollection.deleteOne({
      userId: userObjectId,
      eventId: eventObjectId,
    });

    return result.deletedCount > 0;
  }

  /**
   * Check if event is blocked by user
   * @param {string|ObjectId} userId - User who might have blocked
   * @param {string|ObjectId} eventId - Event that might be blocked
   */
  static async isBlocked(userId, eventId) {
    const db = getDB();
    const eventBlocksCollection = db.collection('eventBlocks');

    const userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
    const eventObjectId = typeof eventId === 'string' ? new ObjectId(eventId) : eventId;

    const block = await eventBlocksCollection.findOne({
      userId: userObjectId,
      eventId: eventObjectId,
    });

    return !!block;
  }

  /**
   * Check if any of the provided events are blocked by user
   * @param {string|ObjectId} userId - User who might have blocked
   * @param {Array<string|ObjectId>} eventIds - Array of event IDs to check
   * @returns {Object} Map of eventId to boolean (blocked status)
   */
  static async getBlockedEventsMap(userId, eventIds) {
    const db = getDB();
    const eventBlocksCollection = db.collection('eventBlocks');

    if (!eventIds || eventIds.length === 0) {
      return {};
    }

    const userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
    const eventObjectIds = eventIds.map(id => 
      typeof id === 'string' ? new ObjectId(id) : id
    );

    const blocks = await eventBlocksCollection
      .find({
        userId: userObjectId,
        eventId: { $in: eventObjectIds },
      })
      .toArray();

    // Create a map of eventId (as string) to blocked status
    const blockedMap = {};
    eventIds.forEach(id => {
      const idStr = id.toString();
      blockedMap[idStr] = false;
    });

    blocks.forEach(block => {
      const eventIdStr = block.eventId.toString();
      blockedMap[eventIdStr] = true;
    });

    return blockedMap;
  }

  /**
   * Get list of events blocked by a user
   * @param {string|ObjectId} userId - User who blocked events
   * @param {number} limit - Maximum number of results
   * @param {number} skip - Number of results to skip
   */
  static async getBlockedEvents(userId, limit = 50, skip = 0) {
    const db = getDB();
    const eventBlocksCollection = db.collection('eventBlocks');
    const eventsCollection = db.collection('events');

    const userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;

    const blocks = await eventBlocksCollection
      .find({ userId: userObjectId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .toArray();

    const eventIds = blocks.map((b) => b.eventId);

    if (eventIds.length === 0) {
      return [];
    }

    const events = await eventsCollection
      .find({ _id: { $in: eventIds } })
      .toArray();

    // Map events with blocked timestamp
    return events.map((event) => {
      const block = blocks.find((b) => b.eventId.toString() === event._id.toString());
      return {
        eventId: event.eventId,
        mongoId: event._id.toString(),
        eventTitle: event.eventName || null,
        eventName: event.eventName || null,
        eventCategory: Array.isArray(event.eventSports) && event.eventSports.length > 0 ? event.eventSports[0] : null,
        eventType: event.eventType || null,
        eventSports: event.eventSports || [],
        gameStartDate: event.gameStartDate,
        gameTime: event.gameTime,
        gameLocationArena: event.gameLocationArena,
        gameLocation: event.gameLocation,
        gameCreatorName: event.gameCreatorName,
        gameCreatorEmail: event.gameCreatorEmail,
        gameCreatorProfilePic: event.gameCreatorProfilePic,
        gameJoinPrice: event.gameJoinPrice || 0,
        visibility: event.visibility,
        status: event.status,
        blockedAt: block?.createdAt,
      };
    });
  }

  /**
   * Get list of users who blocked an event
   * @param {string|ObjectId} eventId - Event that was blocked
   * @param {number} limit - Maximum number of results
   * @param {number} skip - Number of results to skip
   */
  static async getBlockedByUsers(eventId, limit = 50, skip = 0) {
    const db = getDB();
    const eventBlocksCollection = db.collection('eventBlocks');
    const usersCollection = db.collection('users');

    const eventObjectId = typeof eventId === 'string' ? new ObjectId(eventId) : eventId;

    const blocks = await eventBlocksCollection
      .find({ eventId: eventObjectId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .toArray();

    const userIds = blocks.map((b) => b.userId);

    if (userIds.length === 0) {
      return [];
    }

    const users = await usersCollection
      .find({ _id: { $in: userIds } })
      .toArray();

    return users.map((user) => {
      const block = blocks.find((b) => b.userId.toString() === user._id.toString());
      return {
        userId: user.userId,
        userType: user.userType,
        email: user.email,
        mobileNumber: user.mobileNumber,
        profilePic: user.profilePic,
        ...(user.userType === 'player' && {
          fullName: user.fullName,
          dob: user.dob,
          gender: user.gender,
          sport1: user.sport1,
          sport2: user.sport2,
        }),
        ...(user.userType === 'organiser' && {
          fullName: user.fullName,
          communityName: user.communityName,
          yourCity: user.yourCity,
        }),
        blockedAt: block?.createdAt,
      };
    });
  }

  /**
   * Get count of events blocked by a user
   * @param {string|ObjectId} userId - User who blocked events
   */
  static async getBlockedCount(userId) {
    const db = getDB();
    const eventBlocksCollection = db.collection('eventBlocks');

    const userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;

    return await eventBlocksCollection.countDocuments({ userId: userObjectId });
  }

  /**
   * Get count of users who blocked an event
   * @param {string|ObjectId} eventId - Event that was blocked
   */
  static async getBlockedByCount(eventId) {
    const db = getDB();
    const eventBlocksCollection = db.collection('eventBlocks');

    const eventObjectId = typeof eventId === 'string' ? new ObjectId(eventId) : eventId;

    return await eventBlocksCollection.countDocuments({ eventId: eventObjectId });
  }

  /**
   * Filter out blocked events from an array of event IDs
   * @param {string|ObjectId} userId - User ID
   * @param {Array<string|ObjectId>} eventIds - Array of event IDs to filter
   * @returns {Array<string|ObjectId>} Array of event IDs that are not blocked
   */
  static async filterBlockedEvents(userId, eventIds) {
    if (!eventIds || eventIds.length === 0) {
      return [];
    }

    const blockedMap = await this.getBlockedEventsMap(userId, eventIds);
    
    return eventIds.filter(id => {
      const idStr = id.toString();
      return !blockedMap[idStr];
    });
  }

  /**
   * Create indexes for optimization (should be called during app initialization)
   */
  static async createIndexes() {
    const db = getDB();
    const eventBlocksCollection = db.collection('eventBlocks');

    // Create compound index for userId and eventId queries
    await eventBlocksCollection.createIndex({ userId: 1, eventId: 1 }, { unique: true });
    
    // Create index for eventId queries (to find who blocked an event)
    await eventBlocksCollection.createIndex({ eventId: 1 });
    
    // Create index for userId queries (to find events blocked by user)
    await eventBlocksCollection.createIndex({ userId: 1 });
    
    // Create index for createdAt (for sorting)
    await eventBlocksCollection.createIndex({ createdAt: -1 });
  }
}

module.exports = EventBlock;

