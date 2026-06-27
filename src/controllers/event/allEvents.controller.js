const Event = require('../../models/Event');
const User = require('../../models/User');
const EventJoin = require('../../models/EventJoin');
const Waitlist = require('../../models/Waitlist');
const Follow = require('../../models/Follow');
const { ObjectId } = require('mongodb');
const { validateEventFilters } = require('../../validators/event.validator');
const { getPaginationParams, createPaginationResponse } = require('../../utils/pagination');
const { formatEventResponse } = require('../../utils/eventFields');

/**
 * @desc    Get all events with complete data (public and private)
 * @route   GET /api/events/all
 * @access  Public (with optional authentication for user-specific data)
 */
const getAllEvents = async (req, res, next) => {
  try {
    const filters = {
      eventType: req.query.eventType,
      eventSports: req.query.eventSports ? (Array.isArray(req.query.eventSports) ? req.query.eventSports : req.query.eventSports.split(',').map(s => s.trim())) : undefined,
      eventCreatorName: req.query.eventCreatorName,
      IsPrivateEvent: req.query.IsPrivateEvent || req.query.isPrivateEvent,
      eventStatus: req.query.eventStatus || req.query.status,
      startDate: req.query.startDate, // Filter events from this date onwards (ISO format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)
      endDate: req.query.endDate, // Filter events up to this date (ISO format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)
      sortBy: req.query.sortBy, // 'date' to sort by eventDateTime, default sorts by createdAt
    };

    // Validate filters
    const filterValidation = validateEventFilters(filters);
    if (!filterValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: filterValidation.errors,
      });
    }

    // Pagination: support dynamic perPage (max 100)
    const { page, perPage, skip } = getPaginationParams(req.query.page, req.query.perPage || 20);

    // Get all events that user has joined (if authenticated)
    // This will be used to exclude joined events from the home feed
    let joinedEventIds = [];
    if (req.user && req.user.id) {
      const { getDB } = require('../../config/database');
      const db = getDB();
      const joinsCollection = db.collection('eventJoins');
      
      const joinedEvents = await joinsCollection
        .find({
          userId: typeof req.user.id === 'string' ? new ObjectId(req.user.id) : req.user.id,
        })
        .toArray();
      
      // Get both ObjectId and string formats for filtering
      joinedEventIds = joinedEvents.map((join) => join.eventId);
    }

