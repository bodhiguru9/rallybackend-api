const EventJoin = require('../../models/EventJoin');
const Booking = require('../../models/Booking');
const { formatEventResponse, calculateEventStatus } = require('../../utils/eventFields');
const { getPaginationParams, createPaginationResponse } = require('../../utils/pagination');

/**
 * @desc    Get player bookings (joined events) with upcoming/past filter
 * @route   GET /api/player/bookings?status=upcoming|past|all&page=1&include=waitlist
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

    // Opt-in extras. `include=waitlist` adds the player's waitlist entries and
    // private-event join requests to the response. It is opt-in so existing
    // callers (home calendar strip, event-details join check) keep getting a
    // joined-only list and are unaffected by this addition.
    const includeWaitlist = String(req.query.include || '')
      .toLowerCase()
      .split(',')
      .map((part) => part.trim())
      .includes('waitlist');

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
    
    // Waitlist entries (open events that were full) and private-event join
    // requests, each paired with its event document. Empty unless opted in.
    let waitlistEntries = [];
    if (includeWaitlist) {
      const { getDB } = require('../../config/database');
      const { ObjectId } = require('mongodb');
      const db = getDB();
      const userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;

      const [waitlistDocs, requestDocs] = await Promise.all([
        db
          .collection('waitlist')
          .find({ userId: userObjectId, status: { $in: ['pending', 'rejected'] } })
          .toArray(),
        db
          .collection('eventJoinRequests')
          .find({ userId: userObjectId, status: { $in: ['pending', 'rejected'] } })
          .toArray(),
      ]);

      const docs = [
        ...waitlistDocs.map((d) => ({ ...d, waitlistType: 'waitlist' })),
        ...requestDocs.map((d) => ({ ...d, waitlistType: 'pending-request' })),
      ];

      if (docs.length > 0) {
        const waitlistEventDocs = await db
          .collection('events')
          .find({ _id: { $in: docs.map((d) => d.eventId) } })
          .toArray();
        const eventById = new Map(waitlistEventDocs.map((e) => [e._id.toString(), e]));

        waitlistEntries = docs
          .map((doc) => ({ doc, event: eventById.get(doc.eventId.toString()) || null }))
          .filter((entry) => entry.event !== null);
      }
    }

    // Batch-fetch creators + payments in ONE query each (was N findById calls — N+1)
    const { getUsersByIds, getByField } = require('../../utils/batchLoad');
    const _creatorMap = await getUsersByIds([
      ...joinedEvents.map((e) => e.creatorId),
      ...waitlistEntries.map((entry) => entry.event.creatorId),
    ]);
    const _paymentMap = await getByField(
      'payments',
      'paymentId',
      allUserBookings.map((b) => b.paymentId)
    );

    // Get creator details for all events and include bookingId
    const withMeta = await Promise.all(
      joinedEvents.map(async (event) => {
        const eventDateTime = event.eventDateTime || event.gameStartDate || null;
        
        // Calculate event status properly (past, ongoing, or upcoming)
        const computedStatus = eventDateTime ? calculateEventStatus(eventDateTime, event.eventEndDateTime) : 'upcoming';
        
        const isPast = computedStatus === 'past';
        const isOngoing = computedStatus === 'ongoing';
        const isUpcoming = computedStatus === 'upcoming';

        // Get creator details
        let creatorId = null;
        let creatorName = null;
        if (event.creatorId) {
          const creator = _creatorMap.get(String(event.creatorId));
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
            const payment = _paymentMap.get(String(relatedBooking.paymentId));
            
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

        // Get occurrenceStart/End from the joinedOccurrences on the event
        // (getUserJoinedEvents attaches joinedOccurrences to each event)
        const joinedOccurrences = event.joinedOccurrences || [];
        const joinOccurrence = joinedOccurrences.length > 0 ? joinedOccurrences[0] : null;

        const isNonRecurring = !event.eventFrequency || !Array.isArray(event.eventFrequency) || event.eventFrequency.length === 0;
        const finalOccStart = isNonRecurring
          ? (formattedEvent.eventDateTime || joinOccurrence?.occurrenceStart || null)
          : (joinOccurrence?.occurrenceStart || null);
        const finalOccEnd = isNonRecurring
          ? (formattedEvent.eventEndDateTime || joinOccurrence?.occurrenceEnd || null)
          : (joinOccurrence?.occurrenceEnd || null);

        return {
          ...formattedEvent,
          creator: {
            userId: creatorId,
            fullName: creatorName,
          },
          booking: {
            bookingId: bookingId,
            joinedAt: event.joinedAt || joinOccurrence?.joinedAt || null,
            bookingStatus: computedStatus, // past/ongoing/upcoming (for backward compatibility)
            bookingStatusValue: relatedBooking ? relatedBooking.status : null, // pending/booked/cancelled/failed
            // Guest count from the booking record (player + guests)
            guestsCount: relatedBooking ? (relatedBooking.guestsCount || 1) : (joinOccurrence?.guestsCount || 1),
            // Occurrence timing — used by the frontend to match bookings to specific recurring sessions
            occurrenceStart: finalOccStart,
            occurrenceEnd: finalOccEnd,
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

    // Joined lookup sets, so a waitlist row disappears the moment the player
    // actually gets the spot — the joined ("Going") card represents it instead.
    const joinedEventKeys = new Set();
    const joinedOccurrenceKeys = new Set();
    withMeta.forEach((e) => {
      [e.mongoId, e.eventId].filter(Boolean).map(String).forEach((key) => {
        joinedEventKeys.add(key);
        if (e.booking.occurrenceStart) {
          joinedOccurrenceKeys.add(key + '|' + new Date(e.booking.occurrenceStart).toISOString());
        }
      });
    });

    const waitlistMeta = waitlistEntries
      .map(({ doc, event }) => {
        const formattedEvent = formatEventResponse(event);
        const eventKey = String(formattedEvent.mongoId || event._id.toString());

        const isNonRecurring =
          !event.eventFrequency ||
          !Array.isArray(event.eventFrequency) ||
          event.eventFrequency.length === 0;

        const occurrenceStart = isNonRecurring
          ? formattedEvent.eventDateTime || doc.occurrenceStart || null
          : doc.occurrenceStart || formattedEvent.eventDateTime || null;
        const occurrenceEnd = isNonRecurring
          ? formattedEvent.eventEndDateTime || doc.occurrenceEnd || null
          : doc.occurrenceEnd || formattedEvent.eventEndDateTime || null;

        // Drop the waitlist row once the player holds a join for it. A
        // non-recurring event is matched on the event alone; a recurring one is
        // matched per occurrence, so its other sessions stay waitlisted.
        const occurrenceKey = occurrenceStart
          ? eventKey + '|' + new Date(occurrenceStart).toISOString()
          : null;
        const alreadyJoined =
          isNonRecurring || !occurrenceKey
            ? joinedEventKeys.has(eventKey)
            : joinedOccurrenceKeys.has(occurrenceKey);
        if (alreadyJoined) {
          return null;
        }

        const computedStatus = occurrenceStart
          ? calculateEventStatus(occurrenceStart, occurrenceEnd)
          : 'upcoming';
        formattedEvent.eventStatus = computedStatus;

        const creator = _creatorMap.get(String(event.creatorId));

        return {
          ...formattedEvent,
          creator: {
            userId: creator ? creator.userId : null,
            fullName: creator ? creator.fullName : null,
          },
          booking: {
            bookingId: null,
            joinedAt: doc.createdAt || null,
            bookingStatus: computedStatus,
            bookingStatusValue: null,
            guestsCount: doc.guestsCount >= 1 ? doc.guestsCount : 1,
            occurrenceStart: occurrenceStart,
            occurrenceEnd: occurrenceEnd,
            isPast: computedStatus === 'past',
            isOngoing: computedStatus === 'ongoing',
            isUpcoming: computedStatus === 'upcoming',
          },
          // No money changes hands while waiting, so nothing is pending.
          payment: { paymentStatus: 'not_required' },
          isJoined: false,
          isLeave: false,
          // Waitlist markers — read by the calendar and the EventCard badge
          isWaitlisted: true,
          waitlistType: doc.waitlistType,
          waitlistStatus: doc.status,
          waitlistId: doc.waitlistId || doc.joinRequestId || null,
          isRejected: doc.status === 'rejected',
          isPending: doc.waitlistType === 'pending-request' && doc.status === 'pending',
          ...(doc.waitlistType === 'pending-request' ? { approvalStatus: doc.status } : {}),
        };
      })
      .filter(Boolean);

    const allMeta = [...withMeta, ...waitlistMeta];

    // Filter events based on status
    const filtered = allMeta.filter((e) => {
      if (status === 'past') return e.booking.isPast;
      if (status === 'upcoming') return e.booking.isUpcoming || e.booking.isOngoing;
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
    const pastCount = allMeta.filter((e) => e.booking.isPast).length;
    const ongoingCount = allMeta.filter((e) => e.booking.isOngoing).length;
    const upcomingCount = allMeta.filter((e) => e.booking.isUpcoming).length;

    return res.status(200).json({
      success: true,
      message: 'Player bookings retrieved successfully',
      data: {
        status,
        summary: {
          totalBookings: allMeta.length,
          upcomingBookings: upcomingCount,
          ongoingBookings: ongoingCount,
          pastBookings: pastCount,
          joinedBookings: withMeta.length,
          waitlistBookings: waitlistMeta.length,
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

