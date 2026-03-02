const User = require('../../models/User');
const EventJoin = require('../../models/EventJoin');
const { formatEventResponse } = require('../../utils/eventFields');
const { getPaginationParams, createPaginationResponse } = require('../../utils/pagination');
const { getDB } = require('../../config/database');

/**
 * @desc    Get joined events for a user (public)
 * @route   GET /api/users/:userId/joined-events?page=1&perPage=20
 * @access  Public
 *
 * userId is the sequential userId (not MongoDB ObjectId)
 */
const getUserJoinedEvents = async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (!userId || isNaN(userId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid userId. Please provide a sequential userId.',
      });
    }

    const user = await User.findByUserId(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        suggestion: 'Please provide a valid sequential userId',
      });
    }

    const { page, perPage, skip } = getPaginationParams(req.query.page, req.query.perPage || 20);

    const db = getDB();
    const eventJoinsCollection = db.collection('eventJoins');
    const totalCount = await eventJoinsCollection.countDocuments({ userId: user._id });

    const joinedEvents = await EventJoin.getUserJoinedEvents(user._id, perPage, skip);
    const events = joinedEvents.map((event) => ({
      ...formatEventResponse(event),
      joinedAt: event.joinedAt || null,
    }));

    const pagination = createPaginationResponse(totalCount, page, perPage);

    return res.status(200).json({
      success: true,
      message: 'User joined events retrieved successfully',
      data: {
        user: {
          userId: user.userId,
          userType: user.userType,
          fullName: user.fullName || null,
          communityName: user.communityName || null,
          profilePic: user.profilePic || null,
        },
        events,
        pagination,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getUserJoinedEvents,
};
