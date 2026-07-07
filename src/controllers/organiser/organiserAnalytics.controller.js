const { getDB } = require('../../config/database');
const { ObjectId } = require('mongodb');
const Event = require('../../models/Event');
const EventJoin = require('../../models/EventJoin');
const Payment = require('../../models/Payment');
const User = require('../../models/User');

/**
 * @desc    Get Organiser analytics (revenue, events, transactions)
 * @route   GET /api/organizers/analytics
 * @access  Private (Organiser only)
 * 
 * Query Parameters:
 * - organizerId: Optional - if not provided, uses authenticated user
 * - sport: Filter by sport/category (e.g., "cricket", "football")
 * - startDate: Filter events from this date (YYYY-MM-DD)
 * - endDate: Filter events to this date (YYYY-MM-DD)
 * - revenuePeriod: Filter revenue by period - "today", "lastWeek", "thisMonth", "6months", "lifetime" (default: "lifetime")
 */
const getOrganiserAnalytics = async (req, res, next) => {
  try {
    const currentUserSeqId = req.user.userId; // Sequential userId from authenticated user
    const { organizerId: queryOrganizerId, sport, startDate, endDate, revenuePeriod = 'lifetime' } = req.query;

    // Verify user is an Organiser
    if (req.user.userType !== 'organiser') {
      return res.status(403).json({
        success: false,
        error: 'Only organisers can view analytics',
      });
    }

    // Determine which Organiser ID to use
    let targetOrganizerId = queryOrganizerId || currentUserSeqId;
    let organizerUserId = currentUserSeqId; // Default to authenticated user

    if (queryOrganizerId) {
      // If organizerId is provided, verify it exists and user has permission
      let organizer;
      
      // Try to find by sequential userId first
      const userBySeqId = await User.findByUserId(queryOrganizerId);
      if (userBySeqId) {
        organizer = userBySeqId;
      } else {
        // Try as ObjectId
        organizer = await User.findById(queryOrganizerId);
      }

      if (!organizer) {
        return res.status(404).json({
          success: false,
          error: 'Organiser not found',
        });
      }

      // Verify Organiser type
      if (organizer.userType !== 'organiser') {
        return res.status(400).json({
          success: false,
          error: 'User is not an Organiser',
        });
      }

      organizerUserId = organizer.userId; // Use sequential userId

      // Security: Users can only view their own analytics
      if (organizerUserId !== currentUserSeqId) {
        return res.status(403).json({
          success: false,
          error: 'You can only view your own analytics',
        });
      }
    }

    // Reuse the organizer object already fetched above (was: duplicate User.findByUserId call)
    const organizerUser = queryOrganizerId ? (await User.findByUserId(organizerUserId)) : req.user;
    if (!organizerUser) {
      return res.status(404).json({
        success: false,
        error: 'Organiser not found',
      });
    }
    const organizerMongoId = organizerUser._id || organizerUser.id;
    if (!organizerMongoId) {
      return res.status(404).json({
        success: false,
        error: 'Organiser ID not found in user object',
      });
    }

    const db = getDB();
    const eventsCollection = db.collection('events');
    const paymentsCollection = db.collection('payments');
    const bookingsCollection = db.collection('bookings');

    // Build event query filters
    // Handle both ObjectId and string formats for creatorId (for backward compatibility)
    const creatorIdObj = organizerMongoId instanceof ObjectId 
      ? organizerMongoId 
      : new ObjectId(organizerMongoId);
    const creatorIdString = creatorIdObj.toString();
    
    // Build base query - try both ObjectId and string formats
    const baseQuery = {
      $or: [
        { creatorId: creatorIdObj },
        { creatorId: creatorIdString }
      ]
    };
    
    const eventQuery = { ...baseQuery };

    // Filter by sport/category
    if (sport) {
      eventQuery.$and = [
        baseQuery,
        { eventSports: { $regex: sport, $options: 'i' } }
      ];
    }

    // Filter by date range
    if (startDate || endDate) {
      const dateFilter = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        dateFilter.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.$lte = end;
      }
      
      if (eventQuery.$and) {
        eventQuery.$and.push({ eventDateTime: dateFilter });
      } else {
        eventQuery.$and = [
          baseQuery,
          { eventDateTime: dateFilter }
        ];
      }
    }

    // Get all events created by Organiser (excluding cancelled events from hosted counts & revenue)
    const allEventsRaw = await eventsCollection.find(eventQuery).toArray();
    const allEvents = allEventsRaw.filter(e => e.eventStatus !== 'cancelled');

    // Get all event MongoDB ObjectIds
    const eventObjectIds = allEvents.map(event => event._id);

    // Calculate revenue period date filter
    let revenueDateFilter = {};
    const now = new Date();
    
    switch (revenuePeriod) {
      case 'today':
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);
        revenueDateFilter = { createdAt: { $gte: todayStart } };
        break;
      case 'lastWeek':
        const lastWeekStart = new Date(now);
        lastWeekStart.setDate(lastWeekStart.getDate() - 7);
        lastWeekStart.setHours(0, 0, 0, 0);
        revenueDateFilter = { createdAt: { $gte: lastWeekStart } };
        break;
      case 'thisMonth':
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        monthStart.setHours(0, 0, 0, 0);
        revenueDateFilter = { createdAt: { $gte: monthStart } };
        break;
      case '6months':
        const sixMonthsAgo = new Date(now);
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        sixMonthsAgo.setHours(0, 0, 0, 0);
        revenueDateFilter = { createdAt: { $gte: sixMonthsAgo } };
        break;
      case 'lifetime':
      default:
        // No date filter for lifetime
        revenueDateFilter = {};
        break;
    }

    // Construct robust ID arrays for matching payments & bookings across ObjectId, String, and Sequential IDs
    const eventIdStrings = allEvents.map(e => e._id.toString());
    const eventSeqIds = allEvents.map(e => e.eventId).filter(Boolean);
    const allEventIds = [...eventObjectIds, ...eventIdStrings, ...eventSeqIds];

    const eventLookupMap = new Map();
    for (const e of allEvents) {
      if (e._id) eventLookupMap.set(e._id.toString(), e);
      if (e.eventId) eventLookupMap.set(e.eventId.toString(), e);
    }

    // Get all successful payments for Organiser's events
    const paymentQuery = {
      $or: [
        { eventId: { $in: allEventIds } },
        { parentEventId: { $in: allEventIds } }
      ],
      status: { $in: ['success', 'succeeded', 'paid', 'booked'] },
      ...revenueDateFilter,
    };

    // Fetch payments, bookings, and participant data in parallel
    const { batchParticipantCounts, batchEventParticipants } = require('../../utils/batchEventData');
    const [payments, bookings, allCountMap, allParticipantsMap] = await Promise.all([
      paymentsCollection.find(paymentQuery).toArray(),
      bookingsCollection.find({
        $or: [
          { eventId: { $in: allEventIds } },
          { parentEventId: { $in: allEventIds } }
        ],
        status: 'booked',
        ...revenueDateFilter,
      }).toArray(),
      batchParticipantCounts(eventObjectIds),
      batchEventParticipants(eventObjectIds, 10),
    ]);

    // Pre-build paymentsByEvent Map using eventLookupMap to map back to ObjectId string
    const paymentsByEvent = new Map();
    for (const p of payments) {
      const targetEvent = (p.eventId && eventLookupMap.get(p.eventId.toString())) ||
                          (p.parentEventId && eventLookupMap.get(p.parentEventId.toString()));
      if (!targetEvent) continue;
      const key = targetEvent._id.toString();
      if (!paymentsByEvent.has(key)) paymentsByEvent.set(key, []);
      paymentsByEvent.get(key).push(p);
    }

    const totalBookedRevenue = bookings.reduce((sum, booking) => sum + (booking.finalAmount || booking.amount || 0), 0);
    const bookingsByEvent = new Map();
    bookings.forEach((booking) => {
      const targetEvent = (booking.eventId && eventLookupMap.get(booking.eventId.toString())) ||
                          (booking.parentEventId && eventLookupMap.get(booking.parentEventId.toString()));
      if (!targetEvent) return;
      const key = targetEvent._id.toString();
      if (!bookingsByEvent.has(key)) {
        bookingsByEvent.set(key, { count: 0, revenue: 0 });
      }
      const entry = bookingsByEvent.get(key);
      entry.count += 1;
      entry.revenue += booking.finalAmount || booking.amount || 0;
    });

    // Calculate total revenue
    const totalRevenue = payments.reduce((sum, payment) => sum + (payment.finalAmount || payment.amount || 0), 0);

    // Categorize events by status
    const upcoming = [];
    const ongoing = [];
    const past = [];

    for (const event of allEvents) {
      // Use centralized formatEventResponse function
      const { formatEventResponse } = require('../../utils/eventFields');
      const eventIdStr = event._id.toString();
      const eventData = {
        ...formatEventResponse(event),
        mongoId: eventIdStr, // MongoDB ObjectId for reference
      };

      // Calculate revenue and bookings for this event using pre-built Maps
      const eventPayments = paymentsByEvent.get(eventIdStr) || [];
      const paymentRevenue = eventPayments.reduce((sum, p) => sum + (p.finalAmount || p.amount || 0), 0);
      const bookingStats = bookingsByEvent.get(eventIdStr) || { count: 0, revenue: 0 };
      const countFromJoins = allCountMap.get(eventIdStr) || 0;

      eventData.revenue = Math.max(paymentRevenue, bookingStats.revenue);
      eventData.totalTransactions = eventPayments.length;
      eventData.bookedCount = Math.max(bookingStats.count, countFromJoins, eventPayments.length);
      eventData.bookedRevenue = Math.max(bookingStats.revenue, paymentRevenue);

      // Categorize by status
      const eventStartDate = event.eventDateTime ? new Date(event.eventDateTime) : null;
      const currentStatus = event.eventStatus || 'upcoming';

      if (currentStatus === 'cancelled') {
        // Skip cancelled events in main categories
        continue;
      } else if (currentStatus === 'ongoing') {
        ongoing.push(eventData);
      } else if (currentStatus === 'completed') {
        past.push(eventData);
      } else if (currentStatus === 'upcoming' || currentStatus === 'draft') {
        if (eventStartDate && eventStartDate < now) {
          past.push(eventData);
        } else {
          upcoming.push(eventData);
        }
      } else {
        // Default categorization based on date
        if (eventStartDate) {
          if (eventStartDate > now) {
            upcoming.push(eventData);
          } else {
            past.push(eventData);
          }
        } else {
          upcoming.push(eventData);
        }
      }
    }

    // Sort events (formatEventResponse uses eventDateTime)
    upcoming.sort((a, b) => new Date(a.eventDateTime) - new Date(b.eventDateTime));
    ongoing.sort((a, b) => new Date(a.eventDateTime) - new Date(b.eventDateTime));
    past.sort((a, b) => new Date(b.eventDateTime) - new Date(a.eventDateTime));

    // Get transaction details
    const transactions = payments.map(payment => {
      const event = (payment.eventId && eventLookupMap.get(payment.eventId.toString())) ||
                    (payment.parentEventId && eventLookupMap.get(payment.parentEventId.toString())) || null;
      return {
        paymentId: payment.paymentId,
        eventId: event ? event.eventId : null,
        eventTitle: event ? (event.eventName || null) : null,
        eventName: event ? (event.eventName || null) : null,
        eventCategory: event && Array.isArray(event.eventSports) && event.eventSports.length > 0 ? event.eventSports[0] : null,
        eventType: event ? (event.eventType || null) : null,
        amount: payment.amount || 0,
        discountAmount: payment.discountAmount || 0,
        finalAmount: payment.finalAmount || 0,
        promoCode: payment.promoCode || null,
        status: payment.status,
        createdAt: payment.createdAt,
      };
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Filter booked events list based on joins, bookings, or payments
    const bookedEventsList = allEvents.filter((event) => {
      const eventIdStr = event._id.toString();
      const countFromJoins = allCountMap.get(eventIdStr) || 0;
      const paymentList = paymentsByEvent.get(eventIdStr) || [];
      return countFromJoins > 0 || bookingsByEvent.has(eventIdStr) || paymentList.length > 0;
    });

    const bookedEvents = bookedEventsList.map((event) => {
      const eventIdStr = event._id.toString();
      const bookingStats = bookingsByEvent.get(eventIdStr) || { count: 0, revenue: 0 };
      const paymentList = paymentsByEvent.get(eventIdStr) || [];
      const paymentRevenue = paymentList.reduce((sum, p) => sum + (p.finalAmount || p.amount || 0), 0);
      const countFromJoins = allCountMap.get(eventIdStr) || 0;

      const eventRevenue = Math.max(bookingStats.revenue, paymentRevenue);
      const eventBookedCount = Math.max(bookingStats.count, countFromJoins, paymentList.length);

      return {
        eventId: event.eventId,
        title: event.eventName || null,
        sports: event.eventSports || [],
        dateTime: event.eventDateTime || null,
        address: event.eventLocation || null,
        price: event.eventPricePerGuest !== undefined && event.eventPricePerGuest !== null
          ? event.eventPricePerGuest
          : (event.gameJoinPrice || 0),
        eventImage: (event.eventImages && event.eventImages.length > 0)
          ? event.eventImages[0]
          : (event.gameImages && event.gameImages.length > 0 ? event.gameImages[0] : null),
        participants: allParticipantsMap.get(eventIdStr) || [],
        participantsCount: countFromJoins,
        bookedCount: eventBookedCount,
        bookedRevenue: eventRevenue,
      };
    });

    const totalBookedCountComputed = bookedEvents.reduce((acc, e) => acc + (e.bookedCount || 0), 0);
    const totalBookedRevenueComputed = bookedEvents.reduce((acc, e) => acc + (e.bookedRevenue || 0), 0);

    const nonCancelledEvents = allEvents.filter(e => e.eventStatus !== 'cancelled' && e.eventStatus !== 'draft');
    const avgEventsCount = nonCancelledEvents.length > 0 ? nonCancelledEvents.length : allEvents.length;
    const computedTotalRevenue = Math.max(totalRevenue, totalBookedRevenueComputed);

    // Calculate statistics
    const stats = {
      totalEvents: allEvents.length,
      upcomingEvents: upcoming.length,
      ongoingEvents: ongoing.length,
      pastEvents: past.length,
      totalRevenue: computedTotalRevenue,
      periodRevenue: computedTotalRevenue,
      totalTransactions: payments.length,
      totalBookedRevenue: Math.max(totalBookedRevenue, totalBookedRevenueComputed, computedTotalRevenue),
      totalBookings: Math.max(bookings.length, totalBookedCountComputed),
      averageRevenuePerEvent: avgEventsCount > 0 ? Math.round(computedTotalRevenue / avgEventsCount) : 0,
      revenuePeriod: revenuePeriod,
    };

    // Group revenue by sport if sport filter not applied
    const revenueBySport = {};
    if (!sport) {
      for (const event of allEvents) {
        const category = event.gameCategory || 'Other';
        if (!revenueBySport[category]) {
          revenueBySport[category] = 0;
        }
        const eventPayments = paymentsByEvent.get(event._id.toString()) || [];
        const eventRevenue = eventPayments.reduce((sum, p) => sum + (p.finalAmount || p.amount || 0), 0);
        revenueBySport[category] += eventRevenue;
      }
    }

    res.status(200).json({
      success: true,
      message: 'Analytics retrieved successfully',
      data: {
        organizerId: organizerUserId,
        stats: stats,
        revenue: {
          total: computedTotalRevenue,
          period: revenuePeriod,
          bySport: revenueBySport,
        },
        events: {
          upcoming: upcoming,
          ongoing: ongoing,
          past: past,
          total: allEvents.length,
        },
        transactions: transactions,
        bookings: {
          totalRevenue: totalBookedRevenue,
          totalBookings: bookings.length,
          events: bookedEvents,
        },
        filters: {
          sport: sport || null,
          startDate: startDate || null,
          endDate: endDate || null,
          revenuePeriod: revenuePeriod,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getOrganiserAnalytics,
};

