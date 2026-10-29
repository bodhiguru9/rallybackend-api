const { getDB } = require('../../config/database');
const { getPaginationParams, createPaginationResponse } = require('../../utils/pagination');
const { getBookingStatsByEvents } = require('../../utils/bookingStats');

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @desc    List events across all organisers (the Events tab)
 * @route   GET /api/admin/events?type=all|free|paid&search=&page=&perPage=
 * @access  Admin key (adminKeyAuth)
 *
 * Mirrors getOrganiserEvents but without a single-organiser scope, and
 * includes each event's organiser so the tab can show who created it.
 * creatorId is matched by string equality since it's stored as either an
 * ObjectId or a string depending on when the event was created.
 */
const listAllEvents = async (req, res, next) => {
  try {
    const typeFilter = (req.query.type || 'all').toLowerCase();
    if (!['all', 'free', 'paid'].includes(typeFilter)) {
      return res.status(400).json({ success: false, error: 'type must be one of: all, free, paid' });
    }

    const { page, perPage, skip } = getPaginationParams(req.query.page, parseInt(req.query.perPage, 10) || 20);
    const search = (req.query.search || '').trim();

    const db = getDB();
    const eventsCollection = db.collection('events');

    const pipeline = [
      {
        $lookup: {
          from: 'users',
          let: { cid: '$creatorId' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: [{ $toString: '$_id' }, { $toString: '$$cid' }] },
              },
            },
          ],
          as: 'organiser',
        },
      },
      { $unwind: { path: '$organiser', preserveNullAndEmptyArrays: true } },
    ];

    const matchStage = {};
    if (typeFilter === 'free') matchStage.eventPricePerGuest = { $in: [0, null] };
    else if (typeFilter === 'paid') matchStage.eventPricePerGuest = { $gt: 0 };

    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      matchStage.$or = [
        { eventName: regex },
        { 'organiser.fullName': regex },
        { 'organiser.email': regex },
        { 'organiser.communityName': regex },
      ];
    }

    if (Object.keys(matchStage).length > 0) {
      pipeline.push({ $match: matchStage });
    }

    pipeline.push({
      $facet: {
        data: [{ $sort: { eventDateTime: -1 } }, { $skip: skip }, { $limit: perPage }],
        totalCount: [{ $count: 'count' }],
      },
    });

    const [result] = await eventsCollection.aggregate(pipeline).toArray();
    const events = result?.data || [];
    const totalCount = result?.totalCount?.[0]?.count || 0;

    const statsMap = await getBookingStatsByEvents(events.map((e) => e._id));

    const eventsData = events.map((event) => {
      const stats = statsMap.get(event._id.toString()) || { bookingCount: 0, attendeeCount: 0, totalSales: 0 };
      return {
        eventId: event.eventId,
        eventName: event.eventName,
        eventType: event.eventType,
        eventSports: event.eventSports || [],
        eventDateTime: event.eventDateTime,
        eventStatus: event.eventStatus,
        isFree: !event.eventPricePerGuest || event.eventPricePerGuest === 0,
        eventPricePerGuest: event.eventPricePerGuest || 0,
        bookingCount: stats.bookingCount,
        attendeeCount: stats.attendeeCount,
        totalSales: stats.totalSales,
        organiser: event.organiser
          ? {
              userId: event.organiser.userId,
              mongoId: event.organiser._id.toString(),
              fullName: event.organiser.fullName,
              email: event.organiser.email,
              communityName: event.organiser.communityName,
              profilePic: event.organiser.profilePic,
            }
          : null,
      };
    });

    res.status(200).json({
      success: true,
      data: {
        events: eventsData,
        pagination: createPaginationResponse(totalCount, page, perPage),
        filter: { type: typeFilter, search: search || null },
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { listAllEvents };
