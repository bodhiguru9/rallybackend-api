/**
 * Web Controller — Renders HTML web preview pages
 * Uses direct DB queries (NOT the Express controllers) to avoid auth/coupling issues.
 */
const { getDB } = require('../../config/database');
const { ObjectId } = require('mongodb');
const { formatEventResponse } = require('../../utils/eventFields');

const shellTemplate          = require('../../templates/shell');
const homeTemplate           = require('../../templates/home');
const eventDetailTemplate    = require('../../templates/event-detail');
const privateEventWallTemplate = require('../../templates/private-event-wall');
const organiserProfileTemplate = require('../../templates/organiser-profile');

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

/** Try to convert a string to ObjectId; return null on failure */
function toObjectId(id) {
  try { return new ObjectId(id); } catch { return null; }
}

/** Fetch participants preview for a list of event _ids */
async function batchParticipants(db, eventIds, limit = 10) {
  if (!eventIds.length) return new Map();
  const docs = await db.collection('eventJoins')
    .aggregate([
      { $match: { eventId: { $in: eventIds } } },
      { $sort:  { joinedAt: 1 } },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          fullName: '$user.fullName',
          profilePic: '$user.profilePic'
        }
      },
      { $project: { user: 0 } },
      { 
        $group: { 
          _id: '$eventId', 
          participants: { $push: '$$ROOT' }, 
          count: { $sum: { $max: [{ $ifNull: ['$guestsCount', 1] }, 1] } } 
        } 
      }
    ]).toArray();
  const map = new Map();
  for (const d of docs) {
    map.set(d._id.toString(), { participants: d.participants.slice(0, limit), count: d.count });
  }
  return map;
}

/* ------------------------------------------------------------------ */
/* GET /  —  Homepage                                                   */
/* ------------------------------------------------------------------ */
exports.renderHome = async (req, res) => {
  try {
    const db = getDB();

    // 1. Top Organisers — same sort as getTopOrganisers controller
    const topOrganisers = await db.collection('users').aggregate([
      { $match: { userType: 'organiser' } },
      { $addFields: {
          prioritySort: {
            $switch: {
              branches: [
                { case: { $in: ['$communityName', ['Shuttle Shots','Shuttleshots','ShuttleShots']] }, then: 1 },
                { case: { $in: ['$communityName', ['Rally Socials','rally socials']] }, then: 2 },
                { case: { $in: ['$communityName', ['Badminton For All - Dubai','Badminton for All']] }, then: 3 },
                { case: { $in: ['$communityName', ['Berry Badminton','berry badminton']] }, then: 4 },
              ],
              default: 99
            }
          }
      }},
      { $sort: { prioritySort: 1, followersCount: -1, totalAttendees: -1, eventsCreated: -1 } },
      { $limit: 10 },
      { $project: { userId: 1, profilePic: 1, fullName: 1, communityName: 1, isEmailVerified: 1, isMobileVerified: 1 } }
    ]).toArray();

    // 2. Events — same query as the app: public, upcoming, sorted by date
    const now = new Date();
    const eventsRaw = await db.collection('events')
      .find({
        IsPrivateEvent: { $ne: true },
        eventStatus: { $nin: ['draft', 'cancelled'] },
        $or: [
          { eventEndDateTime: { $gte: now } },
          { eventEndDateTime: null, eventDateTime: { $gte: new Date(now - 24 * 60 * 60 * 1000) } },
          { eventEndDateTime: { $exists: false }, eventDateTime: { $gte: new Date(now - 24 * 60 * 60 * 1000) } },
        ]
      })
      .sort({ eventDateTime: 1 })
      .limit(40)
      .toArray();

    // Batch participant counts
    const eventIds = eventsRaw.map(e => e._id);
    const participantMap = await batchParticipants(db, eventIds, 5);

    // Batch-fetch creators in one query
    const creatorIds = [...new Set(eventsRaw.map(e => e.creatorId).filter(Boolean))];
    const creatorDocs = await db.collection('users')
      .find({ _id: { $in: creatorIds } })
      .project({ _id: 1, userId: 1, fullName: 1, communityName: 1, profilePic: 1 })
      .toArray();
    const creatorMap = new Map(creatorDocs.map(c => [c._id.toString(), c]));

    const events = eventsRaw.map(ev => {
      const creator = creatorMap.get(ev.creatorId?.toString());
      const pData   = participantMap.get(ev._id.toString()) || { count: 0, participants: [] };
      return {
        ...formatEventResponse(ev),
        _id: ev._id,
        creator: creator ? {
          userId: creator.userId,
          fullName: creator.fullName,
          communityName: creator.communityName,
          profilePic: creator.profilePic,
        } : null,
        participantsCount: pData.count,
        participants: pData.participants,
      };
    });

    const featuredEvents = events.slice(0, 4);
    const pickedEvents   = events;

    const bodyContent = homeTemplate({ topOrganisers, featuredEvents, pickedEvents });
    const html = shellTemplate({
      title: 'Find Sports Events Near You',
      bodyClass: 'org-bg',
      bodyContent,
      pageData: { pickedEvents },
    });

    res.status(200).send(html);
  } catch (err) {
    console.error('[WebHome] Error:', err);
    res.status(500).send('Server error');
  }
};

