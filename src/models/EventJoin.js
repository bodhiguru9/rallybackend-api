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

// guestsCount = player (1) + additional guests. Minimum 1.
const guestsCount = (extraData.guestsCount && Number.isInteger(extraData.guestsCount) && extraData.guestsCount >= 1)
  ? extraData.guestsCount
  : 1;

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
  guestsCount: guestsCount,
  joinedAt: now,
});

// Increment event attendee count by the full party size (player + guests)
const Event = require('./Event');
await Event.updateAttendeeCount(eventId, guestsCount);

return result.insertedId;
  }

  /**
   * Leave an event
   */
  static async leave(userId, eventId, occurrenceStart = null) {
    const db = getDB();
    const joinsCollection = db.collection('eventJoins');

    const normalizedOccurrenceStart = this.normalizeOccurrence(occurrenceStart);
    const userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
    const eventObjectId = typeof eventId === 'string' ? new ObjectId(eventId) : eventId;

    // Read the join record first so we know how many seats to free
    const joinRecord = await joinsCollection.findOne({
      userId: userObjectId,
      eventId: eventObjectId,
      occurrenceStart: normalizedOccurrenceStart,
    });

    const result = await joinsCollection.deleteOne({
      userId: userObjectId,
      eventId: eventObjectId,
      occurrenceStart: normalizedOccurrenceStart,
    });

    if (result.deletedCount > 0) {
      // Decrement by the party size stored in the join record (default 1 for old records)
      const seatsToFree = (joinRecord && joinRecord.guestsCount >= 1) ? joinRecord.guestsCount : 1;
      const Event = require('./Event');
      await Event.updateAttendeeCount(eventId, -seatsToFree);
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
    const userObjectId = typeof userIdToRemove === 'string' ? new ObjectId(userIdToRemove) : userIdToRemove;
    const eventObjectId = typeof eventId === 'string' ? new ObjectId(eventId) : eventId;

    // Read the join record first so we know how many seats to free
    const joinRecord = await joinsCollection.findOne({
      userId: userObjectId,
      eventId: eventObjectId,
      occurrenceStart: normalizedOccurrenceStart,
    });

    const result = await joinsCollection.deleteOne({
      userId: userObjectId,
      eventId: eventObjectId,
      occurrenceStart: normalizedOccurrenceStart,
    });

    if (result.deletedCount > 0) {
      // Decrement by the party size stored in the join record (default 1 for old records)
      const seatsToFree = (joinRecord && joinRecord.guestsCount >= 1) ? joinRecord.guestsCount : 1;
      const Event = require('./Event');
      await Event.updateAttendeeCount(eventId, -seatsToFree);
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

  let eventObjectId;
  if (typeof eventId === 'object' && eventId instanceof ObjectId) {
    eventObjectId = eventId;
  } else if (ObjectId.isValid(eventId)) {
    eventObjectId = new ObjectId(eventId);
  } else {
    const event = await findEventById(eventId);
    if (!event) {
      return false;
    }
    eventObjectId = event._id;
  }

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
    const paymentsCollection = db.collection('payments');
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

    const paymentQuery = {
      eventId: objectId,
      userId: { $in: userIds },
      status: 'success'
    };
    if (normalizedOccurrenceStart) {
      paymentQuery.occurrenceStart = normalizedOccurrenceStart;
    }
    const payments = await paymentsCollection.find(paymentQuery).toArray();

    return users.map((user) => {
      const joinRecord = joins.find((j) => j.userId.toString() === user._id.toString());
      const userPayment = payments.find((p) => p.userId.toString() === user._id.toString());
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
        joinedAt: joinRecord?.joinedAt,
        // guestsCount: how many seats this participant occupies (1 = just themselves)
        guestsCount: (joinRecord && joinRecord.guestsCount >= 1) ? joinRecord.guestsCount : 1,
        paidAmount: userPayment ? userPayment.finalAmount : null,
      };
    });
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

    // Sum guestsCount across all join records to get total occupied seats.
    // Old records without guestsCount are treated as 1 via $ifNull.
    const agg = await joinsCollection.aggregate([
      { $match: { eventId: objectId, occurrenceStart: normalizedOccurrenceStart } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$guestsCount', 1] } } } },
    ]).toArray();

    return agg.length > 0 ? agg[0].total : 0;
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
      guestsCount: (j.guestsCount >= 1) ? j.guestsCount : 1,
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

  /**
   * Create database indexes for event joins operations
   */
  static async createIndexes() {
    try {
      const db = getDB();
      const col = db.collection('eventJoins');
      // Compound index for capacity checks
      await col.createIndex({ eventId: 1, occurrenceStart: 1 });
      // Unique compound index for join state
      await col.createIndex({ userId: 1, eventId: 1, occurrenceStart: 1 }, { unique: true });
    } catch (error) {
      console.error('⚠️ Failed to create EventJoin indexes:', error.message);
    }
  }
}

module.exports = EventJoin;

