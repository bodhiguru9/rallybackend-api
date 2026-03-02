const Favorite = require('../../models/Favorite');
const Event = require('../../models/Event');
const { formatEventResponse } = require('../../utils/eventFields');

/**
 * @desc    Add event to favorites
 * @route   POST /api/favorites/:eventId
 * @access  Private
 */
const addFavorite = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.id; // MongoDB ObjectId from auth middleware
    const userSequentialId = req.user.userId; // Sequential userId

    // Add to favorites
    const favorite = await Favorite.add(userId, eventId);

    // Get event details
    const event = await Event.findByEventId(eventId) || await Event.findById(eventId);
    
    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found',
      });
    }

    res.status(201).json({
      success: true,
      message: 'Event added to favorites successfully',
      data: {
        favoriteId: favorite.favoriteId,
        event: formatEventResponse(event),
      },
    });
  } catch (error) {
    if (error.message === 'Event is already in favorites') {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    if (error.message === 'Event not found' || error.message === 'User not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
};

/**
 * @desc    Remove event from favorites
 * @route   DELETE /api/favorites/:eventId
 * @access  Private
 */
const removeFavorite = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.id; // MongoDB ObjectId from auth middleware

    const removed = await Favorite.remove(userId, eventId);

    if (!removed) {
      return res.status(404).json({
        success: false,
        error: 'Event not found in favorites',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Event removed from favorites successfully',
    });
  } catch (error) {
    if (error.message === 'Event not found' || error.message === 'User not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
};

/**
 * @desc    Get user's favorite events
 * @route   GET /api/favorites
 * @access  Private
 * 
 * Query parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20)
 */
const getFavorites = async (req, res, next) => {
  try {
    const userId = req.user.id; // MongoDB ObjectId from auth middleware
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const favorites = await Favorite.getUserFavorites(userId, limit, skip);

    // Format events using centralized formatter
    const formattedFavorites = favorites.map((fav) => ({
      favoriteId: fav.favoriteId,
      event: fav.event ? formatEventResponse(fav.event) : null,
      createdAt: fav.createdAt,
    }));

    res.status(200).json({
      success: true,
      data: {
        favorites: formattedFavorites,
        pagination: {
          page,
          limit,
          total: formattedFavorites.length,
        },
      },
    });
  } catch (error) {
    if (error.message === 'User not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
};

/**
 * @desc    Check if event is favorited by current user
 * @route   GET /api/favorites/check/:eventId
 * @access  Private
 */
const checkFavorite = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.id; // MongoDB ObjectId from auth middleware

    const isFavorited = await Favorite.isFavorited(userId, eventId);

    res.status(200).json({
      success: true,
      data: {
        isFavorited,
        eventId,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get favorite count for an event
 * @route   GET /api/favorites/count/:eventId
 * @access  Public
 */
const getFavoriteCount = async (req, res, next) => {
  try {
    const { eventId } = req.params;

    const count = await Favorite.getEventFavoriteCount(eventId);

    res.status(200).json({
      success: true,
      data: {
        eventId,
        favoriteCount: count,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  addFavorite,
  removeFavorite,
  getFavorites,
  checkFavorite,
  getFavoriteCount,
};

