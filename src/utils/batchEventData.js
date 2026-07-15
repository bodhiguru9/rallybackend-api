const { getDB } = require('../config/database');
const { ObjectId } = require('mongodb');

/**
 * Batch-loading helpers for event-related data (participants, join status, waitlist).
 *
 * These replace per-event DB calls inside Promise.all loops (N+1 pattern) with
 * single bulk queries, dramatically reducing DB round-trips on list endpoints.
 * Now fully occurrence-aware to ensure exact spot counts for recurring events without cross-occurrence inflation.
 */

/**
 * Helper to normalize occurrence date strings/objects to ISO string or null
 */
function normalizeOccurrence(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Helper to build an occurrence resolution map for a list of events.
 * @param {Array<Object>} events - Array of event objects (from DB or formatted)
 * @param {Object} [requestedOccurrences={}] - Optional map of eventId -> requested occurrence date
 * @returns {Map<string, { normOcc: string|null, isRecurring: boolean }>}
 */
function buildOccurrenceMap(events, requestedOccurrences = {}) {
  const map = new Map();
  if (!Array.isArray(events)) return map;
  for (const e of events) {
    if (!e || (!e._id && !e.eventId && !e.mongoId)) continue;
    const idStr = (e._id || e.mongoId || e.eventId).toString();
    const isRecurring = Array.isArray(e.eventFrequency) && e.eventFrequency.length > 0;
    const rawOcc = requestedOccurrences[idStr] || requestedOccurrences.global || e.eventDateTime || null;
    const normOcc = normalizeOccurrence(rawOcc);
    map.set(idStr, { normOcc, isRecurring });
  }
  return map;
}

/**
 * Helper to resolve target options for a given event ID string from occurrenceOptions
 */
function getEventOccurrenceOptions(idStr, occurrenceOptions) {
  if (!occurrenceOptions) return { normOcc: null, isRecurring: false };
  const opt = occurrenceOptions instanceof Map ? occurrenceOptions.get(idStr) : occurrenceOptions[idStr];
  if (!opt) return { normOcc: null, isRecurring: false };
  return {
    normOcc: normalizeOccurrence(opt.normOcc !== undefined ? opt.normOcc : opt),
    isRecurring: !!opt.isRecurring,
  };
}

/**
 * Batch participant counts for multiple events in a single aggregation.
 * Replaces N calls to EventJoin.getParticipantCount() inside a loop.
 *
 * @param {Array<ObjectId>} eventIds - Array of event MongoDB ObjectIds
 * @param {Map<string, {normOcc: string|null, isRecurring: boolean}>|Object} [occurrenceOptions=null]
 * @returns {Promise<Map<string, number>>} Map of eventId string → participant count
 */
async function batchParticipantCounts(eventIds, occurrenceOptions = null) {
  const map = new Map();
  if (!Array.isArray(eventIds) || eventIds.length === 0) return map;

  const db = getDB();
  const joinsCollection = db.collection('eventJoins');

  // Group by eventId, occurrenceStart, AND userId first to deduplicate race-condition/historical double joins
  const agg = await joinsCollection
    .aggregate([
      { $match: { eventId: { $in: eventIds } } },
      {
        $group: {
          _id: {
            eventId: '$eventId',
            occurrenceStart: { $ifNull: ['$occurrenceStart', null] },
            userId: '$userId',
          },
          guestsCount: { $max: { $ifNull: ['$guestsCount', 1] } },
        },
      },
      {
        $group: {
          _id: {
            eventId: '$_id.eventId',
            occurrenceStart: '$_id.occurrenceStart',
          },
          total: { $sum: '$guestsCount' },
        },
      },
    ])
    .toArray();

  // Index aggregation rows by eventId -> array of rows
  const rowsByEventId = new Map();
  for (const row of agg) {
    const idStr = row._id.eventId.toString();
    if (!rowsByEventId.has(idStr)) rowsByEventId.set(idStr, []);
    rowsByEventId.get(idStr).push(row);
  }

  for (const id of eventIds) {
    const idStr = id.toString();
    const rows = rowsByEventId.get(idStr) || [];
    const { normOcc, isRecurring } = getEventOccurrenceOptions(idStr, occurrenceOptions);

    if (isRecurring) {
      // For recurring events, match exact target occurrence (or null if target is null)
      const targetRow = rows.find(r => normalizeOccurrence(r._id.occurrenceStart) === normOcc);
      map.set(idStr, targetRow ? targetRow.total : 0);
    } else {
      // For non-recurring events, sum across all rows for this event ID
      const total = rows.reduce((sum, r) => sum + r.total, 0);
      map.set(idStr, total);
    }
  }

  return map;
}

/**
 * Batch waitlist counts for multiple events in a single query.
 * Replaces N calls to Waitlist.getWaitlistCount() inside a loop.
 *
 * @param {Array<ObjectId>} eventIds - Array of event MongoDB ObjectIds
 * @param {Map<string, {normOcc: string|null, isRecurring: boolean}>|Object} [occurrenceOptions=null]
 * @returns {Promise<Map<string, number>>} Map of eventId string → waitlist count
 */
async function batchWaitlistCounts(eventIds, occurrenceOptions = null) {
  const map = new Map();
  if (!Array.isArray(eventIds) || eventIds.length === 0) return map;

  const db = getDB();
  const waitlistCollection = db.collection('waitlist');

  const agg = await waitlistCollection
    .aggregate([
      { $match: { eventId: { $in: eventIds }, status: 'pending' } },
      {
        $group: {
          _id: {
            eventId: '$eventId',
            occurrenceStart: { $ifNull: ['$occurrenceStart', null] },
          },
          count: { $sum: 1 },
        },
      },
    ])
    .toArray();

  const rowsByEventId = new Map();
  for (const row of agg) {
    const idStr = row._id.eventId.toString();
    if (!rowsByEventId.has(idStr)) rowsByEventId.set(idStr, []);
    rowsByEventId.get(idStr).push(row);
  }

  for (const id of eventIds) {
    const idStr = id.toString();
    const rows = rowsByEventId.get(idStr) || [];
    const { normOcc, isRecurring } = getEventOccurrenceOptions(idStr, occurrenceOptions);

    if (isRecurring) {
      const targetRow = rows.find(r => normalizeOccurrence(r._id.occurrenceStart) === normOcc);
      map.set(idStr, targetRow ? targetRow.count : 0);
    } else {
      const total = rows.reduce((sum, r) => sum + r.count, 0);
      map.set(idStr, total);
    }
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
 * @param {Map<string, {normOcc: string|null, isRecurring: boolean}>|Object} [occurrenceOptions=null]
 * @returns {Promise<{joinedSet: Set<string>, waitlistedSet: Set<string>, requestedSet: Set<string>}>}
 */
async function batchUserEventStatus(userId, eventIds, occurrenceOptions = null) {
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
        { projection: { eventId: 1, occurrenceStart: 1 } }
      )
      .toArray(),
    db
      .collection('waitlist')
      .find(
        { userId: userObjectId, eventId: { $in: eventIds }, status: 'pending' },
        { projection: { eventId: 1, occurrenceStart: 1 } }
      )
      .toArray(),
    db
      .collection('eventJoinRequests')
      .find(
        { userId: userObjectId, eventId: { $in: eventIds }, status: 'pending' },
        { projection: { eventId: 1, occurrenceStart: 1 } }
      )
      .toArray(),
  ]);

  for (const r of joinedRows) {
    const idStr = r.eventId.toString();
    const { normOcc, isRecurring } = getEventOccurrenceOptions(idStr, occurrenceOptions);
    if (!isRecurring || normalizeOccurrence(r.occurrenceStart) === normOcc) {
      result.joinedSet.add(idStr);
    }
  }

  for (const r of waitlistedRows) {
    const idStr = r.eventId.toString();
    const { normOcc, isRecurring } = getEventOccurrenceOptions(idStr, occurrenceOptions);
    if (!isRecurring || normalizeOccurrence(r.occurrenceStart) === normOcc) {
      result.waitlistedSet.add(idStr);
    }
  }

  for (const r of requestedRows) {
    const idStr = r.eventId.toString();
    const { normOcc, isRecurring } = getEventOccurrenceOptions(idStr, occurrenceOptions);
    if (!isRecurring || normalizeOccurrence(r.occurrenceStart) === normOcc) {
      result.requestedSet.add(idStr);
    }
  }

  return result;
}

