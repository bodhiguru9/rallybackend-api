const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  addFavorite,
  removeFavorite,
  getFavorites,
  checkFavorite,
  getFavoriteCount,
} = require('../controllers/favorite/favorite.controller');

/**
 * POST /api/favorites/:eventId
 * Add event to favorites
 * 
 * Authorization: Bearer <token> (required)
 * 
 * Path Parameters:
 * - eventId: Event ID (sequential eventId like "E1" or MongoDB ObjectId)
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Event added to favorites successfully",
 *   "data": {
 *     "favoriteId": "FAV1",
 *     "event": { ... }
 *   }
 * }
 */
router.post('/:eventId', protect, addFavorite);

/**
 * DELETE /api/favorites/:eventId
 * Remove event from favorites
 * 
 * Authorization: Bearer <token> (required)
 * 
 * Path Parameters:
 * - eventId: Event ID (sequential eventId like "E1" or MongoDB ObjectId)
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Event removed from favorites successfully"
 * }
 */
router.delete('/:eventId', protect, removeFavorite);

/**
 * GET /api/favorites
 * Get user's favorite events
 * 
 * Authorization: Bearer <token> (required)
 * 
 * Query Parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20)
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "favorites": [
 *       {
 *         "favoriteId": "FAV1",
 *         "event": { ... },
 *         "createdAt": "2024-01-01T00:00:00.000Z"
 *       }
 *     ],
 *     "pagination": {
 *       "page": 1,
 *       "limit": 20,
 *       "total": 10
 *     }
 *   }
 * }
 */
router.get('/', protect, getFavorites);

/**
 * GET /api/favorites/check/:eventId
 * Check if event is favorited by current user
 * 
 * Authorization: Bearer <token> (required)
 * 
 * Path Parameters:
 * - eventId: Event ID (sequential eventId like "E1" or MongoDB ObjectId)
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "isFavorited": true,
 *     "eventId": "E1"
 *   }
 * }
 */
router.get('/check/:eventId', protect, checkFavorite);

/**
 * GET /api/favorites/count/:eventId
 * Get favorite count for an event
 * 
 * Authorization: None (public)
 * 
 * Path Parameters:
 * - eventId: Event ID (sequential eventId like "E1" or MongoDB ObjectId)
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "eventId": "E1",
 *     "favoriteCount": 25
 *   }
 * }
 */
router.get('/count/:eventId', getFavoriteCount);

module.exports = router;

