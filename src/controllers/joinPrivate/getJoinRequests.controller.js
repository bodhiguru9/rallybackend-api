const Event = require('../../models/Event');
const Waitlist = require('../../models/Waitlist');
const EventJoinRequest = require('../../models/EventJoinRequest');
const User = require('../../models/User');
const { findEventById, validateEventId } = require('../../utils/eventHelper');
const { getPaginationParams, createPaginationResponse } = require('../../utils/pagination');

/**
 * @desc    Get ONLY pending join requests for a private event (Organizer only)
 * @route   GET /api/private-events/:eventId/pending-requests?page=1
 * @access  Private (Creator only)
 *
 * Returns pending requests stored in eventJoinRequests (NOT waitlist).
 */
const getEventPendingRequests = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const organiserId = req.user.id;

    const validation = validateEventId(eventId);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: validation.error,
        eventId: eventId,
      });
    }

    const event = await findEventById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        error: `Event not found with ID: ${eventId}`,
        eventId: eventId,
      });
    }

    const isPrivate = event.IsPrivateEvent !== undefined ? event.IsPrivateEvent : (event.visibility === 'private');
    const approvalRequired = event.eventApprovalRequired === true || event.eventApprovalReq === true;
    if (!isPrivate && !approvalRequired) {
      return res.status(400).json({
        success: false,
        error: 'This endpoint is only for private or approval-required events',
      });
    }

    if (event.creatorId.toString() !== organiserId) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized. Only the event creator can view pending requests.',
      });
    }

    const { page, perPage, skip } = getPaginationParams(req.query.page, 20);

    const pendingRequestsRaw = await EventJoinRequest.findActiveByEvent(event._id, perPage, skip);
    const totalCount = await EventJoinRequest.countActiveByEvent(event._id);
    const pagination = createPaginationResponse(totalCount, page, perPage);

    // Enrich with real userId (sequential) where possible
    const userIds = pendingRequestsRaw.map((r) => r.userId).filter(Boolean);
    const { getDB } = require('../../config/database');
    const db = getDB();
    const usersCollection = db.collection('users');
    const users = userIds.length > 0 ? await usersCollection.find({ _id: { $in: userIds } }).toArray() : [];
    const userMap = new Map((users || []).map((u) => [u._id.toString(), u]));

    res.status(200).json({
      success: true,
      message: 'Pending requests retrieved successfully',
      data: {
        event: {
          eventId: event.eventId,
          eventName: event.eventName || event.gameTitle,
        },
        pendingRequests: pendingRequestsRaw.map((r) => {
          const u = userMap.get(r.userId?.toString?.() || '');
          return {
            joinRequestId: r.joinRequestId,
            requestType: 'pending-request',
            status: r.status,
            requestedAt: r.createdAt,
            paymentStatus: r.status === 'accepted' ? 'pending' : null,
            user: {
              userId: u?.userId ?? null,
              userType: u?.userType ?? null,
              email: r.email || u?.email || null,
              profilePic: r.profilePic || u?.profilePic || null,
              fullName: r.fullName || u?.fullName || null,
            },
          };
        }),
        pagination,
        totalPendingRequests: totalCount,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all join requests for a private event (Organizer only)
 * @route   GET /api/private-events/:eventId/join-requests?page=1
 * @access  Private (Creator only)
 * 
 * Returns all pending join requests for a private event.
 * Only the event creator can view these requests.
 */
const getEventJoinRequests = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const organiserId = req.user.id;

    // Validate and find event
    const validation = validateEventId(eventId);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: validation.error,
        eventId: eventId,
      });
    }

    // Verify event exists and user is creator
    const event = await findEventById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        error: `Event not found with ID: ${eventId}`,
        eventId: eventId,
      });
    }

    // Support both old and new field names for backward compatibility
    const isPrivate = event.IsPrivateEvent !== undefined ? event.IsPrivateEvent : (event.visibility === 'private');
    const approvalRequired = event.eventApprovalRequired === true || event.eventApprovalReq === true;
    if (!isPrivate && !approvalRequired) {
      return res.status(400).json({
        success: false,
        error: 'This endpoint is only for private or approval-required events',
      });
    }

    if (event.creatorId.toString() !== organiserId) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to view join requests. Only the event creator can view requests.',
      });
    }

    const { page, perPage, skip } = getPaginationParams(req.query.page, 20);

    // Pending requests (includes accepted-but-unpaid)
    const pendingRequestsRaw = await EventJoinRequest.findActiveByEvent(event._id, perPage, skip);
    const pendingCount = await EventJoinRequest.countActiveByEvent(event._id);

    // Waitlist requests (event was full at request time)
    const waitlistRequests = await Waitlist.getEventWaitlist(eventId, perPage, skip);
    const waitlistCount = await Waitlist.getWaitlistCount(eventId);

    const totalCount = pendingCount + waitlistCount;
    const pagination = createPaginationResponse(totalCount, page, perPage);

    // Get creator details
    const creator = await User.findById(event.creatorId);

    // Get joined participants count
    const EventJoin = require('../../models/EventJoin');
    const joinedCount = await EventJoin.getParticipantCount(event._id);

    // Calculate available spots
    const maxGuest = event.eventMaxGuest !== undefined ? event.eventMaxGuest : (event.gameSpots || 0);
    const availableSpots = Math.max(0, maxGuest - joinedCount);
    const spotsFull = joinedCount >= maxGuest;

    res.status(200).json({
      success: true,
      message: 'Join requests retrieved successfully',
      data: {
        event: {
          eventId: event.eventId,
          eventName: event.eventName || event.gameTitle,
          gameCreatorName: event.gameCreatorName,
          gameCreatorEmail: event.gameCreatorEmail || (creator ? creator.email : null),
          gameCreatorProfilePic: event.gameCreatorProfilePic || (creator ? creator.profilePic : null),
        },
        joinRequests: {
          pending: pendingRequestsRaw.map((r) => ({
            joinRequestId: r.joinRequestId,
            requestType: 'pending-request',
            requestId: r.joinRequestId,
            paymentStatus: r.status === 'accepted' ? 'pending' : null,
            user: {
              userId: null, // client can use user fields below; we keep structure similar to waitlist
              email: r.email || null,
              profilePic: r.profilePic || null,
              fullName: r.fullName || null,
            },
            createdAt: r.createdAt,
            status: r.status,
          })),
          waitlist: waitlistRequests,
        },
        spotsInfo: {
          totalSpots: maxGuest,
          spotsBooked: joinedCount,
          spotsLeft: availableSpots,
          spotsFull: spotsFull,
        },
        counts: {
          totalSpots: maxGuest,
          joinedSpots: joinedCount,
          availableSpots: availableSpots,
          pendingRequests: pendingCount,
          waitlist: waitlistCount,
          totalRequests: totalCount,
        },
        pagination,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all join requests across all events (Organizer only)
 * @route   GET /api/private-events/join-requests?page=1
 * @access  Private (Organizer only)
 * 
 * Returns all pending join requests for all private events created by the organizer.
 */
const getAllJoinRequests = async (req, res, next) => {
  try {
    const organiserId = req.user.id;
    const { page, perPage, skip } = getPaginationParams(req.query.page, 20);

    // Get all events created by this organizer
    const events = await Event.findByCreator(organiserId, 1000, 0); // Get all events

    // Get all join requests for these events:
    // - Pending requests: eventJoinRequests collection
    // - Waitlist requests: waitlist collection
    const { getDB } = require('../../config/database');
    const { ObjectId } = require('mongodb');
    const db = getDB();
    const waitlistCollection = db.collection('waitlist');
    const pendingCollection = db.collection('eventJoinRequests');

    const eventIds = events.map(e => e._id);
    
    const pendingItems = await pendingCollection
      .find({
        eventId: { $in: eventIds },
        status: 'pending',
      })
      .sort({ createdAt: -1 })
      .toArray();

    const waitlistItems = await waitlistCollection
      .find({
        eventId: { $in: eventIds },
        status: 'pending',
      })
      .sort({ createdAt: -1 })
      .toArray();

    const allItems = [
      ...pendingItems.map((i) => ({ ...i, requestType: 'pending-request' })),
      ...waitlistItems.map((i) => ({ ...i, requestType: 'waitlist' })),
    ];
    allItems.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const totalCount = allItems.length;
    const paginatedItems = allItems.slice(skip, skip + perPage);
    const pagination = createPaginationResponse(totalCount, page, perPage);

    // Get event details and user details for each join request
    const joinRequestsWithDetails = await Promise.all(
      paginatedItems.map(async (item) => {
        const event = events.find(e => e._id.toString() === item.eventId.toString());
        const user = await User.findById(item.userId);

        const isPending = item.requestType === 'pending-request';
        return {
          requestType: item.requestType,
          requestId: isPending ? item.joinRequestId : item.requestId,
          joinRequestId: isPending ? item.joinRequestId : item.waitlistId, // Sequential ID for reference
          event: event ? {
            eventId: event.eventId,
            eventName: event.eventName || event.gameTitle,
            eventType: event.eventType || event.gameType,
            eventDateTime: event.eventDateTime || event.gameStartDate,
          } : null,
          user: user ? {
            userId: user.userId,
            fullName: user.fullName,
            email: user.email,
            profilePic: user.profilePic,
            userType: user.userType,
          } : {
            fullName: item.fullName,
            email: item.email,
            profilePic: item.profilePic,
          },
          requestedAt: item.createdAt,
          status: item.status,
        };
      })
    );

    res.status(200).json({
      success: true,
      message: 'All join requests retrieved successfully',
      data: {
        joinRequests: joinRequestsWithDetails,
        totalPendingRequests: totalCount,
        pagination,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getEventPendingRequests,
  getEventJoinRequests,
  getAllJoinRequests,
};
