const { getDB } = require('../../config/database');
const { getPaginationParams, createPaginationResponse } = require('../../utils/pagination');
const { ObjectId } = require('mongodb');

/**
 * @desc    Get top organisers ranked by followers, attendees, and events created
 * @route   GET /api/users/organisers/top?page=1
 * @access  Public
 * 
 * Returns list of organisers sorted by:
 * 1. Most followers (descending)
 * 2. Most total attendees across all events (descending)
 * 3. Most events created (descending)
 * 
 * Response includes only:
 * - userId
 * - profilePic
 * - fullName
 * - isVerified (true if email or mobile is verified)
 * 
 * Uses page-based pagination: 20 items per page
 */
const getTopOrganisers = async (req, res, next) => {
  try {
    const { page, perPage, skip } = getPaginationParams(req.query.page, 20);

    const db = getDB();
    const usersCollection = db.collection('users');
    const followsCollection = db.collection('follows');

    // Base query: all organisers
    let query = { userType: 'organiser' };

    // ?isSubscribed=true → filter to only organisers the current user follows
    if (req.query.isSubscribed === 'true' && req.user) {
      const userFollows = await followsCollection
        .find({ followerId: req.user._id })
        .toArray();
      const followedOrganiserIds = userFollows.map((f) => f.followingId);

      if (followedOrganiserIds.length > 0) {
        query._id = { $in: followedOrganiserIds };
      } else {
        // User follows nobody — return empty list immediately
        return res.status(200).json({
          success: true,
          message: 'Top organisers retrieved successfully',
          data: {
            organisers: [],
            pagination: createPaginationResponse(0, page, perPage),
          },
        });
      }
    }

    // Single DB query — sort on pre-calculated fields stored on each User document.
    // These fields are kept in sync atomically by Follow.updateFollowerCount,
    // Event.recalculateTotalAttendees, and Event.updateEventsCount on every write.
    const [paginatedOrganisers, totalCount] = await Promise.all([
      usersCollection
        .find(query)
        .sort({ followersCount: -1, totalAttendees: -1, eventsCreated: -1 })
        .skip(skip)
        .limit(perPage)
        .toArray(),
      usersCollection.countDocuments(query),
    ]);

    const formattedOrganisers = paginatedOrganisers.map((organiser) => ({
      userId: organiser.userId,
      profilePic: organiser.profilePic || null,
      fullName: organiser.fullName || null,
      communityName: organiser.communityName || null,
      isVerified: !!(organiser.isEmailVerified || organiser.isMobileVerified),
    }));

    const pagination = createPaginationResponse(totalCount, page, perPage);

    return res.status(200).json({
      success: true,
      message: 'Top organisers retrieved successfully',
      data: {
        organisers: formattedOrganisers,
        pagination,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTopOrganisers,
};
