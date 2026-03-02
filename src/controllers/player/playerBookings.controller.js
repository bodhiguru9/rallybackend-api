const EventJoin = require('../../models/EventJoin');
const User = require('../../models/User');
const Booking = require('../../models/Booking');
const Payment = require('../../models/Payment');
const { formatEventResponse, calculateEventStatus } = require('../../utils/eventFields');
const { getPaginationParams, createPaginationResponse } = require('../../utils/pagination');

/**
 * @desc    Get player bookings (joined events) with upcoming/past filter
 * @route   GET /api/player/bookings?status=upcoming|past|all&page=1
 * @access  Private (Player)
 */
const getPlayerBookings = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const { isSuperAdmin } = require('../../middleware/auth');
    if (req.user.userType !== 'player' && !isSuperAdmin(req)) {
      return res.status(403).json({
        success: false,
        error: 'This endpoint is only available for players',
      });
    }

    const status = (req.query.status || 'all').toLowerCase();
    if (!['all', 'upcoming', 'past'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Allowed: all, upcoming, past',
      });
    }

    const { page, perPage, skip } = getPaginationParams(req.query.page, 20);

    // Fetch all joined events for this player (cap high, then paginate after filtering/sorting)
    const joinedEvents = await EventJoin.getUserJoinedEvents(userId, 5000, 0);

    // Fetch all bookings for this user to get bookingIds
    const allUserBookings = await Booking.findByUser(userId, null, 10000, 0);
    
    // Create a map of eventId -> booking for quick lookup
    const bookingMap = new Map();
    allUserBookings.forEach((booking) => {
      const eventIdStr = booking.eventId.toString();
      // Keep the most recent booking if there are multiple (shouldn't happen, but just in case)
      if (!bookingMap.has(eventIdStr) || booking.createdAt > bookingMap.get(eventIdStr).createdAt) {
        bookingMap.set(eventIdStr, booking);
      }
    });

    const now = new Date();
    
    // Get creator details for all events and include bookingId
    const withMeta = await Promise.all(
      joinedEvents.map(async (event) => {
        const eventDateTime = event.eventDateTime || event.gameStartDate || null;
        
        // Calculate event status properly (past, ongoing, or upcoming)
        const computedStatus = eventDateTime ? calculateEventStatus(eventDateTime) : 'upcoming';
        
        const isPast = computedStatus === 'past';
        const isOngoing = computedStatus === 'ongoing';
        const isUpcoming = computedStatus === 'upcoming';

        // Get creator details
        let creatorId = null;
        let creatorName = null;
        if (event.creatorId) {
          const creator = await User.findById(event.creatorId);
          if (creator) {
            creatorId = creator.userId;
            creatorName = creator.fullName;
          }
        }

        // Get bookingId if a booking exists for this event
        const eventIdStr = event._id.toString();
        const relatedBooking = bookingMap.get(eventIdStr);
        const bookingId = relatedBooking ? relatedBooking.bookingId : null;
        
        // Get payment details if booking exists
        let paymentStatus = 'not_required'; // Default for free events or events without payment
        let paymentDetails = null;
        
        if (relatedBooking) {
          // Check if event is free (price is 0)
          const eventPrice = event.eventPricePerGuest || event.gameJoinPrice || 0;
          
          if (eventPrice > 0 && relatedBooking.paymentId) {
            // Fetch payment details
            const payment = await Payment.findById(relatedBooking.paymentId);
            
            if (payment) {
              // Map payment status to user-friendly values
              const paymentStatusMap = {
                'pending': 'pending',
                'success': 'done',
                'failed': 'cancelled',
                'refunded': 'cancelled'
              };
              
              paymentStatus = paymentStatusMap[payment.status] || payment.status;
              
              paymentDetails = {
                paymentId: payment.paymentId,
                amount: payment.amount,
                discountAmount: payment.discountAmount || 0,
                finalAmount: payment.finalAmount,
                promoCode: payment.promoCode || null,
                status: payment.status, // Original status from payment
                paymentMethod: payment.paymentMethod || 'stripe',
                createdAt: payment.createdAt,
                updatedAt: payment.updatedAt,
              };
            } else {
              // Payment ID exists but payment not found - might be pending
              paymentStatus = 'pending';
            }
          } else if (eventPrice === 0) {
            // Free event - payment not required, but user has joined
            paymentStatus = 'done';
          } else if (relatedBooking.status === 'booked') {
            // Booking is confirmed but no payment record - likely free event or payment completed
            paymentStatus = 'done';
          } else if (relatedBooking.status === 'pending') {
            // Booking is pending - payment might be pending
            paymentStatus = 'pending';
          } else if (relatedBooking.status === 'cancelled' || relatedBooking.status === 'failed') {
            // Booking is cancelled or failed
            paymentStatus = 'cancelled';
          }
        } else {
          // No booking found but user has joined - might be a free event or direct join
          const eventPrice = event.eventPricePerGuest || event.gameJoinPrice || 0;
          if (eventPrice === 0) {
            paymentStatus = 'done'; // Free event, no payment needed
          }
        }

        // Format event response which includes eventStatus
        const formattedEvent = formatEventResponse(event);
        
        // Ensure eventStatus is set correctly
        formattedEvent.eventStatus = computedStatus;

        return {
          ...formattedEvent,
          creator: {
            userId: creatorId,
            fullName: creatorName,
          },
          booking: {
            bookingId: bookingId,
            joinedAt: event.joinedAt || null,
            bookingStatus: computedStatus, // past/ongoing/upcoming (for backward compatibility)
            bookingStatusValue: relatedBooking ? relatedBooking.status : null, // pending/booked/cancelled/failed
            // Convenience boolean flags
            isPast,
            isOngoing,
            isUpcoming,
          },
          payment: {
            paymentStatus: paymentStatus, // pending/done/cancelled/not_required
            ...(paymentDetails || {}), // Include full payment details if available
          },
          isJoined: true,
          isPending: false,
          isLeave: false,
        };
      })
    );

    // Filter events based on status
    const filtered = withMeta.filter((e) => {
      if (status === 'past') return e.booking.isPast;
      if (status === 'upcoming') return e.booking.isUpcoming;
      // status === 'all' - return all events (past, ongoing, upcoming)
      return true;
    });

    // Sort: upcoming (soonest first), ongoing (soonest first), past (most recent first)
    filtered.sort((a, b) => {
      const dateA = new Date(a.eventDateTime || 0);
      const dateB = new Date(b.eventDateTime || 0);

      if (status === 'past') {
        // Past events: most recent first
        return dateB - dateA;
      }
      if (status === 'upcoming') {
        // Upcoming events: soonest first
        return dateA - dateB;
      }

      // status === 'all': upcoming first, then ongoing, then past (most recent first)
      const aStatus = a.eventStatus;
      const bStatus = b.eventStatus;
      
      // Priority: upcoming > ongoing > past
      const statusPriority = { 'upcoming': 1, 'ongoing': 2, 'past': 3 };
      const aPriority = statusPriority[aStatus] || 3;
      const bPriority = statusPriority[bStatus] || 3;
      
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      
      // Same status: sort by date
      if (aStatus === 'past') {
        return dateB - dateA; // Most recent first
      } else {
        return dateA - dateB; // Soonest first
      }
    });

    const totalCount = filtered.length;
    const pagination = createPaginationResponse(totalCount, page, perPage);
    const paginated = filtered.slice(skip, skip + perPage);

    // Summary counts
    const pastCount = withMeta.filter((e) => e.booking.isPast).length;
    const ongoingCount = withMeta.filter((e) => e.booking.isOngoing).length;
    const upcomingCount = withMeta.filter((e) => e.booking.isUpcoming).length;

    return res.status(200).json({
      success: true,
      message: 'Player bookings retrieved successfully',
      data: {
        status,
        summary: {
          totalBookings: withMeta.length,
          upcomingBookings: upcomingCount,
          ongoingBookings: ongoingCount,
          pastBookings: pastCount,
          now: now.toISOString(),
        },
        bookings: paginated,
        pagination,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPlayerBookings,
};

