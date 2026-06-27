const User = require('../../models/User');
const Event = require('../../models/Event');
const EventJoin = require('../../models/EventJoin');
const { formatEventResponse } = require('../../utils/eventFields');
const { getPaginationParams, createPaginationResponse } = require('../../utils/pagination');

/**
 * @desc    Get organiser created events with participants
 * @route   GET /api/users/organiser/:userId/events?page=1&perPage=20
 * @access  Private
 *
 * Note: userId is the sequential userId, not MongoDB ObjectId. Use "me" to
 * fetch events for the logged-in organiser.
 */
const getOrganiserEventsWithParticipants = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const isSelfAlias = userId === 'me' || userId === 'self';
    const hasNumericUserId = userId && !isNaN(userId);

    let targetUserId = null;
    if (isSelfAlias) {
      targetUserId = req.user ? req.user.userId : null;
    } else if (hasNumericUserId) {
      targetUserId = parseInt(userId, 10);
    } else if (req.user) {
      targetUserId = req.user.userId;
    }

    if (!targetUserId) {
      return res.status(400).json({
        success: false,
        error: 'Invalid userId. Please provide a sequential userId or use "me".',
      });
    }

    if (req.user && req.user.userType === 'organiser' && req.user.userId !== targetUserId) {
      return res.status(403).json({
        success: false,
        error: 'You can only view your own hosted events',
      });
    }

    const organiser = await User.findByUserId(targetUserId);
    if (!organiser) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        suggestion: 'Please provide a valid sequential userId',
      });
    }

    if (organiser.userType !== 'organiser') {
      return res.status(400).json({
        success: false,
        error: 'User is not an organiser',
      });
    }

    const { page, perPage, skip } = getPaginationParams(req.query.page, req.query.perPage || 20);

    // DB-level pagination — only fetch the current page (was: fetch 1000, slice in JS)
    const totalCount = await Event.getEventCount(organiser._id);
    const pageEvents = await Event.findByCreator(organiser._id, perPage, skip);

    // Batch-fetch participant counts and participants for the page in bulk
    const { batchParticipantCounts, batchEventParticipants } = require('../../utils/batchEventData');
    const pageEventIds = pageEvents.map((e) => e._id);
    const [participantCountMap, participantsMap] = await Promise.all([
      batchParticipantCounts(pageEventIds),
      batchEventParticipants(pageEventIds, 100), // organiser dashboard needs full list
    ]);

    const paginatedEvents = pageEvents.map((event) => {
      const eventIdStr = event._id.toString();
      return {
        ...formatEventResponse(event),
        participants: participantsMap.get(eventIdStr) || [],
        participantsCount: participantCountMap.get(eventIdStr) || 0,
      };
    });

    const pagination = createPaginationResponse(totalCount, page, perPage);

    return res.status(200).json({
      success: true,
      message: 'Organiser events retrieved successfully',
      data: {
        organiser: {
          userId: organiser.userId,
          fullName: organiser.fullName || null,
          communityName: organiser.communityName || null,
        },
        events: paginatedEvents,
        pagination,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getOrganiserEventsWithParticipants,
};
