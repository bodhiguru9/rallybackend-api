const { getDB } = require('../config/database');
const { ObjectId } = require('mongodb');
const { findEventById } = require('../utils/eventHelper');

/**
 * EventJoin Model
 * Handles users joining events
 */
class EventJoin {

  static normalizeOccurrence(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
  /**
   * Join an event
   */
  static async join(userId, eventId, occurrenceStart = null, extraData = {}) {
    const db = getDB();
const joinsCollection = db.collection('eventJoins');

const normalizedOccurrenceStart = this.normalizeOccurrence(occurrenceStart);
const normalizedOccurrenceEnd = extraData.occurrenceEnd
  ? this.normalizeOccurrence(extraData.occurrenceEnd)
  : null;

const userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
const eventObjectId = typeof eventId === 'string' ? new ObjectId(eventId) : eventId;

// Check if already joined for this specific occurrence
const existing = await joinsCollection.findOne({
  userId: userObjectId,
  eventId: eventObjectId,
  occurrenceStart: normalizedOccurrenceStart,
});

if (existing) {
  throw new Error('Already joined this occurrence');
}

const now = new Date();
const result = await joinsCollection.insertOne({
  userId: userObjectId,
  eventId: eventObjectId,
  parentEventId: extraData.parentEventId || null,
  occurrenceStart: normalizedOccurrenceStart,
  occurrenceEnd: normalizedOccurrenceEnd,
  joinedAt: now,
});

// Keep existing attendee count behaviour unchanged for now
const Event = require('./Event');
await Event.updateAttendeeCount(eventId, 1);

return result.insertedId;
  }

  /**
   * Leave an event
   */
  static async leave(userId, eventId, occurrenceStart = null) {
    const db = getDB();
    const joinsCollection = db.collection('eventJoins');

    const normalizedOccurrenceStart = this.normalizeOccurrence(occurrenceStart);

const result = await joinsCollection.deleteOne({
  userId: typeof userId === 'string' ? new ObjectId(userId) : userId,
  eventId: typeof eventId === 'string' ? new ObjectId(eventId) : eventId,
  occurrenceStart: normalizedOccurrenceStart,
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
  static async removeUser(eventId, userIdToRemove, occurrenceStart = null) {
    const db = getDB();
    const joinsCollection = db.collection('eventJoins');

    const normalizedOccurrenceStart = this.normalizeOccurrence(occurrenceStart);

const result = await joinsCollection.deleteOne({
  userId: typeof userIdToRemove === 'string' ? new ObjectId(userIdToRemove) : userIdToRemove,
  eventId: typeof eventId === 'string' ? new ObjectId(eventId) : eventId,
  occurrenceStart: normalizedOccurrenceStart,
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
 static async hasJoined(userId, eventId, occurrenceStart = null) {
  const db = getDB();
  const joinsCollection = db.collection('eventJoins');

  const normalizedOccurrenceStart = this.normalizeOccurrence(occurrenceStart);

  const event = await findEventById(eventId);
  if (!event) {
    return false;
  }

  const eventObjectId = event._id;

  const join = await joinsCollection.findOne({
    userId: typeof userId === 'string' ? new ObjectId(userId) : userId,
    eventId: eventObjectId,
    occurrenceStart: normalizedOccurrenceStart,
  });

  return !!join;
}

  /**
   * Get all users who joined an event
   */
 static async getEventParticipants(eventId, occurrenceStart = null, limit = 100, skip = 0) {
    const db = getDB();
    const joinsCollection = db.collection('eventJoins');
    const usersCollection = db.collection('users');
    const normalizedOccurrenceStart = this.normalizeOccurrence(occurrenceStart);

    let objectId;
    try {
      objectId = typeof eventId === 'string' ? new ObjectId(eventId) : eventId;
    } catch (error) {
      return [];
    }

    const joins = await joinsCollection
      .find({
  eventId: objectId,
  occurrenceStart: normalizedOccurrenceStart,
})
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
  static async getParticipantCount(eventId, occurrenceStart = null) {
    const db = getDB();
    const joinsCollection = db.collection('eventJoins');
    const normalizedOccurrenceStart = this.normalizeOccurrence(occurrenceStart);

    let objectId;
    try {
      objectId = typeof eventId === 'string' ? new ObjectId(eventId) : eventId;
    } catch (error) {
      return 0;
    }

    return await joinsCollection.countDocuments({
  eventId: objectId,
  occurrenceStart: normalizedOccurrenceStart,
});
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
  const eventJoins = joins.filter(j => j.eventId.toString() === event._id.toString());
  return {
    ...event,
    joinedOccurrences: eventJoins.map(j => ({
      joinedAt: j.joinedAt,
      occurrenceStart: j.occurrenceStart || null,
      occurrenceEnd: j.occurrenceEnd || null,
      parentEventId: j.parentEventId || null,
    })),
  };
});
  }

  /**
 * Get ALL participant userIds (ObjectId list) for an event
 * (used for organiser manual broadcast)
 */
static async getAllParticipantUserIds(eventObjectId, occurrenceStart = null) {
  const db = getDB();
  const joinsCollection = db.collection('eventJoins');
  const normalizedOccurrenceStart = this.normalizeOccurrence(occurrenceStart);

  let objectId;
  try {
    objectId = typeof eventObjectId === 'string' ? new ObjectId(eventObjectId) : eventObjectId;
  } catch (error) {
    return [];
  }

  const userIds = await joinsCollection.distinct('userId', {
  eventId: objectId,
  occurrenceStart: normalizedOccurrenceStart,
});
  return userIds || [];
}
}

module.exports = EventJoin;

