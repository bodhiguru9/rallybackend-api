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
const packageDetailTemplate  = require('../../templates/package-detail');

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

/** Extract and validate viewer timezone from request cookies */
function getViewerTimeZone(req) {
  const cookieHeader = req?.headers?.cookie || '';
  const match = cookieHeader.match(/(?:^|;\s*)viewer_tz=([^;]+)/);
  if (match) {
    try {
      const decoded = decodeURIComponent(match[1]);
      Intl.DateTimeFormat(undefined, { timeZone: decoded });
      return decoded;
    } catch {
      // Invalid timeZone name, ignore
    }
  }
  return null;
}

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

/** Fetch joined users for packages from packagePurchases and users collections */
async function batchPackageParticipants(db, packages) {
  if (!packages || !packages.length) return new Map();
  const pkgKeys = [];
  packages.forEach(p => {
    if (p._id) {
      pkgKeys.push(p._id);
      pkgKeys.push(p._id.toString());
      const oid = toObjectId(p._id);
      if (oid) pkgKeys.push(oid);
    }
    if (p.packageId) pkgKeys.push(p.packageId);
  });

  const purchases = await db.collection('packagePurchases')
    .find({ packageId: { $in: pkgKeys } })
    .sort({ purchaseDate: 1 })
    .toArray();

  const buyerIds = purchases.map(p => {
    try {
      return typeof p.userId === 'string' ? new ObjectId(p.userId) : p.userId;
    } catch {
      return p.userId;
    }
  }).filter(Boolean);

  const buyers = buyerIds.length > 0
    ? await db.collection('users').find({
        $or: [
          { _id: { $in: buyerIds } },
          { _id: { $in: buyerIds.map(id => id.toString()) } }
        ]
      }).project({ _id: 1, userId: 1, fullName: 1, profilePic: 1, email: 1, mobileNumber: 1 }).toArray()
    : [];

  const buyerMap = new Map();
  buyers.forEach(b => {
    buyerMap.set(b._id.toString(), b);
    if (b.userId) buyerMap.set(String(b.userId), b);
  });

  const pkgMap = new Map();
  purchases.forEach(p => {
    const buyer = buyerMap.get(p.userId?.toString());
    const k1 = p.packageId?.toString();
    if (!pkgMap.has(k1)) pkgMap.set(k1, []);
    pkgMap.get(k1).push({
      purchaseId: p.purchaseId || p._id.toString(),
      purchaseDate: p.purchaseDate,
      user: buyer ? {
        userId: buyer.userId,
        fullName: buyer.fullName || 'Player',
        profilePic: buyer.profilePic || null,
        email: buyer.email || null,
        mobileNumber: buyer.mobileNumber || null,
      } : null,
    });
  });

  return pkgMap;
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
    const participantMap = await batchParticipants(db, eventIds, 50);

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

    const timeZone = getViewerTimeZone(req);
    const bodyContent = homeTemplate({ topOrganisers, featuredEvents, pickedEvents, timeZone });
    const html = shellTemplate({
      title: 'Find Sports Events Near You',
      bodyClass: 'org-bg',
      bodyContent,
      pageData: { pickedEvents, featuredEvents },
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

    const timeZone = getViewerTimeZone(req);
    let bodyContent;
    if (isPrivate) {
      bodyContent = privateEventWallTemplate({ eventId: idParam });
    } else {
      bodyContent = eventDetailTemplate({ event, timeZone });
    }

    const html = shellTemplate({
      title: event.eventName || 'Event Details',
      description: event.eventDescription,
      ogImage: (event.eventImages && event.eventImages[0]) || '',
      bodyClass: 'org-bg',
      bodyContent,
      pageData: { event, participants, participantsCount },
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

    // Total events hosted by this organiser (for profile Hosted stat)
    const totalEventsHosted = organiser.eventsCreated !== undefined && organiser.eventsCreated !== null && organiser.eventsCreated > 0
      ? organiser.eventsCreated
      : await db.collection('events').countDocuments({
          creatorId: { $in: [organiser._id, organiser._id.toString()] },
          eventStatus: { $nin: ['cancelled', 'draft'] },
        });

    // Upcoming events by this organiser (only upcoming/active events where eventEndDateTime >= currentTime)
    const now = new Date();
    const nowIso = now.toISOString();
    const fallbackStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const fallbackStartIso = fallbackStart.toISOString();

    const eventsRaw = await db.collection('events')
      .find({
        creatorId: { $in: [organiser._id, organiser._id.toString()] },
        eventStatus: { $nin: ['cancelled', 'draft'] },
        $or: [
          { eventEndDateTime: { $gte: now } },
          { eventEndDateTime: { $gte: nowIso } },
          {
            $and: [
              { $or: [{ eventEndDateTime: null }, { eventEndDateTime: { $exists: false } }, { eventEndDateTime: '' }] },
              {
                $or: [
                  { eventDateTime: { $gte: fallbackStart } },
                  { eventDateTime: { $gte: fallbackStartIso } },
                ]
              }
            ]
          }
        ]
      })
      .sort({ eventDateTime: 1 })
      .limit(50)
      .toArray();

    // Additional safeguard: exclude any events whose end date has passed (< currentTime)
    const upcomingEvents = eventsRaw.filter(ev => {
      const end = ev.eventEndDateTime ? new Date(ev.eventEndDateTime) : null;
      if (end && !isNaN(end.getTime())) {
        return end >= now;
      }
      const start = ev.eventDateTime ? new Date(ev.eventDateTime) : null;
      if (start && !isNaN(start.getTime())) {
        return start >= fallbackStart;
      }
      return true;
    });

    const eventIds = upcomingEvents.map(e => e._id);
    const participantMap = await batchParticipants(db, eventIds, 50);

    const events = upcomingEvents.map(ev => {
      const pData = participantMap.get(ev._id.toString()) || { count: 0, participants: [] };
      return {
        ...formatEventResponse(ev),
        _id: ev._id,
        participantsCount: pData.count,
        participants: pData.participants,
      };
    });

    // Packages
    const orgMatches = [organiser._id, organiser._id.toString()];
    if (organiser.userId) orgMatches.push(organiser.userId, String(organiser.userId));
    const packagesRaw = await db.collection('packages')
      .find({
        organiserId: { $in: orgMatches },
        isActive: { $ne: false }
      })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    const pkgPurchasesMap = await batchPackageParticipants(db, packagesRaw);

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
      eventsCreated: totalEventsHosted,
      totalAttendees: organiser.totalAttendees || 0,
      instagramHandle: organiser.instagramLink || organiser.instagram_link || organiser.instagramHandle || null,
      whatsappNumber: organiser.whatsappNumber || organiser.mobileNumber || null,
    };

    const packages = packagesRaw.map(pkg => {
      const pIdStr = pkg._id.toString();
      const pCode = pkg.packageId;
      const joinedUsers = (pkgPurchasesMap.get(pIdStr) || []).concat(pkgPurchasesMap.get(pCode) || []);
      const uniqueJoined = [];
      const seenUsers = new Set();
      joinedUsers.forEach(j => {
        const uKey = j.user?.userId || j.user?.fullName;
        if (uKey && !seenUsers.has(uKey)) {
          seenUsers.add(uKey);
          uniqueJoined.push(j);
        } else if (!uKey) {
          uniqueJoined.push(j);
        }
      });

      return {
        ...pkg,
        joinedUsers: uniqueJoined,
        joinedUsersCount: uniqueJoined.length,
        creator: organiserData,
      };
    });

    const timeZone = getViewerTimeZone(req);
    const bodyContent = organiserProfileTemplate({ organiser: organiserData, events, packages, timeZone });

    const html = shellTemplate({
      title: organiserData.communityName || organiserData.fullName || 'Organiser Profile',
      description: organiserData.organiserBio,
      ogImage: organiserData.profilePic || '',
      bodyClass: 'org-bg',
      bodyContent,
      pageData: { events, packages },
    });

    res.status(200).send(html);
  } catch (err) {
    console.error('[WebOrganiser] Error:', err);
    res.status(500).send('Server error');
  }
};

/* ------------------------------------------------------------------ */
/* GET /package/:id  —  Package Detail                                  */
/* ------------------------------------------------------------------ */
exports.renderPackageDetail = async (req, res) => {
  try {
    const db = getDB();
    const idParam = req.params.id;

    // Support sequential packageId (e.g. "PKG1", "PKG3") and MongoDB ObjectId
    let pkgDoc = null;
    const oid = toObjectId(idParam);
    if (oid) {
      pkgDoc = await db.collection('packages').findOne({ _id: oid });
    }
    if (!pkgDoc) {
      pkgDoc = await db.collection('packages').findOne({ packageId: idParam });
    }
    if (!pkgDoc && typeof idParam === 'string') {
      pkgDoc = await db.collection('packages').findOne({
        packageId: { $regex: new RegExp(`^${idParam}$`, 'i') }
      });
    }

    if (!pkgDoc) {
      return res.status(404).send('Package not found');
    }

    // Fetch creator organiser
    let creator = null;
    if (pkgDoc.organiserId) {
      const cOid = toObjectId(pkgDoc.organiserId);
      if (cOid) {
        creator = await db.collection('users').findOne({ _id: cOid });
      }
      if (!creator) {
        creator = await db.collection('users').findOne({ _id: pkgDoc.organiserId });
      }
      if (!creator && !isNaN(Number(pkgDoc.organiserId))) {
        creator = await db.collection('users').findOne({ userId: Number(pkgDoc.organiserId) });
      }
    }

    let totalAttendees = creator?.totalAttendees || 0;
    let eventsCreated = creator?.eventsCreated || 0;
    if (creator) {
      try {
        const events = await db.collection('events').find({
          creatorId: { $in: [creator._id, creator._id.toString()] }
        }).project({ _id: 1 }).toArray();
        if (eventsCreated === 0) eventsCreated = events.length;
        if (totalAttendees === 0 && events.length > 0) {
          const eventIds = events.map(e => e._id);
          const distinctUserIds = await db.collection('eventJoins').distinct('userId', { eventId: { $in: eventIds } });
          totalAttendees = distinctUserIds.length;
        }
      } catch (err) {}
    }

    const creatorData = creator ? {
      userId: creator.userId,
      fullName: creator.fullName || null,
      communityName: creator.communityName || null,
      profilePic: creator.profilePic || null,
      eventsCreated,
      totalAttendees,
      instagramLink: creator.instagramLink || creator.instagram_link || null,
      whatsappNumber: creator.whatsappNumber || creator.mobileNumber || null,
    } : null;

    // Fetch joined users / purchases
    const pkgPurchasesMap = await batchPackageParticipants(db, [pkgDoc]);
    const pIdStr = pkgDoc._id.toString();
    const pCode = pkgDoc.packageId;
    const joinedUsers = (pkgPurchasesMap.get(pIdStr) || []).concat(pkgPurchasesMap.get(pCode) || []);
    const uniqueJoined = [];
    const seenUsers = new Set();
    joinedUsers.forEach(j => {
      const uKey = j.user?.userId || j.user?.fullName;
      if (uKey && !seenUsers.has(uKey)) {
        seenUsers.add(uKey);
        uniqueJoined.push(j);
      } else if (!uKey) {
        uniqueJoined.push(j);
      }
    });

    const pkg = {
      ...pkgDoc,
      _id: pkgDoc._id,
      joinedUsers: uniqueJoined,
      purchasedBy: uniqueJoined,
      joinedUsersCount: uniqueJoined.length,
      creator: creatorData,
    };

    const timeZone = getViewerTimeZone(req);
    const bodyContent = packageDetailTemplate({ package: pkg, organiser: creatorData, timeZone });

    const html = shellTemplate({
      title: pkg.packageName || 'Package Details',
      description: pkg.packageDescription || 'Check out this package on Rally!',
      ogImage: pkg.imageUri || (pkg.packageImages && pkg.packageImages[0]) || creatorData?.profilePic || '',
      bodyClass: 'org-bg',
      bodyContent,
      pageData: { package: pkg, participants: uniqueJoined },
    });

    res.status(200).send(html);
  } catch (err) {
    console.error('[WebPackage] Error:', err);
    res.status(500).send('Server error');
  }
};
