const { getDB } = require('../config/database');
const { ObjectId } = require('mongodb');
const { getNextUniqueFavoriteId } = require('../utils/idManager');
const Event = require('./Event');

/**
 * Favorite Model
 * Handles user favorite events
 * Uses sequential favoriteId (FAV1, FAV2, FAV3, ...)
 */
class Favorite {
  constructor(data) {
    this.favoriteId = data.favoriteId; // Sequential favorite ID (FAV1, FAV2, FAV3, ...)
    this.userId = data.userId; // MongoDB ObjectId of user
    this.eventId = data.eventId; // MongoDB ObjectId of event
    this.createdAt = data.createdAt || new Date();
  }

  /**
   * Add event to user's favorites
   * @param {string|ObjectId} userId - User ID (sequential userId or MongoDB ObjectId)
   * @param {string} eventId - Event ID (sequential eventId like "E1" or MongoDB ObjectId)
   * @returns {Promise<Object>} Created favorite record
   */
  static async add(userId, eventId) {
    const db = getDB();
    const favoritesCollection = db.collection('favorites');

    // Find event by sequential eventId or MongoDB ObjectId
    let event = null;
    if (typeof eventId === 'string' && eventId.startsWith('E')) {
      event = await Event.findByEventId(eventId);
    } else {
      try {
        event = await Event.findById(eventId);
      } catch (error) {
        throw new Error('Invalid event ID format');
      }
    }

    if (!event) {
      throw new Error('Event not found');
    }

    // Convert userId to MongoDB ObjectId if needed
    let userObjectId;
    if (typeof userId === 'number' || (!isNaN(userId) && parseInt(userId).toString() === userId.toString())) {
      const User = require('./User');
      const user = await User.findByUserId(parseInt(userId));
      if (!user) {
        throw new Error('User not found');
      }
      userObjectId = user._id;
    } else {
      try {
        userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
      } catch (error) {
        throw new Error('Invalid user ID format');
      }
    }

    // Check if already favorited
    const existing = await favoritesCollection.findOne({
      userId: userObjectId,
      eventId: event._id,
    });

    if (existing) {
      throw new Error('Event is already in favorites');
    }

    // Generate sequential favorite ID
    const favoriteId = await getNextUniqueFavoriteId();

    const favorite = new Favorite({
      favoriteId,
      userId: userObjectId,
      eventId: event._id,
      createdAt: new Date(),
    });

    const result = await favoritesCollection.insertOne(favorite);

    return {
      _id: result.insertedId,
      favoriteId: favorite.favoriteId,
      userId: favorite.userId,
      eventId: favorite.eventId,
      createdAt: favorite.createdAt,
    };
  }

  /**
   * Remove event from user's favorites
   * @param {string|ObjectId} userId - User ID (sequential userId or MongoDB ObjectId)
   * @param {string} eventId - Event ID (sequential eventId like "E1" or MongoDB ObjectId)
   * @returns {Promise<boolean>} True if removed, false if not found
   */
  static async remove(userId, eventId) {
    const db = getDB();
    const favoritesCollection = db.collection('favorites');

    // Find event by sequential eventId or MongoDB ObjectId
    let event = null;
    if (typeof eventId === 'string' && eventId.startsWith('E')) {
      event = await Event.findByEventId(eventId);
    } else {
      try {
        event = await Event.findById(eventId);
      } catch (error) {
        throw new Error('Invalid event ID format');
      }
    }

    if (!event) {
      throw new Error('Event not found');
    }

    // Convert userId to MongoDB ObjectId if needed
    let userObjectId;
    if (typeof userId === 'number' || (!isNaN(userId) && parseInt(userId).toString() === userId.toString())) {
      const User = require('./User');
      const user = await User.findByUserId(parseInt(userId));
      if (!user) {
        throw new Error('User not found');
      }
      userObjectId = user._id;
    } else {
      try {
        userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
      } catch (error) {
        throw new Error('Invalid user ID format');
      }
    }

    const result = await favoritesCollection.deleteOne({
      userId: userObjectId,
      eventId: event._id,
    });

    return result.deletedCount > 0;
  }

