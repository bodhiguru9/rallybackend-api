const Notification = require('../../models/Notification');
const User = require('../../models/User');
const Event = require('../../models/Event');
const Request = require('../../models/Request');
const { getPaginationParams, createPaginationResponse } = require('../../utils/pagination');
const { getDB } = require('../../config/database');
const { ObjectId } = require('mongodb');

/**
 * @desc    Get organizer notifications (count and list)
 * @route   GET /api/notifications/organiser
 * @access  Private (Organiser only)
 * 
 * Returns:
 * - Unread notification count
 * - List of notifications (event join requests, event leaves)
 */
const getOrganiserNotifications = async (req, res, next) => {
  try {
    const userId = req.user.id; // MongoDB ObjectId from auth middleware
    const userType = req.user.userType;

    // Verify user is an organizer
    if (userType !== 'organiser') {
      return res.status(403).json({
        success: false,
        error: 'This endpoint is only available for organisers',
      });
    }

    const { page, perPage, skip } = getPaginationParams(req.query.page, 20);

    // Get counts for organiserJoinRequests and eventWaitlistRequests (matching /api/request/pending)
    const db = getDB();
    const organiserMongoId = new ObjectId(userId);
    const organiserJoinCount = await Request.getRequestCount(organiserMongoId);
    
    const eventsCollection = db.collection('events');
    const waitlistCollection = db.collection('waitlist');
    const eventJoinRequestsCollection = db.collection('eventJoinRequests');
    const usersCollection = db.collection('users');
    const organiserEvents = await eventsCollection
      .find({ creatorId: organiserMongoId })
      .toArray();
    const eventIds = organiserEvents.map(e => e._id);

    const eventPendingCount = eventIds.length > 0
      ? await eventJoinRequestsCollection.countDocuments({
          eventId: { $in: eventIds },
          status: 'pending',
        })
      : 0;
    const eventWaitlistCount = eventIds.length > 0
      ? await waitlistCollection.countDocuments({
          eventId: { $in: eventIds },
          status: 'pending',
        })
      : 0;

    // Unread count = total pending requests (organiser join + event waitlist)
    // This increases when any new request comes in
    const unreadCount = organiserJoinCount + eventPendingCount + eventWaitlistCount;

    // Get all pending requests (organiser join requests + event waitlist requests) - same as /api/request/pending
    // 1. Get organiser join requests
    const organiserJoinRequests = await Request.getPendingRequests(organiserMongoId, 1000, 0);
    
    // 2. Get event waitlist requests
    const eventWaitlistRequests = eventIds.length > 0
      ? await waitlistCollection
          .find({
            eventId: { $in: eventIds },
            status: 'pending',
          })
          .sort({ createdAt: -1 })
          .toArray()
      : [];

    // 3. Get event pending requests (private events not full at request time)
    const eventPendingRequests = eventIds.length > 0
      ? await eventJoinRequestsCollection
          .find({
            eventId: { $in: eventIds },
            status: 'pending',
          })
          .sort({ createdAt: -1 })
          .toArray()
      : [];

    // Get user details for event waitlist requests
    const eventRequestUserIds = [...eventPendingRequests, ...eventWaitlistRequests].map(r => r.userId);
    const eventRequestUsers = eventRequestUserIds.length > 0
      ? await usersCollection.find({ 
          _id: { $in: eventRequestUserIds.map(id => id instanceof ObjectId ? id : new ObjectId(id)) } 
        }).toArray()
      : [];

    // Combine both types of requests and format them like notifications
    const allRequests = [
      ...organiserJoinRequests.map(r => ({ ...r, requestType: 'organiser-join' })),
      ...eventPendingRequests.map(r => ({ ...r, requestType: 'event-pending' })),
      ...eventWaitlistRequests.map(r => ({ ...r, requestType: 'event-waitlist' }))
    ];

    // Sort by creation date (newest first)
    allRequests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const totalCount = allRequests.length;

    // Format requests to match notification structure (same as /api/request/pending)
    const formattedRequests = await Promise.all(
      allRequests.map(async (request) => {
        if (request.requestType === 'organiser-join') {
          // This is an organiser join request - already has user from Request.getPendingRequests
          return {
            type: 'organiser-join-request',
            requestId: request.requestId,
            user: request.user,
            status: request.status,
            createdAt: request.createdAt,
            requestType: 'organiser-join',
          };
        } else {
          // This is an event request (pending or waitlist)
          const event = organiserEvents.find(e => e._id.toString() === request.eventId.toString());
          const user = eventRequestUsers.find(u => {
            const requestUserId = request.userId instanceof ObjectId ? request.userId : new ObjectId(request.userId);
            const userMongoId = u._id instanceof ObjectId ? u._id : new ObjectId(u._id);
            return requestUserId.toString() === userMongoId.toString();
          });

          return {
            type: 'event-join-request',
            requestSubtype: request.requestType === 'event-pending' ? 'pending-request' : 'waitlist',
            joinRequestId: request.requestType === 'event-pending' ? request.joinRequestId : (request.waitlistId || null),
            waitlistId: request.requestType === 'event-waitlist' ? request._id.toString() : null,
            requestId: request.requestType === 'event-waitlist' ? (request.requestId || null) : (request.joinRequestId || null),
            user: user ? {
              userId: user.userId,
              userType: user.userType,
              email: request.email || user.email,
              mobileNumber: user.mobileNumber || null,
              profilePic: request.profilePic || user.profilePic,
              fullName: request.fullName || user.fullName,
              ...(user.userType === 'player' && {
                dob: user.dob || null,
                gender: user.gender || null,
                sport1: user.sport1 || null,
                sport2: user.sport2 || null,
                sports: user.sports || [user.sport1, user.sport2].filter(Boolean),
              }),
            } : {
              userId: null,
              email: request.email,
              profilePic: request.profilePic,
              fullName: request.fullName,
            },
            event: event ? {
              eventId: event.eventId,
              eventTitle: event.eventName || null,
              eventName: event.eventName || null,
              eventCategory: Array.isArray(event.eventSports) && event.eventSports.length > 0 ? event.eventSports[0] : null,
              eventType: event.eventType || null,
            } : null,
            status: request.status,
            createdAt: request.createdAt,
            requestType: request.requestType,
          };
        }
      })
    );

    // Apply pagination to formatted requests
    const paginatedRequests = formattedRequests.slice(skip, skip + perPage);
    const pagination = createPaginationResponse(totalCount, page, perPage);

    // Use formatted requests as notifications (they already match /api/request/pending structure)
    const enrichedNotifications = paginatedRequests;

    res.status(200).json({
      success: true,
      message: 'Organiser notifications retrieved successfully',
      data: {
        unreadCount: unreadCount,
        notifications: enrichedNotifications,
        // Add counts matching /api/request/pending structure
        organiserJoinRequests: organiserJoinCount,
        eventPendingRequests: eventPendingCount,
        eventWaitlistRequests: eventWaitlistCount,
        pagination: pagination,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Mark notification as read
 * @route   PUT /api/notifications/organiser/:notificationId/read
 * @access  Private (Organiser only)
 */
const markNotificationAsRead = async (req, res, next) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user.id;
    const userType = req.user.userType;

    if (userType !== 'organiser') {
      return res.status(403).json({
        success: false,
        error: 'This endpoint is only available for organisers',
      });
    }

    const marked = await Notification.markAsRead(notificationId, userId);

    if (!marked) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found or already read',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Notification marked as read',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Mark all notifications as read
 * @route   PUT /api/notifications/organiser/read-all
 * @access  Private (Organiser only)
 */
const markAllAsRead = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userType = req.user.userType;

    if (userType !== 'organiser') {
      return res.status(403).json({
        success: false,
        error: 'This endpoint is only available for organisers',
      });
    }

    const count = await Notification.markAllAsRead(userId);

    res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
      data: {
        markedCount: count,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getOrganiserNotifications,
  markNotificationAsRead,
  markAllAsRead,
};

