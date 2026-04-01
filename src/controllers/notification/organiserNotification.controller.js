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
      .find({ creatorId: { $in: [organiserMongoId, userId] } })
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

    // Get general notifications (new_booking, event_booking_cancelled, etc.)
    const genericNotifications = await Notification.getUserNotifications(organiserMongoId, 100, 0);
    const unreadGenericCount = await Notification.getUnreadCount(organiserMongoId);

    // 2. Get organiser join requests
    const organiserJoinRequests = await Request.getPendingRequests(organiserMongoId, 1000, 0);
    
    // 3. Get event waitlist requests
    const eventWaitlistRequests = eventIds.length > 0
      ? await waitlistCollection
          .find({
            eventId: { $in: eventIds },
            status: 'pending',
          })
          .sort({ createdAt: -1 })
          .toArray()
      : [];

    // 4. Get event pending requests (private events not full at request time)
    const eventPendingRequests = eventIds.length > 0
      ? await eventJoinRequestsCollection
          .find({
            eventId: { $in: eventIds },
            status: 'pending',
          })
          .sort({ createdAt: -1 })
          .toArray()
      : [];

    // Get user details for event requests
    const eventRequestUserIds = [...eventPendingRequests, ...eventWaitlistRequests].map(r => r.userId);
    const eventRequestUsers = eventRequestUserIds.length > 0
      ? await usersCollection.find({ 
          _id: { $in: eventRequestUserIds.map(id => id instanceof ObjectId ? id : new ObjectId(id)) } 
        }).toArray()
      : [];

    // Helper to find and remove a notification that matches a request
    const findAndLinkNotification = (request, type) => {
      const idx = genericNotifications.findIndex(n => {
        if (n.type !== type) return false;
        if (type === 'organiser_join_request') {
          return n.data?.requestId === request.requestId;
        }
        if (type === 'event_join_request') {
          return n.data?.joinRequestId === (request.joinRequestId || request.requestId) || 
                 n.data?.waitlistId === (request.waitlistId || request._id?.toString());
        }
        return false;
      });

      if (idx !== -1) {
        const found = genericNotifications[idx];
        genericNotifications.splice(idx, 1); // Remove from generic list to avoid duplicate
        return found;
      }
      return null;
    };

    // Combine all types and format them
    const formattedRequests = await Promise.all(
      [
        ...organiserJoinRequests.map(r => ({ ...r, requestType: 'organiser-join' })),
        ...eventPendingRequests.map(r => ({ ...r, requestType: 'event-pending' })),
        ...eventWaitlistRequests.map(r => ({ ...r, requestType: 'event-waitlist' }))
      ].map(async (request) => {
        if (request.requestType === 'organiser-join') {
          const linkedNotification = findAndLinkNotification(request, 'organiser_join_request');
          return {
            notificationId: linkedNotification ? linkedNotification._id.toString() : request.requestId,
            type: 'organiser-join-request',
            requestId: request.requestId,
            user: request.user,
            status: request.status,
            createdAt: request.createdAt,
            requestType: 'organiser-join',
            isRead: linkedNotification ? linkedNotification.isRead : request.status !== 'pending'
          };
        } else {
          const linkedNotification = findAndLinkNotification(request, 'event_join_request');
          const event = organiserEvents.find(e => e._id.toString() === request.eventId.toString());
          const user = eventRequestUsers.find(u => {
            const requestUserId = request.userId instanceof ObjectId ? request.userId : new ObjectId(request.userId);
            const userMongoId = u._id instanceof ObjectId ? u._id : new ObjectId(u._id);
            return requestUserId.toString() === userMongoId.toString();
          });

          return {
            notificationId: linkedNotification ? linkedNotification._id.toString() : (request.requestType === 'event-pending' ? request.joinRequestId : (request._id?.toString() || Math.random().toString())),
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
            } : null,
            event: event ? {
              eventId: event.eventId,
              eventTitle: event.eventName || null,
              eventName: event.eventName || null,
              eventCategory: Array.isArray(event.eventSports) && event.eventSports.length > 0 ? event.eventSports[0] : null,
              eventType: event.eventType || null,
            } : null,
            status: request.status,
            isRead: linkedNotification ? linkedNotification.isRead : request.status !== 'pending',
            createdAt: request.createdAt,
            requestType: request.requestType,
          };
        }
      })
    );

    // Get user details for generic notifications (new_booking, booking_cancelled, etc.)
    const genericUserIds = genericNotifications
      .map(n => n.user) // Notification model stores recipientId as user sometimes, but we want the "actor"
      // Actually, we need to find who triggered it.
      // For some notifications, we might have stored it in data.
      .filter(id => id);
    
    // Better way: get all unique playerNames/IDs if available
    // But since the current notifications only have playerName, let's look at who joined the event
    // Wait, the best way is to fetch the user by the ID stored in data if we add it. 
    // For now, let's just make it NOT crash and try to find the user by fullName if needed,
    // or just leave it for now and fix the creation logic for future ones.
    
    // ACTUALLY, let's just make sure it returns a safe structure first.
    
    // Format remaining Generic Notifications (those not linked to a request, like bookings/cancellations)
    const formattedGeneric = genericNotifications.map(n => {
      const eventId = n.data?.eventId;
      const event = organiserEvents.find(e => e._id.toString() === (eventId?.toString() || ''));

      return {
        notificationId: n._id.toString(),
        type: n.type,
        title: n.title,
        message: n.message,
        isRead: n.isRead,
        createdAt: n.createdAt,
        user: {
          fullName: n.data?.playerName || 'Someone',
          userId: n.data?.playerId || 0, // Fallback to 0 if missing
          profilePic: n.data?.playerProfilePic || null,
        },
        event: event ? {
          eventId: event.eventId,
          eventName: event.eventName || event.gameTitle || n.data?.eventName,
          eventTitle: event.eventName || event.gameTitle || n.data?.eventName,
        } : (n.data?.eventId ? {
          eventId: n.data.eventId,
          eventName: n.data.eventName,
          eventTitle: n.data.eventName,
        } : null),
        data: n.data,
        status: 'none', // Not a request
        requestType: 'notification'
      };
    });

    // Merge everything
    const allItems = [...formattedGeneric, ...formattedRequests];
    allItems.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const totalCount = allItems.length;
    const paginatedItems = allItems.slice(skip, skip + perPage);
    const pagination = createPaginationResponse(totalCount, page, perPage);

    // Total unread count (requests + general)
    const totalUnreadCount = unreadGenericCount + organiserJoinCount + eventPendingCount + eventWaitlistCount;

    res.status(200).json({
      success: true,
      message: 'Organiser notifications retrieved successfully',
      data: {
        unreadCount: totalUnreadCount,
        notifications: paginatedItems,
        organiserJoinRequests: organiserJoinCount,
        eventPendingRequests: eventPendingCount,
        eventWaitlistRequests: eventWaitlistCount,
        pagination: pagination,
      }
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

