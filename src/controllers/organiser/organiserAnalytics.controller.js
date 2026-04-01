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

    // Get Organiser's MongoDB ObjectId for querying events
    const organizerUser = await User.findByUserId(organizerUserId);
    if (!organizerUser) {
      return res.status(404).json({
        success: false,
        error: 'Organiser not found',
      });
    }
    const organizerMongoId = organizerUser._id;

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

    // Get all events created by Organiser
    const allEvents = await eventsCollection.find(eventQuery).toArray();

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

    // Get all successful payments for Organiser's events
    const paymentQuery = {
      eventId: { $in: eventObjectIds },
      status: 'success',
      ...revenueDateFilter,
    };

    const payments = await paymentsCollection.find(paymentQuery).toArray();

    // Get all booked bookings for Organiser's events
    const bookings = await bookingsCollection.find({
      eventId: { $in: eventObjectIds },
      status: 'booked',
    }).toArray();

    const totalBookedRevenue = bookings.reduce((sum, booking) => sum + (booking.finalAmount || 0), 0);
    const bookingsByEvent = new Map();
    bookings.forEach((booking) => {
      const eventId = booking.eventId.toString();
      if (!bookingsByEvent.has(eventId)) {
        bookingsByEvent.set(eventId, { count: 0, revenue: 0 });
      }
      const entry = bookingsByEvent.get(eventId);
      entry.count += 1;
      entry.revenue += booking.finalAmount || 0;
    });

    // Calculate total revenue
    const totalRevenue = payments.reduce((sum, payment) => sum + (payment.finalAmount || 0), 0);

    // Categorize events by status
    const upcoming = [];
    const ongoing = [];
    const past = [];

    for (const event of allEvents) {
      // Use centralized formatEventResponse function
      const { formatEventResponse } = require('../../utils/eventFields');
      const eventData = {
        ...formatEventResponse(event),
        mongoId: event._id.toString(), // MongoDB ObjectId for reference
      };

      // Calculate revenue for this event
      const eventPayments = payments.filter(
        p => p.eventId.toString() === event._id.toString()
      );
      eventData.revenue = eventPayments.reduce((sum, p) => sum + (p.finalAmount || 0), 0);
      eventData.totalTransactions = eventPayments.length;
      const bookingStats = bookingsByEvent.get(event._id.toString()) || { count: 0, revenue: 0 };
      eventData.bookedCount = bookingStats.count;
      eventData.bookedRevenue = bookingStats.revenue;

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
      const event = allEvents.find(e => e._id.toString() === payment.eventId.toString());
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

    const bookedEvents = await Promise.all(
      allEvents
        .filter((event) => bookingsByEvent.has(event._id.toString()))
        .map(async (event) => {
          const bookingStats = bookingsByEvent.get(event._id.toString());
          const participantsCount = await EventJoin.getParticipantCount(event._id);
          const participants = await EventJoin.getEventParticipants(event._id, null, 10, 0);

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
            participants,
            participantsCount,
            bookedCount: bookingStats.count,
            bookedRevenue: bookingStats.revenue,
          };
        })
    );

    // Calculate statistics
    const stats = {
      totalEvents: allEvents.length,
      upcomingEvents: upcoming.length,
      ongoingEvents: ongoing.length,
      pastEvents: past.length,
      totalRevenue: totalRevenue,
      totalTransactions: payments.length,
      totalBookedRevenue: totalBookedRevenue,
      totalBookings: bookings.length,
      averageRevenuePerEvent: allEvents.length > 0 ? totalRevenue / allEvents.length : 0,
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
        const eventPayments = payments.filter(
          p => p.eventId.toString() === event._id.toString()
        );
        const eventRevenue = eventPayments.reduce((sum, p) => sum + (p.finalAmount || 0), 0);
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
          total: totalRevenue,
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

