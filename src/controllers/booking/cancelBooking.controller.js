const stripe = require('stripe');
const Booking = require('../../models/Booking');
const Payment = require('../../models/Payment');
const EventJoin = require('../../models/EventJoin');
const Notification = require('../../models/Notification');
const { findEventById } = require('../../utils/eventHelper');

// Initialize Stripe lazily
let stripeInstance = null;

const getStripeInstance = () => {
  if (!stripeInstance) {
    const secretKey = process.env.STRIPE_SECRET_KEY;

    if (!secretKey) {
      throw new Error('Stripe credentials not configured. Please set STRIPE_SECRET_KEY in environment variables.');
    }

    stripeInstance = stripe(secretKey);
  }
  return stripeInstance;
};

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

const cancelBooking = async (req, res, next) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user.id;

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        error: 'Booking ID is required',
      });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found',
      });
    }

    if (booking.userId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to cancel this booking',
      });
    }

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

    let payment = null;
    let refundProcessed = false;
    let refundEligible = false;
    let refundReason = 'No refund applicable';
    let refundData = null;

    if (booking.status === 'booked') {
      const event = await findEventById(booking.eventId);

      if (!event) {
        return res.status(404).json({
          success: false,
          error: 'Event not found',
        });
      }

      const eventDateTime = event.eventDateTime || event.gameStartDate;
      if (eventDateTime) {
        const eventStartTime = new Date(eventDateTime);
        const now = new Date();

        if (eventStartTime <= now) {
          return res.status(400).json({
            success: false,
            error: 'Cannot cancel booking. Event has already started.',
            eventStartTime: eventStartTime.toISOString(),
            currentTime: now.toISOString(),
          });
        }
      }

      if (booking.paymentId) {
        payment = await Payment.findById(booking.paymentId);
      }

      if (!payment && booking.paymentIntentId) {
        payment = await Payment.findByStripePaymentIntentId(booking.paymentIntentId);
      }

      if (payment) {
        if (payment.status === 'refunded') {
          refundReason = 'Payment was already refunded earlier';
          refundEligible = true;
        } else if (payment.status === 'success') {
          // Check refund policy and window
          const occurrenceStart = booking.occurrenceStart ? new Date(booking.occurrenceStart) : null;
          const policy = event.policyJoind || 'before-event';
          
          if (policy === 'no-refund') {
            refundEligible = false;
            refundReason = 'Event has a no-refund policy';
          } else if (policy === 'before-event' && occurrenceStart) {
            const timeToEvent = occurrenceStart.getTime() - Date.now();
            refundEligible = timeToEvent >= TWENTY_FOUR_HOURS_MS;
            refundReason = refundEligible 
              ? 'Cancelled more than 24 hours before event' 
              : 'Cancelled less than 24 hours before event, so no refund applicable';
          } else {
            // Default to no refund if policy unknown or date missing
            refundEligible = false;
            refundReason = 'No refund applicable for this event or missing occurrence data';
          }

          if (refundEligible) {
            if (!payment.stripePaymentIntentId) {
              refundReason = 'Refund eligible, but Stripe payment intent is missing';
              await Payment.markRefundFailed(
                payment.paymentId || payment._id,
                'Refund eligible, but Stripe payment intent is missing'
              );
            } else {
              try {
                const stripeClient = getStripeInstance();

                const refund = await stripeClient.refunds.create({
                  payment_intent: payment.stripePaymentIntentId,
                });

                await Payment.markRefunded(payment.paymentId || payment._id, {
                  refundId: refund.id,
                  refundStatus: refund.status || 'succeeded',
                  refundAmount: payment.finalAmount || payment.amount || 0,
                  refundedAt: new Date(),
                  refundReason: refundReason,
                });

                refundProcessed = true;
                refundReason = 'Full refund processed successfully';

                // Send in-app notification to player
                try {
                  await Notification.create(
                    userId,
                    'refund_initiated',
                    'Refund Initiated',
                    `Your refund for ${event.eventName || 'the event'} has been initiated and should reflect in your account soon.`,
                    {
                      eventId: booking.eventId,
                      bookingId: booking._id || bookingId,
                      refundAmount: payment.finalAmount || payment.amount || 0,
                      eventName: event.eventName
                    }
                  );
                } catch (notificationError) {
                  console.error('Failed to send refund notification:', notificationError.message);
                }

                refundData = {
                  refundId: refund.id,
                  refundStatus: refund.status || 'succeeded',
                  refundAmount: payment.finalAmount || payment.amount || 0,
                  refundedAt: new Date(),
                };
              } catch (refundError) {
                await Payment.markRefundFailed(
                  payment.paymentId || payment._id,
                  refundError.message || 'Refund failed at Stripe'
                );

                refundProcessed = false;
                refundReason = refundError.message || 'Refund failed at Stripe';
                refundData = {
                  refundStatus: 'failed',
                };
              }
            }
          } else {
            // Not eligible - already set refundReason above
            await Payment.markRefundNotEligible(
              payment.paymentId || payment._id,
              refundReason
            );
          }
        } else {
          refundReason = `No refund processed because payment status is '${payment.status}'`;
        }
      } else {
        refundReason = 'No linked payment record found';
      }

      try {
        await EventJoin.leave(userId, booking.eventId, booking.occurrenceStart);
      } catch (leaveError) {
        console.log('User not found in EventJoin (may have been removed already):', leaveError.message);
      }

      // Final Notifications
      try {
        const playerName = req.user.fullName || 'A player';
        const eventTitle = event.eventName || 'the event';

        // 1. Notify Organiser (Case 3)
        await Notification.create(
          event.creatorId,
          'event_booking_cancelled',
          'Booking Cancelled',
          `${playerName} cancelled their booking for "${eventTitle}"`,
          {
            eventId: event._id.toString(),
            bookingId: booking._id || bookingId,
            playerName,
            eventName: event.eventName || event.gameTitle || 'Event',
            occurrenceStart: booking.occurrenceStart,
          }
        );

        // 2. Notify Player (Case 4) - only if NOT already getting refund_initiated
        if (!refundProcessed) {
          await Notification.create(
            userId,
            'booking_cancelled',
            'Booking Cancelled',
            `Your booking for "${eventTitle}" has been cancelled.`,
            {
              eventId: event._id.toString(),
              bookingId: booking._id || bookingId,
              eventName: eventTitle,
              occurrenceStart: booking.occurrenceStart,
            }
          );
        }
      } catch (notifError) {
        console.error('Error sending final cancellation notifications:', notifError.message);
      }
    }

    await Booking.updateStatus(bookingId, 'cancelled', {
      cancelledAt: new Date(),
    });

    const updatedBooking = await Booking.findById(bookingId);

    return res.status(200).json({
      success: true,
      message: refundProcessed
        ? 'Booking cancelled and refund processed successfully'
        : 'Booking cancelled successfully',
      data: {
        booking: {
          bookingId: updatedBooking.bookingId,
          status: updatedBooking.status,
          cancelledAt: updatedBooking.cancelledAt || updatedBooking.updatedAt,
          previousStatus: booking.status,
        },
        refund: {
          eligible: refundEligible,
          processed: refundProcessed,
          message: refundReason,
          paymentId: payment ? payment.paymentId : null,
          paymentStatusBeforeCancel: payment ? payment.status : null,
          details: refundData,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = cancelBooking;