// Fetch enough events to cover the page after filtering out joined ones.
// Cap the over-fetch at perPage + joinedEventIds.length (with a minimum of perPage).
const fetchLimit = perPage + Math.min(joinedEventIds.length, 100);
let events = await Event.findWithFilters(
  filters,
  fetchLimit,
  skip,
  true // excludeDrafts: true
);
 
    // Filter out events that user has already joined (works for both public and private events)
    if (joinedEventIds.length > 0) {
      const joinedEventIdsStr = joinedEventIds.map(id => id.toString());
      events = events.filter((event) => !joinedEventIdsStr.includes(event._id.toString()));
    }
    
    // Apply pagination after filtering
    events = events.slice(0, perPage);

    // Pre-fetch participant counts for all events in a SINGLE bulk aggregation
    // instead of N individual aggregation pipelines inside the map below.
    const { getDB: _getDB2 } = require('../../config/database');
    const _joinsCollection = _getDB2().collection('eventJoins');
    const _eventIds = events.map((e) => e._id);
    const _bulkCountAgg = _eventIds.length > 0
      ? await _joinsCollection.aggregate([
          { $match: { eventId: { $in: _eventIds } } },
          { $group: { _id: '$eventId', total: { $sum: { $ifNull: ['$guestsCount', 1] } } } },
        ]).toArray()
      : [];
    const _participantCountMap = new Map(
      _bulkCountAgg.map((r) => [r._id.toString(), r.total])
    );

    // Batch-fetch all event creators in ONE query (was N User.findById calls — N+1)
    const { getUsersByIds } = require('../../utils/batchLoad');
    const _creatorMap = await getUsersByIds(events.map((e) => e.creatorId));

    // Batch-fetch participants preview (top 10) for all events in ONE aggregation
    const { batchEventParticipants, batchUserEventStatus } = require('../../utils/batchEventData');
    const _participantsPreviewMap = await batchEventParticipants(_eventIds, 10);

    // Batch user join/waitlist/request status for the authenticated user
    let userStatusBatch = { joinedSet: new Set(), waitlistedSet: new Set(), requestedSet: new Set() };
    if (req.user && req.user.id) {
      userStatusBatch = await batchUserEventStatus(req.user.id, _eventIds);
    }

    // Get creator details and additional info for each event — NO per-event DB calls
    const eventsWithFullData = events.map((event) => {
        // Get creator/organiser details from the pre-fetched batch (no per-event query)
        const creator = _creatorMap.get(String(event.creatorId));
        let creatorData = null;
        
        if (creator && creator.userType === 'organiser') {
          creatorData = {
            userId: creator.userId,
            email: creator.email,
            profilePic: creator.profilePic,
            fullName: creator.fullName,
            communityName: creator.communityName,
            eventsCreated: creator.eventsCreated || 0,
            totalAttendees: creator.totalAttendees || 0,
          };
        }

        // Support both old and new field names for backward compatibility
        const isPrivate = event.IsPrivateEvent !== undefined ? event.IsPrivateEvent : (event.visibility === 'private');
        const approvalRequired = event.eventApprovalRequired === true || event.eventApprovalReq === true;
        const maxGuest = event.eventMaxGuest !== undefined ? event.eventMaxGuest : (event.gameSpots || 0);

        // Get actual booked participants count — use the pre-fetched bulk Map
        const eventIdStr = event._id.toString();
        let participantsCount = 0;
        let participants = [];
        if (!isPrivate || (req.user && req.user.id === event.creatorId.toString())) {
          participantsCount = _participantCountMap.get(eventIdStr) || 0;
          participants = _participantsPreviewMap.get(eventIdStr) || [];
        }

        // Get waitlist count (only for private events and if user is creator)
        let waitlistCount = 0;
        // Waitlist details are not batch-fetched here since only the creator's private events need them
        // and that's typically 0-2 events per page

        // Calculate spots information
        const spotsFull = participantsCount >= maxGuest;
        const availableSpots = Math.max(0, maxGuest - participantsCount);
        const spotsBooked = participantsCount;
        const spotsLeft = availableSpots;

        // Get user's join status from batch (zero DB calls)
        let userJoinStatus = null;
        if (req.user) {
          const hasJoined = userStatusBatch.joinedSet.has(eventIdStr);
          if (!isPrivate && !approvalRequired) {
            userJoinStatus = {
              hasJoined,
              canJoin: !hasJoined && !spotsFull,
              action: hasJoined ? 'joined' : spotsFull ? 'join-waitlist' : 'join',
            };
          } else {
            // Private or approval-required event
            const inWaitlist = userStatusBatch.waitlistedSet.has(eventIdStr);
            const hasPendingRequest = userStatusBatch.requestedSet.has(eventIdStr);
            const inRequestList = inWaitlist || hasPendingRequest;
            userJoinStatus = {
              hasJoined,
              inWaitlist: inWaitlist,
              inRequestList,
              canRequest: !hasJoined && !inRequestList,
              action: hasJoined ? 'joined' : inRequestList ? 'requested' : 'request-join',
            };
          }
        } else {
          // Not authenticated - show appropriate action based on visibility
          userJoinStatus = {
            action: !isPrivate && !approvalRequired ? (spotsFull ? 'join-waitlist' : 'join') : 'request-join',
            requiresAuth: true,
          };
        }

        return {
          ...formatEventResponse(event),
          eventApprovalReq: event.eventApprovalReq !== undefined ? event.eventApprovalReq : false,
          eventApprovalRequired: event.eventApprovalRequired !== undefined ? event.eventApprovalRequired : false,
          approvalRequired: approvalRequired,
          approvalStatus: approvalRequired ? 'required' : 'not_required',
          creator: creatorData,
          participants: participants,
          participantsCount: participantsCount,
          waitlist: [],
          waitlistCount: waitlistCount,
          userJoinStatus: userJoinStatus,
          userStatus: userJoinStatus,
          spotsInfo: {
            totalSpots: maxGuest,
            spotsBooked: spotsBooked,
            spotsLeft: spotsLeft,
            spotsFull: spotsFull,
          },
          availableSpots: availableSpots,
          isFull: spotsFull, // Keep for backward compatibility
        };
      });

    // Get total count for pagination (more efficient way)
    const db = require('../../config/database').getDB();
    const eventsCollection = db.collection('events');
    
    // Build query for count (same as findWithFilters) - use centralized buildEventQuery
    const { buildEventQuery } = require('../../utils/eventFields');
    let countQuery = buildEventQuery({ ...filters, excludeDrafts: false });
    
    // Exclude joined events from count if user is authenticated
    if (joinedEventIds.length > 0) {
      countQuery = {
        ...countQuery,
        _id: { 
          $nin: joinedEventIds.map(id => {
            try {
              return new ObjectId(id);
            } catch {
              return id;
            }
          })
        }
      };
    }
    
    const totalCount = await eventsCollection.countDocuments(countQuery);
    const pagination = createPaginationResponse(totalCount, page, perPage);

    res.status(200).json({
      success: true,
      message: 'All events retrieved successfully',
      data: {
        events: eventsWithFullData,
        pagination,
        ...(Object.keys(filters).some(key => filters[key]) && { filters }),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all events by organiser
 * @route   GET /api/events/all/organiser/:organiserId
 * @access  Public
 */
const getAllEventsByOrganiser = async (req, res, next) => {
  try {
    const { organiserId } = req.params;
    
    // Pagination: support both 'page' and 'skip' parameters
    let limit = parseInt(req.query.limit) || 10; // Default 10 events per page
    let skip = parseInt(req.query.skip) || 0;
    
    // If 'page' is provided, calculate skip
    if (req.query.page) {
      const page = parseInt(req.query.page) || 1;
      skip = (page - 1) * limit;
    }
    
    // Ensure limit is reasonable (max 100 per page)
    if (limit > 100) {
      limit = 100;
    }
    if (limit < 1) {
      limit = 10;
    }

    // Get organiser details
    const organiser = await User.findById(organiserId);
    if (!organiser || organiser.userType !== 'organiser') {
      return res.status(404).json({
        success: false,
        error: 'Organiser not found',
      });
    }

    // Get all events by this organiser
    const events = await Event.findByCreator(organiserId, limit, skip);

    const eventsWithData = await Promise.all(
      events.map(async (event) => {
        // Support both old and new field names for backward compatibility
        const isPrivate = event.IsPrivateEvent !== undefined ? event.IsPrivateEvent : (event.visibility === 'private');
        const approvalRequired = event.eventApprovalRequired === true || event.eventApprovalReq === true;
        const maxGuest = event.eventMaxGuest !== undefined ? event.eventMaxGuest : (event.gameSpots || 0);

        // Get actual booked participants count
        let participantsCount = 0;
        if (!isPrivate || req.user?.id === event.creatorId?.toString()) {
          participantsCount = await EventJoin.getParticipantCount(event._id);
        }

        // Get waitlist count for private or approval-required events
        let waitlistCount = 0;
        if (isPrivate || approvalRequired) {
          waitlistCount = await Waitlist.getWaitlistCount(event._id);
        }

        // Calculate spots information
        const spotsFull = participantsCount >= maxGuest;
        const availableSpots = Math.max(0, maxGuest - participantsCount);
        const spotsBooked = participantsCount;
        const spotsLeft = availableSpots;

        // Get user's join status if authenticated (also as userStatus)
        let userJoinStatus = null;
        if (req.user) {
          if (!isPrivate && !approvalRequired) {
            const hasJoined = await EventJoin.hasJoined(req.user.id, event._id);
            userJoinStatus = {
              hasJoined,
              canJoin: !hasJoined && !spotsFull,
              action: hasJoined ? 'joined' : spotsFull ? 'join-waitlist' : 'join',
            };
          } else {
            const EventJoinRequest = require('../../models/EventJoinRequest');
            const inWaitlist = await Waitlist.isInWaitlist(req.user.id, event._id);
            const hasPendingRequest = await EventJoinRequest.findPendingByUserAndEvent(req.user.id, event._id);
            const inRequestList = inWaitlist || !!hasPendingRequest;
            const hasJoined = await EventJoin.hasJoined(req.user.id, event._id);
            userJoinStatus = {
              hasJoined,
              inWaitlist,
              inRequestList,
              canRequest: !hasJoined && !inRequestList,
              action: hasJoined ? 'joined' : inRequestList ? 'requested' : 'request-join',
            };
          }
        } else {
          userJoinStatus = {
            action: !isPrivate && !approvalRequired ? (spotsFull ? 'join-waitlist' : 'join') : 'request-join',
            requiresAuth: true,
          };
        }

        return {
          ...formatEventResponse(event),
          eventApprovalReq: event.eventApprovalReq !== undefined ? event.eventApprovalReq : false,
          eventApprovalRequired: event.eventApprovalRequired !== undefined ? event.eventApprovalRequired : false,
          approvalRequired,
          approvalStatus: approvalRequired ? 'required' : 'not_required',
          participantsCount: participantsCount,
          waitlistCount: waitlistCount,
          userJoinStatus: userJoinStatus,
          userStatus: userJoinStatus,
          spotsInfo: {
            totalSpots: maxGuest,
            spotsBooked: spotsBooked,
            spotsLeft: spotsLeft,
            spotsFull: spotsFull,
          },
          availableSpots: availableSpots,
          isFull: spotsFull, // Keep for backward compatibility
        };
      })
    );

    const totalCount = await Event.getEventCount(organiserId);
    const totalPages = Math.ceil(totalCount / limit);
    const currentPage = Math.floor(skip / limit) + 1;

    res.status(200).json({
      success: true,
      message: 'Organiser events retrieved successfully',
      data: {
        organiser: {
                    userId: organiser.userId,
          fullName: organiser.fullName,
          profilePic: organiser.profilePic,
          communityName: organiser.communityName,
          yourCity: organiser.yourCity,
          eventsCreated: organiser.eventsCreated || 0,
          totalAttendees: organiser.totalAttendees || 0,
        },
        events: eventsWithData,
        pagination: {
          total: totalCount,
          totalPages: totalPages,
          currentPage: currentPage,
          limit: limit,
          skip: skip,
          hasMore: skip + limit < totalCount,
          hasPrevious: skip > 0,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllEvents,
  getAllEventsByOrganiser,
};

