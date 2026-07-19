const User = require('../../models/User');
const Event = require('../../models/Event');
const EventJoin = require('../../models/EventJoin');
const Waitlist = require('../../models/Waitlist');
const Follow = require('../../models/Follow');
const { formatEventResponse } = require('../../utils/eventFields');
const { getPaginationParams, createPaginationResponse } = require('../../utils/pagination');
const { getDB } = require('../../config/database');

const buildCommunityId = (organiser) => `Community${organiser.userId}`;

/**
 * @desc    Get organiser community details with all their events
 * @route   GET /api/users/community/:communityName?page=1
 * @access  Public
 * 
 * Returns:
 * - Organiser details: userId, profilePic, fullName, communityName
 * - All events created by that organiser
 * - Full event details including spots information
 */
const getCommunityDetails = async (req, res, next) => {
  try {
    const { communityName } = req.params;

    if (!communityName || communityName.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Community name is required',
      });
    }

    const { page, perPage, skip } = getPaginationParams(req.query.page, 20);

    const db = getDB();
    const usersCollection = db.collection('users');

    // Find organiser by communityName (case-insensitive)
    const organiser = await usersCollection.findOne({
      userType: 'organiser',
      communityName: { $regex: new RegExp(`^${communityName.trim()}$`, 'i') },
    });

    if (!organiser) {
      return res.status(404).json({
        success: false,
        error: 'Community not found',
        communityName: communityName,
      });
    }

    // Get total event count and only the current page of events (DB-level pagination)
    const Event = require('../../models/Event');
    const totalEventsHosted = await Event.getEventCount(organiser._id);
    const pageEvents = await Event.findByCreator(organiser._id, perPage, skip);

    // Calculate total attendees across all events (single aggregation)
    let totalAttendees = 0;
    if (totalEventsHosted > 0) {
      const eventJoinsCollection = db.collection('eventJoins');
      const eventsCollection = db.collection('events');

      // Get all event IDs for this organiser (lightweight — only _id projection)
      const allEventDocs = await eventsCollection
        .find({ creatorId: { $in: [organiser._id, organiser._id.toString()] } })
        .project({ _id: 1 })
        .toArray();
      const allEventIds = allEventDocs.map((e) => e._id);

      if (allEventIds.length > 0) {
        const attendeesByEvent = await eventJoinsCollection
          .aggregate([
            { $match: { eventId: { $in: allEventIds } } },
            { $group: { _id: '$eventId', count: { $sum: 1 } } },
          ])
          .toArray();

        attendeesByEvent.forEach((ae) => {
          totalAttendees += ae.count || 0;
        });
      }
    }

    // Get follower count (total subscribers)
    const totalSubscribers = await Follow.getFollowerCount(organiser._id.toString());

    // Get organiser sports (combine sport1, sport2, and sports array)
    const organiserSports = [];
    if (organiser.sport1) organiserSports.push(organiser.sport1);
    if (organiser.sport2) organiserSports.push(organiser.sport2);
    if (organiser.sports && Array.isArray(organiser.sports)) {
      organiser.sports.forEach((sport) => {
        if (sport && typeof sport === 'string' && sport.trim() && !organiserSports.includes(sport.trim())) {
          organiserSports.push(sport.trim());
        }
      });
    }

    // Batch-fetch participant counts and participants preview for the current page only using occurrence-aware batch helpers
    const { buildOccurrenceMap, batchParticipantCounts, batchEventParticipants, batchUserEventStatus } = require('../../utils/batchEventData');
    const pageEventIds = pageEvents.map((e) => e._id);
    const occurrenceMap = buildOccurrenceMap(pageEvents);
    const [participantCountMap, participantsPreviewMap] = await Promise.all([
      batchParticipantCounts(pageEventIds, occurrenceMap),
      batchEventParticipants(pageEventIds, 10, occurrenceMap),
    ]);

    // Batch user status if authenticated
    let userStatusBatch = { joinedSet: new Set(), waitlistedSet: new Set(), requestedSet: new Set() };
    if (req.user && req.user.id) {
      userStatusBatch = await batchUserEventStatus(req.user.id, pageEventIds, occurrenceMap);
    }

    // Format events with full details — NO per-event DB calls
    const eventsWithDetails = pageEvents.map((event) => {
        // Support both old and new field names for backward compatibility
        const isPrivate = event.IsPrivateEvent !== undefined ? event.IsPrivateEvent : (event.visibility === 'private');
        const maxGuest = event.eventMaxGuest !== undefined ? event.eventMaxGuest : (event.gameSpots || 0);

        const eventIdStr = event._id.toString();
        const participantsCount = participantCountMap.get(eventIdStr) || 0;
        const participants = participantsPreviewMap.get(eventIdStr) || [];

        // Calculate spots information
        const spotsFull = participantsCount >= maxGuest;
        const availableSpots = Math.max(0, maxGuest - participantsCount);
        const spotsBooked = participantsCount;
        const spotsLeft = availableSpots;

        // Return only limited event fields as requested
        return {
          eventId: event.eventId || null,
          eventName: event.eventName || null,
          eventSports: event.eventSports || [],
          eventType: event.eventType || null,
          eventDateTime: event.eventDateTime || event.gameStartDate || null,
          eventLocation: event.eventLocation || null,
          eventImages: event.eventImages || event.gameImages || [],
          eventPricePerGuest: event.eventPricePerGuest || event.gameJoinPrice || 0,
          participants: participants,
          participantsCount: participantsCount,
          spotsInfo: {
            totalSpots: maxGuest,
            spotsBooked: spotsBooked,
            spotsLeft: spotsLeft,
            spotsFull: spotsFull,
          },
          creator: {
            userId: organiser.userId,
            fullName: organiser.fullName,
            profilePic: organiser.profilePic,
          },
          eventCreatorName: organiser.fullName,
          eventCreatorProfilePic: organiser.profilePic,
        };
      });

    // Pagination uses the DB total count
    const totalCount = totalEventsHosted;
    const pagination = createPaginationResponse(totalCount, page, perPage);

    return res.status(200).json({
      success: true,
      message: 'Community details retrieved successfully',
      data: {
        organiser: {
          userId: organiser.userId,
          communityId: buildCommunityId(organiser),
          profilePic: organiser.profilePic || null,
          fullName: organiser.fullName || null,
          communityName: organiser.communityName || null,
          profileVisibility: organiser.profileVisibility || 'private',
          totalEventsHosted: totalEventsHosted,
          totalAttendees: totalAttendees,
          totalSubscribers: totalSubscribers,
          bio: organiser.bio || null,
          sports: organiserSports,
          isVerified: !!(organiser.isEmailVerified || organiser.isMobileVerified),
          instagramLink: organiser.instagramLink || organiser.instagram_link || null,
        },
        events: eventsWithDetails,
        pagination,
        summary: {
          totalEvents: totalCount,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all communities list
 * @route   GET /api/users/community?page=1
 * @access  Public
 * 
 * Returns list of all organisers with their community names:
 * - userId
 * - profilePic
 * - fullName
 * - communityName
 * - totalEvents (total events created by organiser)
 * - totalAttendees (total attendees across all events)
 * - sports (array of unique sports from all events)
 */
const getAllCommunities = async (req, res, next) => {
  try {
    const requestedPerPage = Math.min(parseInt(req.query.perPage) || 20, 200); // cap at 200 for safety
    const { page, perPage, skip } = getPaginationParams(req.query.page, requestedPerPage);

    const db = getDB();
    const usersCollection = db.collection('users');
    const eventsCollection = db.collection('events');
    const eventJoinsCollection = db.collection('eventJoins');

    const communityQuery = {
      userType: 'organiser',
      communityName: { $exists: true, $ne: null, $ne: '' },
    };

    // Get total count and paginated organisers in parallel — DB does the slicing
    const [totalCount, organisers] = await Promise.all([
      usersCollection.countDocuments(communityQuery),
      usersCollection
        .find(communityQuery)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(perPage)
        .toArray(),
    ]);

    // Get all event IDs for only these paginated organisers
    const organiserIds = organisers.map((o) => o._id);
    const allEvents = await eventsCollection
      .find({ creatorId: { $in: organiserIds } })
      .toArray();

    // Group events by creator
    const eventsByCreator = new Map();
    const eventIdsByCreator = new Map();
    allEvents.forEach((event) => {
      const creatorId = event.creatorId.toString();
      if (!eventsByCreator.has(creatorId)) {
        eventsByCreator.set(creatorId, []);
        eventIdsByCreator.set(creatorId, []);
      }
      eventsByCreator.get(creatorId).push(event);
      eventIdsByCreator.get(creatorId).push(event._id);
    });

    // Get total attendees for all events in bulk
    const allEventIds = allEvents.map((e) => e._id);
    const attendeesByEventMap = new Map();

    if (allEventIds.length > 0) {
      const attendeesByEvent = await eventJoinsCollection
        .aggregate([
          { $match: { eventId: { $in: allEventIds } } },
          { $group: { _id: '$eventId', count: { $sum: 1 } } },
        ])
        .toArray();

      attendeesByEvent.forEach((ae) => {
        attendeesByEventMap.set(ae._id.toString(), ae.count);
      });
    }

    // Format paginated organisers with required fields and metrics
    const communitiesList = organisers.map((organiser) => {
      const organiserIdStr = organiser._id.toString();
      const events = eventsByCreator.get(organiserIdStr) || [];
      const eventIds = eventIdsByCreator.get(organiserIdStr) || [];

      const totalEvents = events.length;

      let totalAttendees = 0;
      eventIds.forEach((eventId) => {
        totalAttendees += attendeesByEventMap.get(eventId.toString()) || 0;
      });

      // Extract all sports from events (eventSports field)
      const sportsSet = new Set();
      events.forEach((event) => {
        if (event.eventSports && Array.isArray(event.eventSports)) {
          event.eventSports.forEach((sport) => {
            if (sport && typeof sport === 'string' && sport.trim()) {
              sportsSet.add(sport.trim());
            }
          });
        }
        if (event.gameCategory && typeof event.gameCategory === 'string' && event.gameCategory.trim()) {
          sportsSet.add(event.gameCategory.trim());
        }
      });

      const sports = Array.from(sportsSet).sort();

      return {
        userId: organiser.userId,
        communityId: buildCommunityId(organiser),
        profilePic: organiser.profilePic || null,
        fullName: organiser.fullName || null,
        communityName: organiser.communityName || null,
        totalEvents: totalEvents,
        totalAttendees: totalAttendees,
        sports: sports,
      };
    });

    const pagination = createPaginationResponse(totalCount, page, perPage);

    return res.status(200).json({
      success: true,
      message: 'All communities retrieved successfully',
      data: {
        communities: communitiesList,
        pagination,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCommunityDetails,
  getAllCommunities,
};
