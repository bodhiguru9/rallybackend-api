const { getDB } = require('../../config/database');
const { getPaginationParams, createPaginationResponse } = require('../../utils/pagination');

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
    const eventsCollection = db.collection('events');
    const eventJoinsCollection = db.collection('eventJoins');

    // Step 1: Get all organisers
    const organisers = await usersCollection
      .find({ userType: 'organiser' })
      .toArray();

    if (organisers.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'Top organisers retrieved successfully',
        data: {
          organisers: [],
          pagination: createPaginationResponse(0, page, perPage),
        },
      });
    }

    // Step 2: Get all follower counts in one query
    const organiserIds = organisers.map((o) => o._id);
    const followerCountsMap = new Map();
    const followerCounts = await followsCollection
      .aggregate([
        { $match: { followingId: { $in: organiserIds } } },
        { $group: { _id: '$followingId', count: { $sum: 1 } } },
      ])
      .toArray();
    followerCounts.forEach((fc) => {
      followerCountsMap.set(fc._id.toString(), fc.count);
    });

    // Step 3: Get all events created by organisers in one query
    const eventsByCreator = await eventsCollection
      .find({ creatorId: { $in: organiserIds } })
      .toArray();

    // Group events by creator
    const eventsByCreatorMap = new Map();
    const eventIdsByCreator = new Map();
    eventsByCreator.forEach((event) => {
      const creatorId = event.creatorId.toString();
      if (!eventsByCreatorMap.has(creatorId)) {
        eventsByCreatorMap.set(creatorId, []);
        eventIdsByCreator.set(creatorId, []);
      }
      eventsByCreatorMap.get(creatorId).push(event);
      eventIdsByCreator.get(creatorId).push(event._id);
    });

    // Step 4: Get total attendees for all events in batches
    const allEventIds = eventsByCreator.map((e) => e._id);
    const attendeesCountMap = new Map();
    
    if (allEventIds.length > 0) {
      // Aggregate attendees by eventId
      const attendeesByEvent = await eventJoinsCollection
        .aggregate([
          { $match: { eventId: { $in: allEventIds } } },
          { $group: { _id: '$eventId', count: { $sum: 1 } } },
        ])
        .toArray();

      const attendeesByEventMap = new Map();
      attendeesByEvent.forEach((ae) => {
        attendeesByEventMap.set(ae._id.toString(), ae.count);
      });

      // Calculate total attendees per organiser
      organiserIds.forEach((organiserId) => {
        const creatorIdStr = organiserId.toString();
        const eventIds = eventIdsByCreator.get(creatorIdStr) || [];
        let totalAttendees = 0;
        eventIds.forEach((eventId) => {
          totalAttendees += attendeesByEventMap.get(eventId.toString()) || 0;
        });
        attendeesCountMap.set(creatorIdStr, totalAttendees);
      });
    }

    // Step 5: Calculate metrics for each organiser
    const organisersWithMetrics = organisers.map((organiser) => {
      const organiserIdStr = organiser._id.toString();
      
      const followerCount = followerCountsMap.get(organiserIdStr) || 0;
      const eventsCreatedCount = eventsByCreatorMap.get(organiserIdStr)?.length || 0;
      const totalAttendees = attendeesCountMap.get(organiserIdStr) || 0;
      const isVerified = !!(organiser.isEmailVerified || organiser.isMobileVerified);

      return {
        organiser,
        metrics: {
          followerCount,
          totalAttendees,
          eventsCreatedCount,
        },
        isVerified,
      };
    });

    // Step 6: Sort by followers (desc), then attendees (desc), then events (desc)
    organisersWithMetrics.sort((a, b) => {
      // Primary: followers
      if (b.metrics.followerCount !== a.metrics.followerCount) {
        return b.metrics.followerCount - a.metrics.followerCount;
      }
      // Secondary: total attendees
      if (b.metrics.totalAttendees !== a.metrics.totalAttendees) {
        return b.metrics.totalAttendees - a.metrics.totalAttendees;
      }
      // Tertiary: events created
      return b.metrics.eventsCreatedCount - a.metrics.eventsCreatedCount;
    });

    // Step 7: Format response with only required fields
    const formattedOrganisers = organisersWithMetrics.map((item) => ({
      userId: item.organiser.userId,
      profilePic: item.organiser.profilePic || null,
      fullName: item.organiser.fullName || null,
      isVerified: item.isVerified,
    }));

    // Step 8: Apply pagination
    const totalCount = formattedOrganisers.length;
    const paginatedOrganisers = formattedOrganisers.slice(skip, skip + perPage);
    const pagination = createPaginationResponse(totalCount, page, perPage);

    return res.status(200).json({
      success: true,
      message: 'Top organisers retrieved successfully',
      data: {
        organisers: paginatedOrganisers,
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
