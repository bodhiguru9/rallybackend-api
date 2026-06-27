const { getDB } = require('../config/database');
const { ObjectId } = require('mongodb');

/**
 * Batch-loading helpers for event-related data (participants, join status, waitlist).
 *
 * These replace per-event DB calls inside Promise.all loops (N+1 pattern) with
 * single bulk queries, dramatically reducing DB round-trips on list endpoints.
 */

/**
 * Batch participant counts for multiple events in a single aggregation.
 * Replaces N calls to EventJoin.getParticipantCount() inside a loop.
 *
 * @param {Array<ObjectId>} eventIds - Array of event MongoDB ObjectIds
 * @returns {Promise<Map<string, number>>} Map of eventId string → participant count
 */
async function batchParticipantCounts(eventIds) {
  const map = new Map();
  if (!Array.isArray(eventIds) || eventIds.length === 0) return map;

  const db = getDB();
  const joinsCollection = db.collection('eventJoins');

  const agg = await joinsCollection
    .aggregate([
      { $match: { eventId: { $in: eventIds } } },
      {
        $group: {
          _id: '$eventId',
          total: { $sum: { $ifNull: ['$guestsCount', 1] } },
        },
      },
    ])
    .toArray();

  for (const row of agg) {
    map.set(row._id.toString(), row.total);
  }
  return map;
}

/**
 * Batch waitlist counts for multiple events in a single query.
 * Replaces N calls to Waitlist.getWaitlistCount() inside a loop.
 *
 * @param {Array<ObjectId>} eventIds - Array of event MongoDB ObjectIds
 * @returns {Promise<Map<string, number>>} Map of eventId string → waitlist count
 */
async function batchWaitlistCounts(eventIds) {
  const map = new Map();
  if (!Array.isArray(eventIds) || eventIds.length === 0) return map;

  const db = getDB();
  const waitlistCollection = db.collection('waitlist');

  const agg = await waitlistCollection
    .aggregate([
      { $match: { eventId: { $in: eventIds }, status: 'pending' } },
      { $group: { _id: '$eventId', count: { $sum: 1 } } },
    ])
    .toArray();

  for (const row of agg) {
    map.set(row._id.toString(), row.count);
  }
  return map;
}

/**
 * Batch-check a user's join/waitlist/request status across multiple events.
 * Replaces N calls to EventJoin.hasJoined() + Waitlist.isInWaitlist() +
 * EventJoinRequest.findPendingByUserAndEvent() inside a loop.
 *
 * @param {string|ObjectId} userId - The user's MongoDB ObjectId
 * @param {Array<ObjectId>} eventIds - Array of event MongoDB ObjectIds
 * @returns {Promise<{joinedSet: Set<string>, waitlistedSet: Set<string>, requestedSet: Set<string>}>}
 */
async function batchUserEventStatus(userId, eventIds) {
  const result = {
    joinedSet: new Set(),
    waitlistedSet: new Set(),
    requestedSet: new Set(),
  };
  if (!userId || !Array.isArray(eventIds) || eventIds.length === 0) return result;

  const db = getDB();
  const userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;

  const [joinedRows, waitlistedRows, requestedRows] = await Promise.all([
    db
      .collection('eventJoins')
      .find(
        { userId: userObjectId, eventId: { $in: eventIds } },
        { projection: { eventId: 1 } }
      )
      .toArray(),
    db
      .collection('waitlist')
      .find(
        { userId: userObjectId, eventId: { $in: eventIds }, status: 'pending' },
        { projection: { eventId: 1 } }
      )
      .toArray(),
    db
      .collection('eventJoinRequests')
      .find(
        { userId: userObjectId, eventId: { $in: eventIds }, status: 'pending' },
        { projection: { eventId: 1 } }
      )
      .toArray(),
  ]);

  for (const r of joinedRows) result.joinedSet.add(r.eventId.toString());
  for (const r of waitlistedRows) result.waitlistedSet.add(r.eventId.toString());
  for (const r of requestedRows) result.requestedSet.add(r.eventId.toString());

  return result;
}

/**
 * Batch-fetch first N participants (with user profiles) for multiple events.
 * Replaces N calls to EventJoin.getEventParticipants() inside a loop.
 *
 * @param {Array<ObjectId>} eventIds - Array of event MongoDB ObjectIds
 * @param {number} limitPerEvent - Max participants per event (default 10)
 * @returns {Promise<Map<string, Array>>} Map of eventId string → participants array
 */
async function batchEventParticipants(eventIds, limitPerEvent = 10) {
  const map = new Map();
  if (!Array.isArray(eventIds) || eventIds.length === 0) return map;

  const db = getDB();
  const joinsCollection = db.collection('eventJoins');
  const usersCollection = db.collection('users');

  // Get recent joins for all events, sorted by joinedAt desc, limited per event
  const joins = await joinsCollection
    .aggregate([
      { $match: { eventId: { $in: eventIds } } },
      { $sort: { joinedAt: -1 } },
      {
        $group: {
          _id: '$eventId',
          joins: { $push: { userId: '$userId', joinedAt: '$joinedAt', guestsCount: '$guestsCount' } },
        },
      },
      {
        $project: {
          joins: { $slice: ['$joins', limitPerEvent] },
        },
      },
    ])
    .toArray();

  // Collect all unique userIds across all events
  const allUserIds = new Set();
  for (const group of joins) {
    for (const j of group.joins) {
      allUserIds.add(j.userId.toString());
    }
  }

  // Batch-fetch user profiles
  const userObjectIds = Array.from(allUserIds).map((id) => {
    try { return new ObjectId(id); } catch { return null; }
  }).filter(Boolean);

  const users = userObjectIds.length > 0
    ? await usersCollection.find({ _id: { $in: userObjectIds } }).toArray()
    : [];
  const userMap = new Map();
  for (const u of users) userMap.set(u._id.toString(), u);

  // Build the result
  for (const group of joins) {
    const participants = group.joins.map((j) => {
      const user = userMap.get(j.userId.toString());
      if (!user) return null;
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
        joinedAt: j.joinedAt,
        guestsCount: j.guestsCount >= 1 ? j.guestsCount : 1,
      };
    }).filter(Boolean);
    map.set(group._id.toString(), participants);
  }

  return map;
}

module.exports = {
  batchParticipantCounts,
  batchWaitlistCounts,
  batchUserEventStatus,
  batchEventParticipants,
};
