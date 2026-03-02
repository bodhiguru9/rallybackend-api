const express = require('express');
const router = express.Router();
const blockController = require('../controllers/block/block.controller');
const { protect } = require('../middleware/auth');

/**
 * BLOCK/UNBLOCK ROUTES
 * For players and organisers - users can block/unblock other users
 */

/**
 * Block a user (player or organiser)
 * POST /api/block/:userId
 * Headers: Authorization: Bearer <token>
 * 
 * Supports both sequential userId and MongoDB ObjectId
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "User blocked successfully",
 *   "data": {
 *     "blockedUser": {
 *       "userId": 5,
 *       "userType": "player",
 *       "fullName": "John Doe"
 *     },
 *     "blockedCount": 3,
 *     "isBlocked": true
 *   }
 * }
 */
router.post('/:userId', protect, blockController.blockUser);

/**
 * Unblock a user (player or organiser)
 * DELETE /api/block/:userId
 * Headers: Authorization: Bearer <token>
 * 
 * Supports both sequential userId and MongoDB ObjectId
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "User unblocked successfully",
 *   "data": {
 *     "unblockedUser": {
 *       "userId": 5,
 *       "userType": "organiser",
 *       "fullName": "Jane Smith",
 *       "communityName": "Sports Club"
 *     },
 *     "blockedCount": 2,
 *     "isBlocked": false
 *   }
 * }
 */
router.delete('/:userId', protect, blockController.unblockUser);

/**
 * Get list of users blocked by the logged-in user
 * GET /api/block/blocked?page=1
 * Headers: Authorization: Bearer <token>
 * 
 * Uses page-based pagination: 20 items per page
 * Query parameter: page (default: 1)
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "blockedUsers": [
 *       {
 *         "userId": 5,
 *         "userType": "player",
 *         "fullName": "John Doe",
 *         "email": "john@example.com",
 *         "profilePic": "/uploads/profiles/abc.jpg",
 *         "blockedAt": "2024-01-15T10:30:00.000Z"
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
router.get('/blocked', protect, blockController.getBlockedUsers);

/**
 * Get list of users who blocked the logged-in user
 * GET /api/block/blocked-by?page=1
 * Headers: Authorization: Bearer <token>
 * 
 * Uses page-based pagination: 20 items per page
 * Query parameter: page (default: 1)
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "blockedByUsers": [
 *       {
 *         "userId": 7,
 *         "userType": "organiser",
 *         "fullName": "Jane Smith",
 *         "communityName": "Sports Club",
 *         "blockedAt": "2024-01-15T10:30:00.000Z"
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
router.get('/blocked-by', protect, blockController.getBlockedByUsers);

/**
 * Check if a user is blocked by the logged-in user
 * GET /api/block/:userId/status
 * Headers: Authorization: Bearer <token>
 * 
 * Supports both sequential userId and MongoDB ObjectId
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "isBlocked": true,
 *     "blockedAt": "2024-01-15T10:30:00.000Z",
 *     "blockedSince": "2024-01-15T10:30:00.000Z",
 *     "blockedDate": "2024-01-15",
 *     "blockedTimestamp": 1705315800000,
 *     "user": {
 *       "userId": 5,
 *       "userType": "player",
 *       "fullName": "John Doe"
 *     }
 *   }
 * }
 * 
 * Note: blockedAt, blockedSince, blockedDate, and blockedTimestamp are only included when isBlocked is true
 */
router.get('/:userId/status', protect, blockController.getBlockStatus);

/**
 * Check if there's a bidirectional block between logged-in user and another user
 * GET /api/block/:userId/bidirectional-status
 * Headers: Authorization: Bearer <token>
 * 
 * Supports both sequential userId and MongoDB ObjectId
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "isBlockedBidirectional": true,
 *     "currentUserBlocked": true,
 *     "otherUserBlocked": false,
 *     "user": {
 *       "userId": 5,
 *       "userType": "organiser",
 *       "fullName": "Jane Smith"
 *     }
 *   }
 * }
 */
router.get('/:userId/bidirectional-status', protect, blockController.getBidirectionalBlockStatus);

module.exports = router;

