const Booking = require('../../models/Booking');
const Event = require('../../models/Event');
const { getPaginationParams, createPaginationResponse } = require('../../utils/pagination');

/**
 * @desc    Get all bookings (all statuses)
 * @route   GET /api/bookings?status=pending|booked|cancelled&page=1&limit=20
 * @access  Private
 */
const getAllBookings = async (req, res, next) => {
  try {
    const userId = req.user.id; // MongoDB ObjectId
    const { status } = req.query;
    const { page, perPage, skip } = getPaginationParams(req.query.page, req.query.limit || 20);

    // Get bookings for user
    const bookings = await Booking.findByUser(userId, status || null, perPage, skip);

    // Get event details for each booking
    const bookingsWithDetails = await Promise.all(
      bookings.map(async (booking) => {
        const event = await Event.findById(booking.eventId);
        return {
          bookingId: booking.bookingId,
          event: event ? {
            eventId: event.eventId,
            eventTitle: event.gameTitle,
            eventName: event.eventName,
            eventDateTime: event.eventDateTime,
            eventLocation: event.eventLocation,
            eventImages: event.eventImages || event.gameImages || [],
          } : null,
          status: booking.status,
          amount: booking.amount,
          discountAmount: booking.discountAmount,
          finalAmount: booking.finalAmount,
          promoCode: booking.promoCode,
          bookedAt: booking.bookedAt,
          createdAt: booking.createdAt,
          updatedAt: booking.updatedAt,
        };
      })
    );

    // Get total count for pagination
    const allBookings = await Booking.findByUser(userId, status || null, 10000, 0);
    const total = allBookings.length;

    res.status(200).json({
      success: true,
      data: {
        bookings: bookingsWithDetails,
        pagination: createPaginationResponse(total, page, perPage),
        filters: {
          status: status || 'all',
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = getAllBookings;
