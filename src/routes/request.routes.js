const express = require('express');
const router = express.Router();
const requestController = require('../controllers/request/request.controller');
const { protect } = require('../middleware/auth');

/**
 * REQUEST TO JOIN ROUTES
 * For private organisers - users must request to join
 */

/**
 * Request to join private organiser
 * POST /api/request/:organiserId
 * Headers: Authorization: Bearer <token>
 * 
 * Supports both sequential organiserId (5, 6, etc.) and MongoDB ObjectId
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Join request sent successfully",
 *   "data": {
 *     "requestId": "R1",
 *     "user": {
 *       "userId": 5,
 *       "userType": "player",
 *       "email": "user@example.com",
 *       "profilePic": "https://...",
 *       "fullName": "John Doe",
 *       "sport1": "cricket",
 *       "sport2": "football",
 *       "sports": ["cricket", "football"]
 *     }
 *   }
 * }
 */
router.post('/:organiserId', protect, requestController.requestToJoin);

/**
 * Get pending requests for organiser
 * GET /api/request/pending?page=1
 * Headers: Authorization: Bearer <token>
 * 
 * IMPORTANT: The organiser ID is automatically taken from the logged-in user's JWT token.
 * You do NOT need to provide organiserId in query or body.
 * This endpoint returns pending requests for the currently logged-in organiser.
 * 
 * Uses page-based pagination: 20 items per page
 * Query Parameters (all optional):
 * - page: Page number (default: 1)
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "requests": [
 *       {
 *         "requestId": "...",
 *         "user": {
 *           "userId": 5,
 *           "userType": "player",
 *           "email": "...",
 *           "profilePic": "...",
 *           "fullName": "...",
 *           ...
 *         },
 *         "status": "pending",
 *         "createdAt": "..."
 *       }
 *     ],
 *     "totalCount": 5,
 *     "limit": 50,
 *     "skip": 0
 *   }
 * }
 */
router.get('/pending', protect, requestController.getPendingRequests);

/**
 * Get all accepted users for organiser
 * GET /api/request/accepted?organiserId=5&page=1&perPage=10
 * Headers: Authorization: Bearer <token>
 * 
 * Query Parameters (all optional):
 * - organiserId: Sequential userId (5, 6, etc.) or MongoDB ObjectId (default: logged-in user)
 * - page: Page number (default: 1)
 * - perPage: Items per page (default: 10)
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "acceptedUsers": [
 *       {
 *         "requestId": "R1",
 *         "user": {
 *           "userId": 5,
 *           "userType": "player",
 *           "email": "user@example.com",
 *           "profilePic": "...",
 *           "fullName": "John Doe",
 *           "sport1": "cricket",
 *           "sport2": "football",
 *           "sports": ["cricket", "football"]
 *         },
 *         "status": "accepted",
 *         "acceptedAt": "...",
 *         "createdAt": "..."
 *       }
 *     ],
 *     "pagination": {
 *       "totalCount": 10,
 *       "totalPages": 1,
 *       "currentPage": 1,
 *       "perPage": 10,
 *       "hasNextPage": false,
 *       "hasPrevPage": false
 *     }
 *   }
 * }
 */
router.get('/accepted', protect, requestController.getAcceptedUsers);

/**
 * Remove an accepted user
 * DELETE /api/request/accepted/:userId
 * Headers: Authorization: Bearer <token>
 * 
 * Supports both sequential userId (5, 6, etc.) and MongoDB ObjectId
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Accepted user removed successfully",
 *   "data": {
 *     "userId": 5,
 *     "fullName": "John Doe"
 *   }
 * }
 */
router.delete('/accepted/:userId', protect, requestController.removeAcceptedUser);

/**
 * Accept join request
 * POST /api/request/:requestId/accept
 * Headers: Authorization: Bearer <token>
 * 
 * Supports both sequential requestId (R1, R2, etc.) and MongoDB ObjectId
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Request accepted successfully",
 *   "data": {
 *     "requestId": "R1"
 *   }
 * }
 */
router.post('/:requestId/accept', protect, requestController.acceptRequest);

/**
 * Reject join request
 * POST /api/request/:requestId/reject
 * Headers: Authorization: Bearer <token>
 * 
 * Supports both sequential requestId (R1, R2, etc.) and MongoDB ObjectId
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Request rejected",
 *   "data": {
 *     "requestId": "R1"
 *   }
 * }
 */
router.post('/:requestId/reject', protect, requestController.rejectRequest);

module.exports = router;

