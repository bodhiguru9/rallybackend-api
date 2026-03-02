const Booking = require('../../models/Booking');
const Event = require('../../models/Event');
const Payment = require('../../models/Payment');

/**
 * @desc    Get booking details by booking ID
 * @route   GET /api/bookings/:bookingId
 * @access  Private
 */
const getBookingDetails = async (req, res, next) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user.id; // MongoDB ObjectId

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        error: 'Booking ID is required',
      });
    }

    // Find booking
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found',
      });
    }

    // Check if user owns this booking
    if (booking.userId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to view this booking',
      });
    }

    // Get event details
    const event = await Event.findById(booking.eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found',
      });
    }

    // Get payment details
    const payment = booking.paymentId ? await Payment.findById(booking.paymentId) : null;

    res.status(200).json({
      success: true,
      data: {
        booking: {
          bookingId: booking.bookingId,
          event: {
            eventId: event.eventId,
            eventTitle: event.eventName || null,
            eventName: event.eventName || null,
            eventCategory: Array.isArray(event.eventSports) && event.eventSports.length > 0 ? event.eventSports[0] : null,
            eventType: event.eventType || null,
            eventDateTime: event.eventDateTime,
            eventLocation: event.eventLocation,
            eventImages: event.eventImages || event.gameImages || [],
          },
          payment: payment ? {
            paymentId: payment.paymentId,
            stripePaymentIntentId: payment.stripePaymentIntentId,
            stripePaymentId: payment.stripePaymentId,
          } : null,
          status: booking.status,
          amount: booking.amount,
          discountAmount: booking.discountAmount,
          finalAmount: booking.finalAmount,
          promoCode: booking.promoCode,
          bookedAt: booking.bookedAt,
          createdAt: booking.createdAt,
          updatedAt: booking.updatedAt,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = getBookingDetails;
