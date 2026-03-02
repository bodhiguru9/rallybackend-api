const express = require('express');
const router = express.Router();
const eventBlockController = require('../controllers/eventBlock/eventBlock.controller');
const { protect } = require('../middleware/auth');

/**
 * EVENT BLOCK/UNBLOCK ROUTES
 * For players and organisers - users can block/unblock events
 */

/**
 * Block an event
 * POST /api/event-block/:eventId
 * Headers: Authorization: Bearer <token>
 * 
 * Supports both sequential eventId (E1, E2, etc.) and MongoDB ObjectId
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Event blocked successfully",
 *   "data": {
 *     "blockedEvent": {
 *       "eventId": "E1",
 *       "mongoId": "507f1f77bcf86cd799439011",
 *       "gameTitle": "Cricket Match",
 *       "gameType": "tournament",
 *       "gameCategory": "cricket",
 *       "gameCreatorName": "John Doe"
 *     },
 *     "blockedCount": 3,
 *     "isBlocked": true
 *   }
 * }
 */
router.post('/:eventId', protect, eventBlockController.blockEvent);

/**
 * Unblock an event
 * DELETE /api/event-block/:eventId
 * Headers: Authorization: Bearer <token>
 * 
 * Supports both sequential eventId (E1, E2, etc.) and MongoDB ObjectId
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Event unblocked successfully",
 *   "data": {
 *     "unblockedEvent": {
 *       "eventId": "E1",
 *       "mongoId": "507f1f77bcf86cd799439011",
 *       "gameTitle": "Cricket Match",
 *       "gameType": "tournament",
 *       "gameCategory": "cricket",
 *       "gameCreatorName": "John Doe"
 *     },
 *     "blockedCount": 2,
 *     "isBlocked": false
 *   }
 * }
 */
router.delete('/:eventId', protect, eventBlockController.unblockEvent);

/**
 * Get list of events blocked by the logged-in user
 * GET /api/event-block/blocked?page=1
 * Headers: Authorization: Bearer <token>
 * 
 * Uses page-based pagination: 20 items per page
 * Query parameter: page (default: 1)
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "blockedEvents": [
 *       {
 *         "eventId": "E1",
 *         "mongoId": "507f1f77bcf86cd799439011",
 *         "gameTitle": "Cricket Match",
 *         "gameImages": ["/uploads/events/img1.jpg"],
 *         "gameType": "tournament",
 *         "gameCategory": "cricket",
 *         "gameStartDate": "2024-01-15T10:00:00.000Z",
 *         "gameTime": "10:00 AM",
 *         "gameLocationArena": "Sports Complex",
 *         "gameCreatorName": "John Doe",
 *         "gameJoinPrice": 50,
 *         "visibility": "public",
 *         "status": "upcoming",
 *         "blockedAt": "2024-01-10T10:30:00.000Z"
 *       }
 *     ],
 *     "totalCount": 5,
 *     "pagination": {
 *       "totalCount": 5,
 *       "totalPages": 1,
 *       "currentPage": 1,
 *       "perPage": 20,
 *       "hasNextPage": false,
 *       "hasPrevPage": false
 *     }
 *   }
 * }
 */
router.get('/blocked', protect, eventBlockController.getBlockedEvents);

/**
 * Get list of users who blocked an event (Event creator only)
 * GET /api/event-block/:eventId/blocked-by?page=1
 * Headers: Authorization: Bearer <token>
 * 
 * Only the event creator can view who blocked their event.
 * Uses page-based pagination: 20 items per page
 * Query parameter: page (default: 1)
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "event": {
 *       "eventId": "E1",
 *       "mongoId": "507f1f77bcf86cd799439011",
 *       "gameTitle": "Cricket Match"
 *     },
 *     "blockedByUsers": [
 *       {
 *         "userId": 5,
 *         "userType": "player",
 *         "fullName": "Jane Smith",
 *         "email": "jane@example.com",
 *         "profilePic": "/uploads/profiles/abc.jpg",
 *         "blockedAt": "2024-01-10T10:30:00.000Z"
 *       }
 *     ],
 *     "totalCount": 2,
 *     "pagination": {
 *       "totalCount": 2,
 *       "totalPages": 1,
 *       "currentPage": 1,
 *       "perPage": 20,
 *       "hasNextPage": false,
 *       "hasPrevPage": false
 *     }
 *   }
 * }
 */
router.get('/:eventId/blocked-by', protect, eventBlockController.getBlockedByUsers);

/**
 * Check if an event is blocked by the logged-in user
 * GET /api/event-block/:eventId/status
 * Headers: Authorization: Bearer <token>
 * 
 * Supports both sequential eventId (E1, E2, etc.) and MongoDB ObjectId
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "isBlocked": true,
 *     "event": {
 *       "eventId": "E1",
 *       "mongoId": "507f1f77bcf86cd799439011",
 *       "gameTitle": "Cricket Match",
 *       "gameType": "tournament",
 *       "gameCategory": "cricket"
 *     }
 *   }
 * }
 */
router.get('/:eventId/status', protect, eventBlockController.getBlockStatus);

/**
 * Check block status for multiple events (batch)
 * POST /api/event-block/status/batch
 * Headers: Authorization: Bearer <token>
 * 
 * Body:
 * {
 *   "eventIds": ["E1", "E2", "507f1f77bcf86cd799439011"]
 * }
 * 
 * Maximum 100 event IDs per request
 * Supports both sequential eventId (E1, E2, etc.) and MongoDB ObjectId
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "blockStatus": {
 *       "E1": true,
 *       "E2": false,
 *       "507f1f77bcf86cd799439011": true
 *     }
 *   }
 * }
 */
router.post('/status/batch', protect, eventBlockController.getBatchBlockStatus);

module.exports = router;

