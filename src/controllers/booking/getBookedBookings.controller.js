const Booking = require('../../models/Booking');
const Event = require('../../models/Event');
const { getPaginationParams, createPaginationResponse } = require('../../utils/pagination');

/**
 * @desc    Get booked (confirmed) bookings
 * @route   GET /api/bookings/booked?page=1&limit=20
 * @access  Private
 */
const getBookedBookings = async (req, res, next) => {
  try {
    const userId = req.user.id; // MongoDB ObjectId
    const { page, perPage, skip } = getPaginationParams(req.query.page, req.query.limit || 20);

    // Get booked bookings for user
    const bookings = await Booking.getBookedBookings(userId, perPage, skip);

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
        };
      })
    );

    // Get total count for pagination
    const totalBooked = await Booking.getBookedBookings(userId, 10000, 0);
    const total = totalBooked.length;

    res.status(200).json({
      success: true,
      data: {
        bookings: bookingsWithDetails,
        pagination: createPaginationResponse(total, page, perPage),
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = getBookedBookings;
