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

/**
 * SMTP DIAGNOSTIC TEST ROUTE
 * POST /api/notifications/test-email
 * Public (for debugging setup)
 */
router.post('/test-email', async (req, res) => {
  const { to } = req.body;
  if (!to) {
    return res.status(400).json({ success: false, error: 'Recipient "to" email is required in request body.' });
  }

  const { createTransporter } = require('../utils/email');
  const emailId = process.env.Email_ID || process.env.EMAIL_ID || process.env.EMAIL_USER;
  const serviceKey = process.env.SERVICE_KEY || process.env.EMAIL_PASSWORD;
  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const smtpSecure = process.env.SMTP_SECURE === 'true' || process.env.SMTP_SECURE === '1' || false;

  const debugConfig = {
    resolvedEmailId: emailId,
    hasServiceKey: !!serviceKey,
    serviceKeyLength: serviceKey ? serviceKey.length : 0,
    serviceKeyHasSpaces: serviceKey ? serviceKey.includes(' ') : false,
    smtpHost,
    smtpPort,
    smtpSecure,
    requireTLS: !smtpSecure,
  };

  try {
    const transporter = createTransporter();
    
    // Verify connection configuration
    await transporter.verify();
    
    const mailOptions = {
      from: `"${process.env.APP_NAME || 'Rally Test'}" <${emailId}>`,
      to,
      subject: 'Rally SMTP Connection Diagnostic Test',
      text: 'Congratulations! If you receive this email, your SMTP configuration is correct and connection is fully working.',
      html: '<p>Congratulations! If you receive this email, your SMTP configuration is correct and connection is fully working.</p>',
    };

    const info = await transporter.sendMail(mailOptions);
    return res.status(200).json({
      success: true,
      message: 'SMTP Verification and Test Email Sent successfully!',
      config: debugConfig,
      info,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'SMTP Verification/Send Failed',
      config: debugConfig,
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
    });
  }
});

module.exports = router;