/* ------------------------------------------------------------------ */
/* GET /event/:id  —  Event Detail                                      */
/* ------------------------------------------------------------------ */
exports.renderEventDetail = async (req, res) => {
  try {
    const db = getDB();
    const idParam = req.params.id;

    // Support both sequential eventId ("E2") and MongoDB ObjectId
    let eventDoc = null;
    const oid = toObjectId(idParam);
    if (oid) {
      eventDoc = await db.collection('events').findOne({ _id: oid });
    }
    if (!eventDoc) {
      eventDoc = await db.collection('events').findOne({ eventId: idParam });
    }

    if (!eventDoc) {
      return res.status(404).send('Event not found');
    }

    // Fetch creator
    const creator = eventDoc.creatorId
      ? await db.collection('users').findOne(
          { _id: typeof eventDoc.creatorId === 'string' ? toObjectId(eventDoc.creatorId) : eventDoc.creatorId },
          { projection: { userId: 1, fullName: 1, communityName: 1, profilePic: 1, eventsCreated: 1, totalAttendees: 1 } }
        )
      : null;

    // Fetch participants (first 50)
    const pData = await batchParticipants(db, [eventDoc._id], 50);
    const { participants = [], count: participantsCount = 0 } = pData.get(eventDoc._id.toString()) || {};

    const event = {
      ...formatEventResponse(eventDoc),
      _id: eventDoc._id,
      creator,
      participants,
      participantsCount,
    };

    // DB stores IsPrivateEvent (capital I)
    const isPrivate = eventDoc.IsPrivateEvent === true || eventDoc.isPrivateEvent === true;

    let bodyContent;
    if (isPrivate) {
      bodyContent = privateEventWallTemplate({ eventId: idParam });
    } else {
      bodyContent = eventDetailTemplate({ event });
    }

    const html = shellTemplate({
      title: event.eventName || 'Event Details',
      description: event.eventDescription,
      ogImage: (event.eventImages && event.eventImages[0]) || '',
      bodyClass: 'org-bg',
      bodyContent,
      pageData: { participants, participantsCount },
    });

    res.status(200).send(html);
  } catch (err) {
    console.error('[WebEvent] Error:', err);
    res.status(500).send('Server error');
  }
};

/* ------------------------------------------------------------------ */
/* GET /organiser/:id  —  Organiser Profile                             */
/* ------------------------------------------------------------------ */
exports.renderOrganiserProfile = async (req, res) => {
  try {
    const db = getDB();
    const idParam = req.params.id; // numeric userId e.g. "1065" or ObjectId string

    // Find organiser — support numeric userId OR ObjectId
    let organiser = null;
    const numericId = parseInt(idParam, 10);
    if (!isNaN(numericId)) {
      organiser = await db.collection('users').findOne({ userId: numericId, userType: 'organiser' });
    }
    if (!organiser) {
      const oid = toObjectId(idParam);
      if (oid) organiser = await db.collection('users').findOne({ _id: oid, userType: 'organiser' });
    }

    if (!organiser) {
      return res.status(404).send('Organiser not found');
    }

    // Collect organiser sports
    const organiserSports = [];
    if (organiser.sport1) organiserSports.push(organiser.sport1);
    if (organiser.sport2) organiserSports.push(organiser.sport2);
    if (Array.isArray(organiser.sports)) {
      organiser.sports.forEach(s => {
        if (s && !organiserSports.includes(s)) organiserSports.push(s);
      });
    }

    // Follower count
    const followersCount = await db.collection('follows').countDocuments({ followingId: organiser._id });

    // Events by this organiser
    const eventsRaw = await db.collection('events')
      .find({
        creatorId: { $in: [organiser._id, organiser._id.toString()] },
        eventStatus: { $nin: ['cancelled', 'draft'] },
      })
      .sort({ eventDateTime: 1 })
      .limit(50)
      .toArray();

    const eventIds = eventsRaw.map(e => e._id);
    const participantMap = await batchParticipants(db, eventIds, 5);

    const events = eventsRaw.map(ev => {
      const pData = participantMap.get(ev._id.toString()) || { count: 0, participants: [] };
      return {
        ...formatEventResponse(ev),
        _id: ev._id,
        participantsCount: pData.count,
        participants: pData.participants,
      };
    });

    // Packages
    const packages = await db.collection('packages')
      .find({ organiserId: organiser._id, isActive: true })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    // Build enriched organiser object for the template
    const organiserData = {
      userId: organiser.userId,
      fullName: organiser.fullName || null,
      communityName: organiser.communityName || null,
      profilePic: organiser.profilePic || null,
      organiserBio: organiser.bio || organiser.organiserBio || null,
      organiserSports: organiserSports,
      isVerified: !!(organiser.isEmailVerified || organiser.isMobileVerified),
      followersCount,
      eventsCreated: organiser.eventsCreated || eventsRaw.length,
      totalAttendees: organiser.totalAttendees || 0,
      instagramHandle: organiser.instagramLink || organiser.instagram_link || organiser.instagramHandle || null,
      whatsappNumber: organiser.whatsappNumber || organiser.mobileNumber || null,
    };

    const bodyContent = organiserProfileTemplate({ organiser: organiserData, events, packages });

    const html = shellTemplate({
      title: organiserData.communityName || organiserData.fullName || 'Organiser Profile',
      description: organiserData.organiserBio,
      ogImage: organiserData.profilePic || '',
      bodyClass: 'org-bg',
      bodyContent,
      pageData: {},
    });

    res.status(200).send(html);
  } catch (err) {
    console.error('[WebOrganiser] Error:', err);
    res.status(500).send('Server error');
  }
};
