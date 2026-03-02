const Notification = require('../../models/Notification');
const User = require('../../models/User');
const Event = require('../../models/Event');
const { getPaginationParams, createPaginationResponse } = require('../../utils/pagination');
const { getDB } = require('../../config/database');
const { ObjectId } = require('mongodb');

/**
 * @desc    Get player notifications (count and list)
 * @route   GET /api/notifications/player
 * @access  Private (Player only)
 * 
 * Returns:
 * - Unread notification count
 * - List of notifications (event request accepted, organizer follow)
 */
const getPlayerNotifications = async (req, res, next) => {
  try {
    const userId = req.user.id; // MongoDB ObjectId from auth middleware
    const userType = req.user.userType;

    // Verify user is a player
    if (userType !== 'player') {
      return res.status(403).json({
        success: false,
        error: 'This endpoint is only available for players',
      });
    }

    const { page, perPage, skip } = getPaginationParams(req.query.page, 20);

    // Get unread notification count
    const unreadCount = await Notification.getUnreadCount(userId);

    // Get notifications
    const notifications = await Notification.getUserNotifications(userId, perPage, skip);

    // Get total count for pagination
    const db = getDB();
    const notificationsCollection = db.collection('notifications');
    const totalCount = await notificationsCollection.countDocuments({
      recipientId: new ObjectId(userId),
    });
    const pagination = createPaginationResponse(totalCount, page, perPage);

    // Enrich notifications with user and event details
    const enrichedNotifications = await Promise.all(
      notifications.map(async (notification) => {
        const enriched = {
          notificationId: notification._id.toString(),
          type: notification.type,
          title: notification.title,
          message: notification.message,
          isRead: notification.isRead,
          createdAt: notification.createdAt,
          data: notification.data || {},
        };

        // Add organizer details if organiserId is in data
        if (notification.data && notification.data.organiserId) {
          try {
            const organiser = await User.findById(notification.data.organiserId);
            if (organiser) {
              enriched.organiser = {
                userId: organiser.userId,
                mongoId: organiser._id.toString(),
                fullName: organiser.fullName || null,
                email: organiser.email || null,
                profilePic: organiser.profilePic || null,
                communityName: organiser.communityName || null,
              };
            }
          } catch (error) {
            // Organiser not found, skip
          }
        }

        // Add event details if eventId is in data
        if (notification.data && notification.data.eventId) {
          try {
            const event = await Event.findById(notification.data.eventId);
            if (event) {
              enriched.event = {
                eventId: event.eventId,
                mongoId: event._id.toString(),
                eventTitle: event.eventName || null,
                eventName: event.eventName || null,
                eventCategory: Array.isArray(event.eventSports) && event.eventSports.length > 0 ? event.eventSports[0] : null,
                eventType: event.eventType || null,
              };
            }
          } catch (error) {
            // Event not found, skip
          }
        }

        return enriched;
      })
    );

    res.status(200).json({
      success: true,
      message: 'Player notifications retrieved successfully',
      data: {
        unreadCount: unreadCount,
        notifications: enrichedNotifications,
        pagination: pagination,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Mark notification as read
 * @route   PUT /api/notifications/player/:notificationId/read
 * @access  Private (Player only)
 */
const markNotificationAsRead = async (req, res, next) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user.id;
    const userType = req.user.userType;

    if (userType !== 'player') {
      return res.status(403).json({
        success: false,
        error: 'This endpoint is only available for players',
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
 * @route   PUT /api/notifications/player/read-all
 * @access  Private (Player only)
 */
const markAllAsRead = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userType = req.user.userType;

    if (userType !== 'player') {
      return res.status(403).json({
        success: false,
        error: 'This endpoint is only available for players',
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
  getPlayerNotifications,
  markNotificationAsRead,
  markAllAsRead,
};

