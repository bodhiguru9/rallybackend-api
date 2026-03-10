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

    // Get all events created by this organiser
    const allEvents = await Event.findByCreator(organiser._id, 10000, 0);
    const totalEventsHosted = allEvents.length;

    // Calculate total attendees across all events
    const allEventIds = allEvents.map((e) => e._id);
    let totalAttendees = 0;
    if (allEventIds.length > 0) {
      const eventJoinsCollection = db.collection('eventJoins');
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

    // Always show all events (removed private/public visibility logic)
    const events = allEvents;

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

    // Format events with full details including spots information
    const eventsWithDetails = await Promise.all(
      events.map(async (event) => {
        // Support both old and new field names for backward compatibility
        const isPrivate = event.IsPrivateEvent !== undefined ? event.IsPrivateEvent : (event.visibility === 'private');
        const maxGuest = event.eventMaxGuest !== undefined ? event.eventMaxGuest : (event.gameSpots || 0);

        // Get actual booked participants count
        let participantsCount = 0;
        let participants = [];
        if (!isPrivate) {
          participantsCount = await EventJoin.getParticipantCount(event._id);
          participants = await EventJoin.getEventParticipants(event._id, 10, 0); // Get first 10 participants
        }

        // Get waitlist count for private events
        let waitlistCount = 0;
        if (isPrivate) {
          waitlistCount = await Waitlist.getWaitlistCount(event._id);
        }

        // Calculate spots information
        const spotsFull = participantsCount >= maxGuest;
        const availableSpots = Math.max(0, maxGuest - participantsCount);
        const spotsBooked = participantsCount;
        const spotsLeft = availableSpots;

        // Get user's join status if authenticated
        let userJoinStatus = null;
        if (req.user) {
          if (!isPrivate) {
            const hasJoined = await EventJoin.hasJoined(req.user.id, event._id);
            userJoinStatus = {
              hasJoined,
              canJoin: !hasJoined && !spotsFull,
              action: hasJoined ? 'joined' : spotsFull ? 'join-waitlist' : 'join',
            };
          } else {
            const inWaitlist = await Waitlist.isInWaitlist(req.user.id, event._id);
            const hasJoined = await EventJoin.hasJoined(req.user.id, event._id);
            userJoinStatus = {
              hasJoined,
              inWaitlist,
              canRequest: !hasJoined && !inWaitlist,
              action: hasJoined ? 'joined' : inWaitlist ? 'requested' : 'request-join',
            };
          }
        } else {
          userJoinStatus = {
            action: !isPrivate ? (spotsFull ? 'join-waitlist' : 'join') : 'request-join',
            requiresAuth: true,
          };
        }

        // Return only limited event fields as requested
        return {
          eventId: event.eventId || null,
          eventName: event.eventName || null,
          eventSports: event.eventSports || [],
          eventType: event.eventType || null,
          eventDateTime: event.eventDateTime || event.gameStartDate || null,
          eventLocation: event.eventLocation || null,
          eventImages: event.eventImages || event.gameImages || [],
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
      })
    );

    // Apply pagination to events
    const totalCount = eventsWithDetails.length;
    const paginatedEvents = eventsWithDetails.slice(skip, skip + perPage);
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
          instagramLink: organiser.instagramLink || null,
        },
        events: paginatedEvents,
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
    const { page, perPage, skip } = getPaginationParams(req.query.page, 20);

    const db = getDB();
    const usersCollection = db.collection('users');
    const eventsCollection = db.collection('events');
    const eventJoinsCollection = db.collection('eventJoins');

    // Get all organisers with communityName
    const organisers = await usersCollection
      .find({
        userType: 'organiser',
        communityName: { $exists: true, $ne: null, $ne: '' },
      })
      .sort({ createdAt: -1 }) // Newest first
      .toArray();

    // Get all event IDs for these organisers
    const organiserIds = organisers.map((o) => o._id);
    const allEvents = await eventsCollection
      .find({ creatorId: { $in: organiserIds } })
      .toArray();

    // Group events by creator/organiser
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

    // Format organisers with required fields and calculate metrics
    const communitiesList = organisers.map((organiser) => {
      const organiserIdStr = organiser._id.toString();
      const events = eventsByCreator.get(organiserIdStr) || [];
      const eventIds = eventIdsByCreator.get(organiserIdStr) || [];

      // Calculate total events
      const totalEvents = events.length;

      // Calculate total attendees across all events
      let totalAttendees = 0;
      eventIds.forEach((eventId) => {
        totalAttendees += attendeesByEventMap.get(eventId.toString()) || 0;
      });

      // Extract all sports from events (eventSports field)
      const sportsSet = new Set();
      events.forEach((event) => {
        // Support both eventSports array and gameCategory string
        if (event.eventSports && Array.isArray(event.eventSports)) {
          event.eventSports.forEach((sport) => {
            if (sport && typeof sport === 'string' && sport.trim()) {
              sportsSet.add(sport.trim());
            }
          });
        }
        // Also check gameCategory for backward compatibility
        if (event.gameCategory && typeof event.gameCategory === 'string' && event.gameCategory.trim()) {
          sportsSet.add(event.gameCategory.trim());
        }
      });

      // Convert Set to sorted array
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

    // Apply pagination
    const totalCount = communitiesList.length;
    const paginatedCommunities = communitiesList.slice(skip, skip + perPage);
    const pagination = createPaginationResponse(totalCount, page, perPage);

    return res.status(200).json({
      success: true,
      message: 'All communities retrieved successfully',
      data: {
        communities: paginatedCommunities,
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
