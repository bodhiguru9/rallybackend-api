const Booking = require('../../models/Booking');
const EventJoin = require('../../models/EventJoin');
const { findEventById } = require('../../utils/eventHelper');

/**
 * @desc    Cancel a booking (pending or booked) before event starts
 * @route   POST /api/bookings/:bookingId/cancel
 * @access  Private
 * 
 * Allows cancellation of:
 * - Pending bookings (anytime)
 * - Booked bookings (only before event starts)
 * 
 * When a booked booking is cancelled:
 * - User is removed from EventJoin
 * - Booking status is updated to 'cancelled'
 */
const cancelBooking = async (req, res, next) => {
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
        error: 'Not authorized to cancel this booking',
      });
    }

    // Check booking status
    if (booking.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        error: 'Booking is already cancelled',
      });
    }

    if (booking.status === 'failed') {
      return res.status(400).json({
        success: false,
        error: 'Cannot cancel a failed booking',
      });
    }

    // For booked bookings, check if event has started
    if (booking.status === 'booked') {
      // Get event details to check start time
      const event = await findEventById(booking.eventId);
      if (!event) {
        return res.status(404).json({
          success: false,
          error: 'Event not found',
        });
      }

      // Get event start time
      const eventDateTime = event.eventDateTime || event.gameStartDate;
      if (eventDateTime) {
        const eventStartTime = new Date(eventDateTime);
        const now = new Date();

        // Check if event has already started
        if (eventStartTime <= now) {
          return res.status(400).json({
            success: false,
            error: 'Cannot cancel booking. Event has already started.',
            eventStartTime: eventStartTime.toISOString(),
            currentTime: now.toISOString(),
          });
        }
      }

      // Remove user from EventJoin if they are joined
      try {
        await EventJoin.leave(userId, booking.eventId);
      } catch (leaveError) {
        // User might not be in EventJoin, that's okay
        // Log but don't fail the cancellation
        console.log('User not found in EventJoin (may have been removed already):', leaveError.message);
      }
    }

    // Update booking status to cancelled
    await Booking.updateStatus(bookingId, 'cancelled');

    // Get updated booking
    const updatedBooking = await Booking.findById(bookingId);

    res.status(200).json({
      success: true,
      message: 'Booking cancelled successfully',
      data: {
        booking: {
          bookingId: updatedBooking.bookingId,
          status: updatedBooking.status,
          cancelledAt: updatedBooking.updatedAt,
          previousStatus: booking.status,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = cancelBooking;
