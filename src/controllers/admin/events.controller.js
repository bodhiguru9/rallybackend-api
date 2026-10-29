const { ObjectId } = require('mongodb');
const Event = require('../../models/Event');
const { getDB } = require('../../config/database');
const { getPaginationParams, createPaginationResponse } = require('../../utils/pagination');
const { getBookingStatsByEvents } = require('../../utils/bookingStats');

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const findEventByIdParam = async (idParam) => {
  let event = await Event.findByEventId(idParam);
  if (!event && ObjectId.isValid(idParam)) {
    event = await Event.findById(idParam);
  }
  return event;
};

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

/**
 * @desc    Full detail for a single event: event info, organiser, revenue
 *          summary, and the booking list (clicking an event in the Events
 *          tab or an organiser's events list opens this)
 * @route   GET /api/admin/events/:eventId?status=all|booked|cancelled|pending|failed&page=&perPage=
 * @access  Admin key (adminKeyAuth)
 *
 * :eventId accepts either the sequential id (E428) or the Mongo _id.
 * Revenue/attendee totals (summary.totalSales etc.) only ever count
 * status: 'booked' bookings, same as everywhere else in the admin API —
 * the `status` query param only filters which bookings are listed, not
 * what counts toward revenue.
 */
const getEventDetails = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const statusFilter = (req.query.status || 'all').toLowerCase();
    const validStatuses = ['all', 'booked', 'cancelled', 'pending', 'failed'];
    if (!validStatuses.includes(statusFilter)) {
      return res.status(400).json({ success: false, error: `status must be one of: ${validStatuses.join(', ')}` });
    }

    const event = await findEventByIdParam(eventId);
    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    const db = getDB();
    const usersCollection = db.collection('users');
    const bookingsCollection = db.collection('bookings');

    let creatorObjectId = null;
    try {
      creatorObjectId = event.creatorId instanceof ObjectId ? event.creatorId : new ObjectId(event.creatorId);
    } catch (error) {
      creatorObjectId = null;
    }
    const organiser = creatorObjectId ? await usersCollection.findOne({ _id: creatorObjectId }) : null;

    const eventIdQuery = { $in: [event._id, event._id.toString()] };

    // Revenue/attendee summary always reflects booked bookings only.
    const [summaryStats] = await bookingsCollection
      .aggregate([
        { $match: { eventId: eventIdQuery, status: 'booked' } },
        {
          $group: {
            _id: null,
            bookingCount: { $sum: 1 },
            attendeeCount: { $sum: { $ifNull: ['$guestsCount', 1] } },
            totalSales: { $sum: { $ifNull: ['$finalAmount', { $ifNull: ['$amount', 0] }] } },
          },
        },
      ])
      .toArray();

    const statusCounts = await bookingsCollection
      .aggregate([{ $match: { eventId: eventIdQuery } }, { $group: { _id: '$status', count: { $sum: 1 } } }])
      .toArray();
    const statusBreakdown = { booked: 0, cancelled: 0, pending: 0, failed: 0 };
    statusCounts.forEach((entry) => {
      if (entry._id in statusBreakdown) statusBreakdown[entry._id] = entry.count;
    });

    const { page, perPage, skip } = getPaginationParams(req.query.page, parseInt(req.query.perPage, 10) || 20);

    const bookingMatch = { eventId: eventIdQuery };
    if (statusFilter !== 'all') bookingMatch.status = statusFilter;

    const bookingPipeline = [
      { $match: bookingMatch },
      {
        $lookup: {
          from: 'users',
          let: { uid: '$userId' },
          pipeline: [{ $match: { $expr: { $eq: [{ $toString: '$_id' }, { $toString: '$$uid' }] } } }],
          as: 'booker',
        },
      },
      { $unwind: { path: '$booker', preserveNullAndEmptyArrays: true } },
      {
        // booking.paymentId is usually the sequential string (PAY102), but
        // may be a Mongo _id on older records — match either.
        $lookup: {
          from: 'payments',
          let: { pid: '$paymentId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $eq: ['$paymentId', '$$pid'] },
                    { $eq: [{ $toString: '$_id' }, { $toString: '$$pid' }] },
                  ],
                },
              },
            },
          ],
          as: 'payment',
        },
      },
      { $unwind: { path: '$payment', preserveNullAndEmptyArrays: true } },
      {
        $facet: {
          data: [{ $sort: { bookedAt: -1, createdAt: -1 } }, { $skip: skip }, { $limit: perPage }],
          totalCount: [{ $count: 'count' }],
        },
      },
    ];

    const [bookingResult] = await bookingsCollection.aggregate(bookingPipeline).toArray();
    const bookings = bookingResult?.data || [];
    const bookingsTotalCount = bookingResult?.totalCount?.[0]?.count || 0;

    const bookingsData = bookings.map((booking) => ({
      bookingId: booking.bookingId,
      status: booking.status,
      guestsCount: booking.guestsCount || 1,
      amount: booking.amount,
      discountAmount: booking.discountAmount || 0,
      finalAmount: booking.finalAmount,
      promoCode: booking.promoCode || null,
      bookedAt: booking.bookedAt,
      cancelledAt: booking.cancelledAt || null,
      createdAt: booking.createdAt,
      booker: booking.booker
        ? {
            userId: booking.booker.userId,
            mongoId: booking.booker._id.toString(),
            fullName: booking.booker.fullName,
            email: booking.booker.email,
            mobileNumber: booking.booker.mobileNumber,
            profilePic: booking.booker.profilePic,
          }
        : null,
      payment: booking.payment
        ? {
            paymentId: booking.payment.paymentId,
            status: booking.payment.status,
            stripePaymentId: booking.payment.stripePaymentId || null,
          }
        : null,
    }));

    res.status(200).json({
      success: true,
      data: {
        event: {
          eventId: event.eventId,
          mongoId: event._id.toString(),
          eventName: event.eventName,
          eventType: event.eventType,
          eventSports: event.eventSports || [],
          eventDescription: event.eventDescription,
          eventDateTime: event.eventDateTime,
          eventEndDateTime: event.eventEndDateTime,
          eventLocation: event.eventLocation,
          eventGender: event.eventGender,
          eventSportsLevel: event.eventSportsLevel,
          eventMinAge: event.eventMinAge,
          eventMaxAge: event.eventMaxAge,
          eventMaxGuest: event.eventMaxGuest,
          eventPricePerGuest: event.eventPricePerGuest || 0,
          isFree: !event.eventPricePerGuest || event.eventPricePerGuest === 0,
          IsPrivateEvent: !!event.IsPrivateEvent,
          eventApprovalRequired: !!event.eventApprovalRequired,
          eventStatus: event.eventStatus,
          eventImages: event.eventImages || event.gameImages || [],
          createdAt: event.createdAt,
          updatedAt: event.updatedAt,
        },
        organiser: organiser
          ? {
              userId: organiser.userId,
              mongoId: organiser._id.toString(),
              fullName: organiser.fullName,
              email: organiser.email,
              mobileNumber: organiser.mobileNumber,
              communityName: organiser.communityName,
              profilePic: organiser.profilePic,
            }
          : null,
        summary: {
          bookingCount: summaryStats?.bookingCount || 0,
          attendeeCount: summaryStats?.attendeeCount || 0,
          totalSales: summaryStats?.totalSales || 0,
          statusBreakdown,
        },
        bookings: bookingsData,
        pagination: createPaginationResponse(bookingsTotalCount, page, perPage),
        filter: { status: statusFilter },
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { listAllEvents, getEventDetails };
