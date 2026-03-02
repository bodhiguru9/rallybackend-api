const { getDB } = require('../config/database');
const { ObjectId } = require('mongodb');
const { findEventById } = require('../utils/eventHelper');

/**
 * EventJoin Model
 * Handles users joining events
 */
class EventJoin {
  /**
   * Join an event
   */
  static async join(userId, eventId) {
    const db = getDB();
    const joinsCollection = db.collection('eventJoins');

    // Check if already joined
    const existing = await joinsCollection.findOne({
      userId: typeof userId === 'string' ? new ObjectId(userId) : userId,
      eventId: typeof eventId === 'string' ? new ObjectId(eventId) : eventId,
    });

    if (existing) {
      throw new Error('Already joined this event');
    }

    const now = new Date();
    const result = await joinsCollection.insertOne({
      userId: typeof userId === 'string' ? new ObjectId(userId) : userId,
      eventId: typeof eventId === 'string' ? new ObjectId(eventId) : eventId,
      joinedAt: now,
    });

    // Update event attendee count
    const Event = require('./Event');
    await Event.updateAttendeeCount(eventId, 1);

    return result.insertedId;
  }

  /**
   * Leave an event
   */
  static async leave(userId, eventId) {
    const db = getDB();
    const joinsCollection = db.collection('eventJoins');

    const result = await joinsCollection.deleteOne({
      userId: typeof userId === 'string' ? new ObjectId(userId) : userId,
      eventId: typeof eventId === 'string' ? new ObjectId(eventId) : eventId,
    });

    if (result.deletedCount > 0) {
      // Update event attendee count
      const Event = require('./Event');
      await Event.updateAttendeeCount(eventId, -1);
    }

    return result.deletedCount > 0;
  }

  /**
   * Remove user from event (admin/creator only)
   */
  static async removeUser(eventId, userIdToRemove) {
    const db = getDB();
    const joinsCollection = db.collection('eventJoins');

    const result = await joinsCollection.deleteOne({
      userId: typeof userIdToRemove === 'string' ? new ObjectId(userIdToRemove) : userIdToRemove,
      eventId: typeof eventId === 'string' ? new ObjectId(eventId) : eventId,
    });

    if (result.deletedCount > 0) {
      // Update event attendee count
      const Event = require('./Event');
      await Event.updateAttendeeCount(eventId, -1);
    }

    return result.deletedCount > 0;
  }

  /**
   * Check if user has joined event
   */
  /**
   * Check if user has joined an event
   * @param {string|ObjectId} userId - User ID (MongoDB ObjectId)
   * @param {string} eventId - Event ID (sequential eventId like "E1" or MongoDB ObjectId)
   */
  static async hasJoined(userId, eventId) {
    const db = getDB();
    const joinsCollection = db.collection('eventJoins');

    // Find event by sequential eventId or MongoDB ObjectId
    const event = await findEventById(eventId);
    if (!event) {
      return false;
    }

    // Use MongoDB ObjectId from found event for database operations
    const eventObjectId = event._id;

    const join = await joinsCollection.findOne({
      userId: typeof userId === 'string' ? new ObjectId(userId) : userId,
      eventId: eventObjectId,
    });

    return !!join;
  }

  /**
   * Get all users who joined an event
   */
  static async getEventParticipants(eventId, limit = 100, skip = 0) {
    const db = getDB();
    const joinsCollection = db.collection('eventJoins');
    const usersCollection = db.collection('users');

    let objectId;
    try {
      objectId = typeof eventId === 'string' ? new ObjectId(eventId) : eventId;
    } catch (error) {
      return [];
    }

    const joins = await joinsCollection
      .find({ eventId: objectId })
      .sort({ joinedAt: -1 })
      .limit(limit)
      .skip(skip)
      .toArray();

    const userIds = joins.map((j) => j.userId);

    if (userIds.length === 0) {
      return [];
    }

    const users = await usersCollection.find({ _id: { $in: userIds } }).toArray();

    return users.map((user) => ({
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
      joinedAt: joins.find((j) => j.userId.toString() === user._id.toString())?.joinedAt,
    }));
  }

  /**
   * Get participant count for event
   */
  static async getParticipantCount(eventId) {
    const db = getDB();
    const joinsCollection = db.collection('eventJoins');

    let objectId;
    try {
      objectId = typeof eventId === 'string' ? new ObjectId(eventId) : eventId;
    } catch (error) {
      return 0;
    }

    return await joinsCollection.countDocuments({ eventId: objectId });
  }

  /**
   * Get all events a user has joined
   * @param {string|ObjectId} userId - User ID (MongoDB ObjectId)
   * @param {number} limit - Maximum number of results
   * @param {number} skip - Number of results to skip
   * @returns {Promise<Array>} Array of event objects
   */
  static async getUserJoinedEvents(userId, limit = 100, skip = 0) {
    const db = getDB();
    const joinsCollection = db.collection('eventJoins');
    const eventsCollection = db.collection('events');

    const userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;

    // Get all joins for this user
    const joins = await joinsCollection
      .find({ userId: userObjectId })
      .sort({ joinedAt: -1 })
      .limit(limit)
      .skip(skip)
      .toArray();

    if (joins.length === 0) {
      return [];
    }

    

    // Get event IDs
    const eventIds = joins.map(j => j.eventId);

    // Get all events
    const events = await eventsCollection
      .find({ _id: { $in: eventIds } })
      .toArray();

    // Map events with join info
    return events.map(event => {
      const joinInfo = joins.find(j => j.eventId.toString() === event._id.toString());
      return {
        ...event,
        joinedAt: joinInfo?.joinedAt,
      };
    });
  }

  /**
 * Get ALL participant userIds (ObjectId list) for an event
 * (used for organiser manual broadcast)
 */
static async getAllParticipantUserIds(eventObjectId) {
  const db = getDB();
  const joinsCollection = db.collection('eventJoins');

  let objectId;
  try {
    objectId = typeof eventObjectId === 'string' ? new ObjectId(eventObjectId) : eventObjectId;
  } catch (error) {
    return [];
  }

  const userIds = await joinsCollection.distinct('userId', { eventId: objectId });
  return userIds || [];
}
}

module.exports = EventJoin;