  /**
   * Get all favorite events for a user
   * @param {string|ObjectId} userId - User ID (sequential userId or MongoDB ObjectId)
   * @param {number} limit - Maximum number of results
   * @param {number} skip - Number of results to skip
   * @returns {Promise<Array>} Array of favorite records with event details
   */
  static async getUserFavorites(userId, limit = 50, skip = 0) {
    const db = getDB();
    const favoritesCollection = db.collection('favorites');

    // Convert userId to MongoDB ObjectId if needed
    let userObjectId;
    if (typeof userId === 'number' || (!isNaN(userId) && parseInt(userId).toString() === userId.toString())) {
      const User = require('./User');
      const user = await User.findByUserId(parseInt(userId));
      if (!user) {
        throw new Error('User not found');
      }
      userObjectId = user._id;
    } else {
      try {
        userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
      } catch (error) {
        throw new Error('Invalid user ID format');
      }
    }

    const favorites = await favoritesCollection
      .find({ userId: userObjectId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .toArray();

    // Get event details for each favorite
    const eventsCollection = db.collection('events');
    const eventIds = favorites.map((fav) => fav.eventId);

    if (eventIds.length === 0) {
      return [];
    }

    const events = await eventsCollection
      .find({ _id: { $in: eventIds } })
      .toArray();

    // Map events to favorites
    const eventMap = new Map(events.map((event) => [event._id.toString(), event]));

    return favorites.map((favorite) => {
      const event = eventMap.get(favorite.eventId.toString());
      return {
        favoriteId: favorite.favoriteId,
        event: event ? {
          eventId: event.eventId,
          eventTitle: event.eventName || null,
          eventName: event.eventName || null,
          eventCategory: Array.isArray(event.eventSports) && event.eventSports.length > 0 ? event.eventSports[0] : null,
          eventType: event.eventType || null,
          eventSports: event.eventSports || [],
          gameStartDate: event.gameStartDate,
          gameTime: event.gameTime,
          gameLocation: event.gameLocation,
          gameLocationArena: event.gameLocationArena,
          gameJoinPrice: event.gameJoinPrice,
          status: event.status,
          visibility: event.visibility,
        } : null,
        createdAt: favorite.createdAt,
      };
    });
  }

  /**
   * Check if event is favorited by user
   * @param {string|ObjectId} userId - User ID (sequential userId or MongoDB ObjectId)
   * @param {string} eventId - Event ID (sequential eventId like "E1" or MongoDB ObjectId)
   * @returns {Promise<boolean>} True if favorited, false otherwise
   */
  static async isFavorited(userId, eventId) {
    const db = getDB();
    const favoritesCollection = db.collection('favorites');

    // Find event by sequential eventId or MongoDB ObjectId
    let event = null;
    if (typeof eventId === 'string' && eventId.startsWith('E')) {
      event = await Event.findByEventId(eventId);
    } else {
      try {
        event = await Event.findById(eventId);
      } catch (error) {
        return false;
      }
    }

    if (!event) {
      return false;
    }

    // Convert userId to MongoDB ObjectId if needed
    let userObjectId;
    if (typeof userId === 'number' || (!isNaN(userId) && parseInt(userId).toString() === userId.toString())) {
      const User = require('./User');
      const user = await User.findByUserId(parseInt(userId));
      if (!user) {
        return false;
      }
      userObjectId = user._id;
    } else {
      try {
        userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
      } catch (error) {
        return false;
      }
    }

    const favorite = await favoritesCollection.findOne({
      userId: userObjectId,
      eventId: event._id,
    });

    return !!favorite;
  }

  /**
   * Get favorite count for an event
   * @param {string} eventId - Event ID (sequential eventId like "E1" or MongoDB ObjectId)
   * @returns {Promise<number>} Number of users who favorited this event
   */
  static async getEventFavoriteCount(eventId) {
    const db = getDB();
    const favoritesCollection = db.collection('favorites');

    // Find event by sequential eventId or MongoDB ObjectId
    let event = null;
    if (typeof eventId === 'string' && eventId.startsWith('E')) {
      event = await Event.findByEventId(eventId);
    } else {
      try {
        event = await Event.findById(eventId);
      } catch (error) {
        return 0;
      }
    }

    if (!event) {
      return 0;
    }

    const count = await favoritesCollection.countDocuments({
      eventId: event._id,
    });

    return count;
  }
}

module.exports = Favorite;

