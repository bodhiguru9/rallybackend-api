const User = require('../../models/User');
const { getPaginationParams, createPaginationResponse } = require('../../utils/pagination');
const { getDB } = require('../../config/database');
const { ObjectId } = require('mongodb');

/**
 * @desc    Get organiser attendees across all their events
 * @route   GET /api/organizers/attendees?page=1&perPage=20
 * @access  Private (Organiser only)
 */
const getOrganiserAttendees = async (req, res, next) => {
  try {
    const organiserId = req.user.id;

    const organiser = await User.findById(organiserId);
    if (!organiser) {
      return res.status(404).json({
        success: false,
        error: 'Organiser not found',
      });
    }

    if (organiser.userType !== 'organiser') {
      return res.status(403).json({
        success: false,
        error: 'Only organisers can view attendees',
      });
    }

    const { page, perPage, skip } = getPaginationParams(req.query.page, req.query.perPage || 20);

    const db = getDB();
    const eventsCollection = db.collection('events');
    const joinsCollection = db.collection('eventJoins');
    const bookingsCollection = db.collection('bookings');
    const usersCollection = db.collection('users');

    const organiserObjectId = new ObjectId(organiserId);
    const organiserIdString = organiserObjectId.toString();

    const events = await eventsCollection
      .find({ $or: [{ creatorId: organiserObjectId }, { creatorId: organiserIdString }] })
      .project({ _id: 1 })
      .toArray();

    if (events.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'Organiser attendees retrieved successfully',
        data: {
          organiser: {
            userId: organiser.userId,
            fullName: organiser.fullName || null,
            communityName: organiser.communityName || null,
          },
          attendees: [],
          summary: {
            totalAttendees: 0,
            totalBookings: 0,
            totalSpent: 0,
          },
          pagination: createPaginationResponse(0, page, perPage),
        },
      });
    }

    const eventIds = events.map((event) => event._id);

    const totalCountResult = await joinsCollection
      .aggregate([
        { $match: { eventId: { $in: eventIds } } },
        { $group: { _id: '$userId' } },
        { $count: 'total' },
      ])
      .toArray();
    const totalCount = totalCountResult[0]?.total || 0;

    const summaryAgg = await joinsCollection
      .aggregate([
        { $match: { eventId: { $in: eventIds } } },
        {
          $group: {
            _id: null,
            totalJoinedEvents: { $sum: 1 },
            distinctUsers: { $addToSet: '$userId' },
          },
        },
        {
          $project: {
            _id: 0,
            totalJoinedEvents: 1,
            totalAttendees: { $size: '$distinctUsers' },
          },
        },
      ])
      .toArray();
    const summaryBase = summaryAgg[0] || { totalJoinedEvents: 0, totalAttendees: 0 };

    const spendSummary = await bookingsCollection
      .aggregate([
        { $match: { eventId: { $in: eventIds }, status: 'booked' } },
        {
          $group: {
            _id: null,
            totalSpent: { $sum: { $ifNull: ['$finalAmount', 0] } },
          },
        },
        { $project: { _id: 0, totalSpent: 1 } },
      ])
      .toArray();
    const totalSpentSummary = spendSummary[0]?.totalSpent || 0;

    const attendeeAgg = await joinsCollection
      .aggregate([
        { $match: { eventId: { $in: eventIds } } },
        {
          $group: {
            _id: '$userId',
            joinedEvents: { $sum: 1 },
            lastJoinedAt: { $max: '$joinedAt' },
          },
        },
        { $sort: { lastJoinedAt: -1 } },
        { $skip: skip },
        { $limit: perPage },
      ])
      .toArray();

    const attendeeIds = attendeeAgg.map((attendee) => attendee._id);
    const attendees = attendeeIds.length > 0
      ? await usersCollection.find({ _id: { $in: attendeeIds } }).toArray()
      : [];

    const attendeeMap = new Map();
    attendees.forEach((attendee) => {
      attendeeMap.set(attendee._id.toString(), attendee);
    });

    const attendeeSpendAgg = await bookingsCollection
      .aggregate([
        {
          $match: {
            eventId: { $in: eventIds },
            status: 'booked',
            userId: { $in: attendeeIds },
          },
        },
        {
          $group: {
            _id: '$userId',
            totalSpent: { $sum: { $ifNull: ['$finalAmount', 0] } },
            lastBookedAt: { $max: '$bookedAt' },
          },
        },
      ])
      .toArray();
    const spendMap = new Map();
    attendeeSpendAgg.forEach((entry) => {
      spendMap.set(entry._id.toString(), {
        totalSpent: entry.totalSpent || 0,
        lastBookedAt: entry.lastBookedAt || null,
      });
    });

    const attendeesList = attendeeAgg.map((attendee) => {
      const user = attendeeMap.get(attendee._id.toString());
      const spend = spendMap.get(attendee._id.toString()) || { totalSpent: 0, lastBookedAt: null };
      return {
        userId: user?.userId || null,
        fullName: user?.fullName || null,
        profilePic: user?.profilePic || null,
        totalJoinedEvents: attendee.joinedEvents || 0,
        joinedEventsCount: attendee.joinedEvents || 0,
        totalSpent: spend.totalSpent || 0,
        lastBookedAt: spend.lastBookedAt || null,
      };
    });

    const pagination = createPaginationResponse(totalCount, page, perPage);

    return res.status(200).json({
      success: true,
      message: 'Organiser attendees retrieved successfully',
      data: {
        organiser: {
          userId: organiser.userId,
          fullName: organiser.fullName || null,
          communityName: organiser.communityName || null,
        },
        attendees: attendeesList,
        summary: {
          totalAttendees: summaryBase.totalAttendees,
          totalJoinedEvents: summaryBase.totalJoinedEvents,
          totalSpent: totalSpentSummary,
        },
        pagination,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getOrganiserAttendees,
};
