const Booking = require('../../models/Booking');
const Event = require('../../models/Event');
const { getPaginationParams, createPaginationResponse } = require('../../utils/pagination');

/**
 * @desc    Get pending bookings
 * @route   GET /api/bookings/pending?page=1&limit=20
 * @access  Private
 */
const getPendingBookings = async (req, res, next) => {
  try {
    const userId = req.user.id; // MongoDB ObjectId
    const { page, perPage, skip } = getPaginationParams(req.query.page, req.query.limit || 20);

    // Get pending bookings for user
    const bookings = await Booking.getPendingBookings(userId, perPage, skip);

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
          paymentIntentId: booking.paymentIntentId,
          createdAt: booking.createdAt,
        };
      })
    );

    // Get total count for pagination
    const totalPending = await Booking.getPendingBookings(userId, 10000, 0);
    const total = totalPending.length;

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

module.exports = getPendingBookings;