/**
 * Batch-fetch first N participants (with user profiles) for multiple events.
 * Replaces N calls to EventJoin.getEventParticipants() inside a loop.
 *
 * @param {Array<ObjectId>} eventIds - Array of event MongoDB ObjectIds
 * @param {number} limitPerEvent - Max participants per event (default 10)
 * @param {Map<string, {normOcc: string|null, isRecurring: boolean}>|Object} [occurrenceOptions=null]
 * @returns {Promise<Map<string, Array>>} Map of eventId string → participants array
 */
async function batchEventParticipants(eventIds, limitPerEvent = 10, occurrenceOptions = null) {
  const map = new Map();
  if (!Array.isArray(eventIds) || eventIds.length === 0) return map;

  const db = getDB();
  const joinsCollection = db.collection('eventJoins');
  const usersCollection = db.collection('users');

  // Get joins grouped by both eventId and occurrenceStart
  const joins = await joinsCollection
    .aggregate([
      { $match: { eventId: { $in: eventIds } } },
      { $sort: { joinedAt: -1 } },
      {
        $group: {
          _id: {
            eventId: '$eventId',
            occurrenceStart: { $ifNull: ['$occurrenceStart', null] },
          },
          joins: { $push: { userId: '$userId', joinedAt: '$joinedAt', guestsCount: '$guestsCount', occurrenceStart: '$occurrenceStart' } },
        },
      },
    ])
    .toArray();

  const groupsByEventId = new Map();
  for (const group of joins) {
    const idStr = group._id.eventId.toString();
    if (!groupsByEventId.has(idStr)) groupsByEventId.set(idStr, []);
    groupsByEventId.get(idStr).push(group);
  }

  // Collect unique userIds for profile fetching
  const allUserIds = new Set();
  const selectedJoinsByEventId = new Map();

  for (const id of eventIds) {
    const idStr = id.toString();
    const groups = groupsByEventId.get(idStr) || [];
    const { normOcc, isRecurring } = getEventOccurrenceOptions(idStr, occurrenceOptions);

    let eventJoinsList = [];
    if (isRecurring) {
      const targetGroup = groups.find(g => normalizeOccurrence(g._id.occurrenceStart) === normOcc);
      if (targetGroup) eventJoinsList = targetGroup.joins.slice(0, limitPerEvent);
    } else {
      // Combine all joins across groups for non-recurring events, sort by joinedAt desc, and slice
      for (const g of groups) {
        eventJoinsList.push(...g.joins);
      }
      eventJoinsList.sort((a, b) => new Date(b.joinedAt) - new Date(a.joinedAt));
      eventJoinsList = eventJoinsList.slice(0, limitPerEvent);
    }

    selectedJoinsByEventId.set(idStr, eventJoinsList);
    for (const j of eventJoinsList) {
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
  for (const id of eventIds) {
    const idStr = id.toString();
    const eventJoinsList = selectedJoinsByEventId.get(idStr) || [];
    const participants = eventJoinsList.map((j) => {
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
    map.set(idStr, participants);
  }

  return map;
}

module.exports = {
  normalizeOccurrence,
  buildOccurrenceMap,
  batchParticipantCounts,
  batchWaitlistCounts,
  batchUserEventStatus,
  batchEventParticipants,
};
