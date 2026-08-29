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
    console.log(`[EventJoin.join Debug] userId: ${userId}, eventId: ${eventId}, extraData keys: ${Object.keys(extraData)}, guestInfo present: ${!!extraData.guestInfo}, guestInfo length: ${Array.isArray(extraData.guestInfo) ? extraData.guestInfo.length : 'N/A'}`);
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

// Opt-in atomic capacity guard (prevents overbooking under concurrency). Enabled by
// passing extraData.capacityLimit (= eventMaxGuest). We RESERVE a seat BEFORE inserting,
// via an atomic conditional $inc on a per-occurrence counter (see _reserveSeats). MongoDB
// serializes that per-document, so at most `capacityLimit` seats can ever be reserved →
// no overbooking, no matter how many requests race. Callers that don't pass capacityLimit
// skip this entirely (unchanged behaviour).
const capacityLimit = Number(extraData.capacityLimit);
const guardEnabled = Number.isFinite(capacityLimit) && capacityLimit > 0;
if (guardEnabled) {
  const reserved = await this._reserveSeats(eventObjectId, normalizedOccurrenceStart, guestsCount, capacityLimit);
  if (!reserved) {
    const err = new Error('Event is full. All spots have been booked.');
    err.code = 'EVENT_FULL';
    throw err;
  }
}

const now = new Date();
let result;
try {
  result = await joinsCollection.insertOne({
    userId: userObjectId,
    eventId: eventObjectId,
    parentEventId: extraData.parentEventId || null,
    occurrenceStart: normalizedOccurrenceStart,
    occurrenceEnd: normalizedOccurrenceEnd,
    guestsCount: guestsCount,
    guestInfo: Array.isArray(extraData.guestInfo) ? extraData.guestInfo : [],
    joinedAt: now,
  });
} catch (insertErr) {
  // Insert failed (e.g. unique-index duplicate join) → release the seat we reserved.
  if (guardEnabled) await this._releaseSeats(eventObjectId, normalizedOccurrenceStart, guestsCount);
  throw insertErr;
}

// Increment event attendee count by the full party size (player + guests)
const Event = require('./Event');
await Event.updateAttendeeCount(eventId, guestsCount);

