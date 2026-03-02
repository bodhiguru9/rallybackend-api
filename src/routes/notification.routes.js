const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const organiserNotificationController = require('../controllers/notification/organiserNotification.controller');
const playerNotificationController = require('../controllers/notification/playerNotification.controller');

/**
 * ORGANISER NOTIFICATION ROUTES
 */

/**
 * GET ORGANISER NOTIFICATIONS
 * GET /api/notifications/organiser?page=1
 * Authorization: Bearer <token> (required)
 * 
 * Returns notifications for the logged-in organiser:
 * - Unread notification count
 * - List of notifications (event join requests, event leaves)
 * - Pagination support
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Organiser notifications retrieved successfully",
 *   "data": {
 *     "unreadCount": 5,
 *     "notifications": [
 *       {
 *         "notificationId": "...",
 *         "type": "event_join_request",
 *         "title": "New Join Request",
 *         "message": "John Doe requested to join your private event",
 *         "isRead": false,
 *         "createdAt": "2024-01-01T00:00:00.000Z",
 *         "user": {
 *           "userId": 5,
 *           "fullName": "John Doe",
 *           "email": "john@example.com",
 *           "profilePic": "..."
 *         },
 *         "event": {
 *           "eventId": "E1",
 *           "eventName": "Football Match"
 *         }
 *       }
 *     ],
 *     "pagination": { ... }
 *   }
 * }
 */
router.get('/organiser', protect, organiserNotificationController.getOrganiserNotifications);

/**
 * MARK ORGANISER NOTIFICATION AS READ
 * PUT /api/notifications/organiser/:notificationId/read
 * Authorization: Bearer <token> (required)
 */
router.put('/organiser/:notificationId/read', protect, organiserNotificationController.markNotificationAsRead);

/**
 * MARK ALL ORGANISER NOTIFICATIONS AS READ
 * PUT /api/notifications/organiser/read-all
 * Authorization: Bearer <token> (required)
 */
router.put('/organiser/read-all', protect, organiserNotificationController.markAllAsRead);

/**
 * PLAYER NOTIFICATION ROUTES
 */

/**
 * GET PLAYER NOTIFICATIONS
 * GET /api/notifications/player?page=1
 * Authorization: Bearer <token> (required)
 * 
 * Returns notifications for the logged-in player:
 * - Unread notification count
 * - List of notifications (event request accepted, organizer follow)
 * - Pagination support
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Player notifications retrieved successfully",
 *   "data": {
 *     "unreadCount": 3,
 *     "notifications": [
 *       {
 *         "notificationId": "...",
 *         "type": "event_request_accepted",
 *         "title": "Request Accepted",
 *         "message": "Your request to join Football Match has been accepted",
 *         "isRead": false,
 *         "createdAt": "2024-01-01T00:00:00.000Z",
 *         "organiser": {
 *           "userId": 10,
 *           "fullName": "Sports Club",
 *           "email": "club@example.com"
 *         },
 *         "event": {
 *           "eventId": "E1",
 *           "eventName": "Football Match"
 *         }
 *       }
 *     ],
 *     "pagination": { ... }
 *   }
 * }
 */
router.get('/player', protect, playerNotificationController.getPlayerNotifications);

/**
 * MARK PLAYER NOTIFICATION AS READ
 * PUT /api/notifications/player/:notificationId/read
 * Authorization: Bearer <token> (required)
 */
router.put('/player/:notificationId/read', protect, playerNotificationController.markNotificationAsRead);

/**
 * MARK ALL PLAYER NOTIFICATIONS AS READ
 * PUT /api/notifications/player/read-all
 * Authorization: Bearer <token> (required)
 */
router.put('/player/read-all', protect, playerNotificationController.markAllAsRead);

module.exports = router;

