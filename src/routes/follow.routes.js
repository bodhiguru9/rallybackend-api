const express = require('express');
const router = express.Router();
const followController = require('../controllers/follow/follow.controller');
const { protect, optionalAuth } = require('../middleware/auth');

/**
 * FOLLOW/SUBSCRIBE ROUTES
 * For public organisers - users can subscribe/follow
 */

/**
 * Subscribe/Follow a public organiser
 * POST /api/follow/:organiserId
 * Headers: Authorization: Bearer <token>
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Successfully followed organiser",
 *   "data": {
 *     "followerCount": 10,
 *     "followingCount": 5
 *   }
 * }
 */
router.post('/:organiserId', protect, followController.followOrganiser);

/**
 * Unsubscribe/Unfollow an organiser
 * DELETE /api/follow/:organiserId
 * Headers: Authorization: Bearer <token>
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Successfully unfollowed organiser",
 *   "data": {
 *     "followerCount": 9,
 *     "followingCount": 4
 *   }
 * }
 */
router.delete('/:organiserId', protect, followController.unfollowOrganiser);

/**
 * Get followers list of logged-in user (public organiser only)
 * GET /api/follow/me/followers?page=1
 * Headers: Authorization: Bearer <token>
 * 
 * Automatically detects the logged-in user and returns their followers list.
 * Only works if the logged-in user is a public organiser.
 * Uses page-based pagination: 20 items per page
 * Query parameter: page (default: 1)
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "organiser": {
 *       "userId": 5,
 *       "fullName": "John Doe",
 *       "profileVisibility": "public"
 *     },
 *     "followers": [...],
 *     "totalCount": 45,
 *     "pagination": {
 *       "totalCount": 45,
 *       "totalPages": 3,
 *       "currentPage": 1,
 *       "perPage": 20,
 *       "hasNextPage": true,
 *       "hasPrevPage": false
 *     }
 *   }
 * }
 */
router.get('/me/followers', protect, followController.getMyFollowers);

/**
 * Get following list of logged-in user
 * GET /api/follow/me/following?page=1
 * Headers: Authorization: Bearer <token>
 * 
 * Automatically detects the logged-in user and returns their following list
 * with complete organizer data (same data structure as /api/users/organisers/all)
 * Uses page-based pagination: 20 items per page
 * Query parameter: page (default: 1)
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Following organisers retrieved successfully",
 *   "data": {
 *     "organisers": [
 *       {
 *         "userId": 10,
 *         "mongoId": "507f1f77bcf86cd799439012",
 *         "fullName": "Sports Club",
 *         "email": "club@example.com",
 *         "profilePic": "https://...",
 *         "communityName": "City Sports",
 *         "yourCity": "New York",
 *         "profileVisibility": "public",
 *         "followersCount": 10,
 *         "isFollowing": true,
 *         "canFollow": true,
 *         ...
 *       }
 *     ],
 *     "pagination": {
 *       "totalCount": 25,
 *       "totalPages": 2,
 *       "currentPage": 1,
 *       "perPage": 20,
 *       "hasNextPage": true,
 *       "hasPrevPage": false
 *     }
 *   }
 * }
 */
router.get('/me/following', protect, followController.getMyFollowing);

/**
 * Get followers of an organiser
 * GET /api/follow/:organiserId/followers?page=1
 * 
 * Uses page-based pagination: 20 items per page
 * Query parameter: page (default: 1)
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "organiser": {
 *       "userId": 5,
 *       "fullName": "John Doe",
 *       "profileVisibility": "public"
 *     },
 *     "followers": [...],
 *     "pagination": {
 *       "totalCount": 45,
 *       "totalPages": 3,
 *       "currentPage": 1,
 *       "perPage": 20,
 *       "hasNextPage": true,
 *       "hasPrevPage": false
 *     }
 *   }
 * }
 */
router.get('/:organiserId/followers', followController.getFollowers);

/**
 * Get users that a person is following
 * GET /api/follow/:userId/following?page=1
 * Authorization: Bearer <token> (optional - for isFollowing status)
 * 
 * Returns list of organisers that the user is following with complete organizer data
 * (same data structure as /api/users/organisers/all)
 * Uses page-based pagination: 20 items per page
 * Query parameter: page (default: 1)
 * Supports both sequential userId and MongoDB ObjectId
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Following organisers retrieved successfully",
 *   "data": {
 *     "user": {
 *       "userId": 5,
 *       "fullName": "John Doe"
 *     },
 *     "organisers": [
 *       {
 *         "userId": 10,
 *         "mongoId": "507f1f77bcf86cd799439012",
 *         "fullName": "Sports Club",
 *         "email": "club@example.com",
 *         "profilePic": "https://...",
 *         "communityName": "City Sports",
 *         "yourCity": "New York",
 *         "profileVisibility": "public",
 *         "followersCount": 10,
 *         "isFollowing": true,
 *         "canFollow": true,
 *         ...
 *       }
 *     ],
 *     "pagination": {
 *       "totalCount": 25,
 *       "totalPages": 2,
 *       "currentPage": 1,
 *       "perPage": 20,
 *       "hasNextPage": true,
 *       "hasPrevPage": false
 *     }
 *   }
 * }
 */
router.get('/:userId/following', optionalAuth, followController.getFollowing);

/**
 * Check if user is following organiser
 * GET /api/follow/:organiserId/status
 * Headers: Authorization: Bearer <token>
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "isFollowing": true
 *   }
 * }
 */
router.get('/:organiserId/status', protect, followController.getFollowStatus);

module.exports = router;