return result.insertedId;
  }

  /**
   * Atomically reserve `guestsCount` seats for an occurrence, returning true if reserved
   * or false if it would exceed `capacityLimit`. Uses a per-occurrence counter document in
   * the `eventOccupancy` collection; the conditional `findOneAndUpdate` is atomic per
   * document, so concurrent callers can never reserve beyond capacity. The counter is
   * created lazily, seeded from the current real participant count.
   */
  static async _reserveSeats(eventObjectId, normalizedOccurrenceStart, guestsCount, capacityLimit) {
    const db = getDB();
    const col = db.collection('eventOccupancy');
    const key = `${eventObjectId.toString()}|${normalizedOccurrenceStart === null ? 'null' : normalizedOccurrenceStart}`;

    const incIfRoom = () => col.findOneAndUpdate(
      { _id: key, reserved: { $lte: capacityLimit - guestsCount } },
      { $inc: { reserved: guestsCount } },
      { returnDocument: 'after' }
    );

    // Fast path: counter exists and has room.
    let doc = await incIfRoom();
    if (doc) return true;

    // Counter may not exist yet → seed it from the current real participant count.
    const current = await this.getParticipantCount(eventObjectId, normalizedOccurrenceStart);
    if (current + guestsCount > capacityLimit) return false; // already full
    try {
      await col.insertOne({ _id: key, reserved: current + guestsCount });
      return true;
    } catch (e) {
      if (e.code === 11000) {
        doc = await incIfRoom(); // created concurrently → retry the atomic reserve
        return !!doc;
      }
      throw e;
    }
  }

  /** Release previously-reserved seats for an occurrence (floored at 0). No-op if no counter. */
  static async _releaseSeats(eventObjectId, normalizedOccurrenceStart, guestsCount) {
    const db = getDB();
    const col = db.collection('eventOccupancy');
    const key = `${eventObjectId.toString()}|${normalizedOccurrenceStart === null ? 'null' : normalizedOccurrenceStart}`;
    await col.updateOne(
      { _id: key },
      [{ $set: { reserved: { $max: [0, { $subtract: [{ $ifNull: ['$reserved', 0] }, guestsCount] }] } } }]
    );
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

    const query = {
      userId: userObjectId,
      eventId: eventObjectId,
    };
    if (normalizedOccurrenceStart !== null) {
      query.occurrenceStart = normalizedOccurrenceStart;
    }

    // Read the join record first so we know how many seats to free
    const joinRecord = await joinsCollection.findOne(query);

    const result = await joinsCollection.deleteOne(query);

    if (result.deletedCount > 0) {
      // Decrement by the party size stored in the join record (default 1 for old records)
      const seatsToFree = (joinRecord && joinRecord.guestsCount >= 1) ? joinRecord.guestsCount : 1;
      const Event = require('./Event');
      await Event.updateAttendeeCount(eventId, -seatsToFree);
      // Release the reserved seat(s) from the per-occurrence capacity counter (no-op if none).
      const occToRelease = (joinRecord && joinRecord.occurrenceStart !== undefined) ? joinRecord.occurrenceStart : normalizedOccurrenceStart;
      await this._releaseSeats(eventObjectId, occToRelease, seatsToFree);
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

    const query = {
      userId: userObjectId,
      eventId: eventObjectId,
    };
    if (normalizedOccurrenceStart !== null) {
      query.occurrenceStart = normalizedOccurrenceStart;
    }

    // Read the join record first so we know how many seats to free
    const joinRecord = await joinsCollection.findOne(query);

    const result = await joinsCollection.deleteOne(query);

    if (result.deletedCount > 0) {
      // Decrement by the party size stored in the join record (default 1 for old records)
      const seatsToFree = (joinRecord && joinRecord.guestsCount >= 1) ? joinRecord.guestsCount : 1;
      const Event = require('./Event');
      await Event.updateAttendeeCount(eventId, -seatsToFree);
      // Release the reserved seat(s) from the per-occurrence capacity counter (no-op if none).
      const occToRelease = (joinRecord && joinRecord.occurrenceStart !== undefined) ? joinRecord.occurrenceStart : normalizedOccurrenceStart;
      await this._releaseSeats(eventObjectId, occToRelease, seatsToFree);
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

  const query = {
    userId: typeof userId === 'string' ? new ObjectId(userId) : userId,
    eventId: eventObjectId,
  };
  if (normalizedOccurrenceStart !== null) {
    query.occurrenceStart = normalizedOccurrenceStart;
  }

  const join = await joinsCollection.findOne(query);

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

    const query = { eventId: objectId };
    if (normalizedOccurrenceStart !== null) {
      query.occurrenceStart = normalizedOccurrenceStart;
    }

    const joins = await joinsCollection
      .find(query)
      .sort({ joinedAt: -1 })
      .limit(limit)
      .skip(skip)
      .toArray();

    const userIds = joins.map((j) => j.userId);

    if (userIds.length === 0) {
      return [];
    }

    const users = await usersCollection.find({ _id: { $in: userIds } }).toArray();

    const userObjectIds = users.map((u) => u._id);
    const userObjectIdStrings = users.map((u) => u._id.toString());
    const userSequentialIds = users.map((u) => u.userId).filter((id) => id !== undefined && id !== null);
    const userSequentialStrings = userSequentialIds.map((id) => String(id));
    const allUserIds = Array.from(new Set([
      ...userObjectIds,
      ...userObjectIdStrings,
      ...userSequentialIds,
      ...userSequentialStrings,
    ]));

    const eventIds = [objectId, objectId.toString()];

    // Query payments flexibly without strict occurrenceStart filter to ensure no payment is missed
    const payments = await paymentsCollection
      .find({
        eventId: { $in: eventIds },
        userId: { $in: allUserIds },
        status: { $in: ['success', 'succeeded', 'paid', 'booked'] },
      })
      .sort({ createdAt: -1 })
      .toArray();

    const bookingsCollection = db.collection('bookings');
    const bookings = await bookingsCollection
      .find({
        eventId: { $in: eventIds },
        userId: { $in: allUserIds },
        status: { $in: ['booked', 'confirmed', 'success', 'paid'] },
      })
      .sort({ createdAt: -1 })
      .toArray();

    return users.map((user) => {
      const matchesUser = (item) =>
        item.userId?.toString() === user._id.toString() || String(item.userId) === String(user.userId);

      const joinRecord = joins.find(matchesUser);

      let userPayment = null;
      let userBooking = null;
      if (normalizedOccurrenceStart !== null) {
        userPayment = payments.find(
          (p) => matchesUser(p) && this.normalizeOccurrence(p.occurrenceStart || p.occurrenceDate) === normalizedOccurrenceStart
        );
        userBooking = bookings.find(
          (b) => matchesUser(b) && this.normalizeOccurrence(b.occurrenceStart || b.occurrenceDate) === normalizedOccurrenceStart
        );
      }
      if (!userPayment) {
        userPayment = payments.find(
          (p) => matchesUser(p) && (!normalizedOccurrenceStart || (!p.occurrenceStart && !p.occurrenceDate))
        );
      }
      if (!userBooking) {
        userBooking = bookings.find(
          (b) => matchesUser(b) && (!normalizedOccurrenceStart || (!b.occurrenceStart && !b.occurrenceDate))
        );
      }

      const resolvedPaidAmount =
        (userPayment && (userPayment.finalAmount ?? userPayment.amount)) ??
        (userBooking && (userBooking.finalAmount ?? userBooking.amount)) ??
        joinRecord?.paidAmount ??
        joinRecord?.amountPaid ??
        null;

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
        guestInfo: joinRecord?.guestInfo || [],
        paidAmount: resolvedPaidAmount,
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
    const match = { eventId: objectId };
    if (normalizedOccurrenceStart !== null) {
      match.occurrenceStart = normalizedOccurrenceStart;
    }

    const agg = await joinsCollection.aggregate([
      { $match: match },
      {
        $group: {
          _id: { userId: '$userId' },
          guestsCount: { $max: { $ifNull: ['$guestsCount', 1] } }
        }
      },
      { $group: { _id: null, total: { $sum: '$guestsCount' } } },
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
      const isNonRecurring = !event.eventFrequency || !Array.isArray(event.eventFrequency) || event.eventFrequency.length === 0;
      const eventJoins = joins.filter(j => j.eventId.toString() === event._id.toString());
      return {
        ...event,
        joinedOccurrences: eventJoins.map(j => ({
          joinedAt: j.joinedAt,
          occurrenceStart: isNonRecurring ? (event.eventDateTime || j.occurrenceStart || null) : (j.occurrenceStart || null),
          occurrenceEnd: isNonRecurring ? (event.eventEndDateTime || j.occurrenceEnd || null) : (j.occurrenceEnd || null),
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

  const query = { eventId: objectId };
  if (normalizedOccurrenceStart !== null) {
    query.occurrenceStart = normalizedOccurrenceStart;
  }

  const userIds = await joinsCollection.distinct('userId', query);
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

