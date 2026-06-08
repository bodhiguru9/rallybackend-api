const Event = require('../../models/Event');
const EventJoin = require('../../models/EventJoin');
const User = require('../../models/User');
const Notification = require('../../models/Notification');
const Booking = require('../../models/Booking');
const Payment = require('../../models/Payment');
const { findEventById, validateEventId } = require('../../utils/eventHelper');
const { sendPlayerCancelledBookingNotification } = require('../../services/eventNotification.service');

/**
 * @desc    Remove a player from a private event (Organiser only)
 * @route   DELETE /api/private-events/:eventId/players/:playerId
 *         OR POST /api/private-events/:eventId/players/:playerId/remove
 * @access  Private (Creator only)
 * 
 * Removes a player from a private event. Only the event creator can remove players.
 * Sends notification to the removed player.
 */
const removePlayer = async (req, res, next) => {
  try {
    const { eventId, playerId } = req.params;
    const organiserId = req.user.id;

    // Validate eventId format
    const validation = validateEventId(eventId);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: validation.error,
        eventId: eventId,
      });
    }

    // Find event
    const event = await findEventById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found',
        eventId: eventId,
      });
    }

    // Verify event is private
    const isPrivate = event.IsPrivateEvent !== undefined ? event.IsPrivateEvent : (event.visibility === 'private');
    if (!isPrivate) {
      return res.status(400).json({
        success: false,
        error: 'This endpoint is only for private events',
      });
    }

    // Verify organiser is the event creator
    if (event.creatorId.toString() !== organiserId) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized. Only the event creator can remove players.',
      });
    }

    // Find player by sequential userId or MongoDB ObjectId
    let player;
    const { getDB } = require('../../config/database');
    const { ObjectId } = require('mongodb');
    const db = getDB();
    const usersCollection = db.collection('users');

    // Check if playerId is a sequential userId (number)
    if (!isNaN(playerId) && parseInt(playerId).toString() === playerId.toString()) {
      player = await usersCollection.findOne({ userId: parseInt(playerId) });
    } else {
      // Treat as MongoDB ObjectId
      try {
        const playerObjectId = typeof playerId === 'string' ? new ObjectId(playerId) : playerId;
        player = await usersCollection.findOne({ _id: playerObjectId });
      } catch (error) {
        return res.status(400).json({
          success: false,
          error: 'Invalid player ID format',
        });
      }
    }

    if (!player) {
      return res.status(404).json({
        success: false,
        error: 'Player not found',
        playerId: playerId,
      });
    }

    // Verify user is a player
    if (player.userType !== 'player') {
      return res.status(400).json({
        success: false,
        error: 'Can only remove players from events',
      });
    }

    // Check if player has joined the event
    const hasJoined = await EventJoin.hasJoined(player._id, event._id);
    if (!hasJoined) {
      return res.status(400).json({
        success: false,
        error: 'Player has not joined this event',
        playerId: playerId,
      });
    }

    // Remove player from event
    const removed = await EventJoin.removeUser(event._id, player._id);
    if (!removed) {
      return res.status(400).json({
        success: false,
        error: 'Failed to remove player from event',
      });
    }

    // Send notification to removed player
    try {
      const organiser = await User.findById(organiserId);
      const eventName = event.eventName || event.gameTitle || 'Event';
      await Notification.create(
        player._id.toString(),
        'player_removed_from_event',
        'Removed from Event',
        `You have been removed from "${eventName}" by ${organiser?.fullName || 'the organizer'}. If you paid for this event, you will be refunded shortly.`,
        {
          organiserId: organiserId,
          eventId: event._id.toString(),
          eventName: eventName,
        }
      );
    } catch (error) {
      console.error('Error creating notification:', error);
    }

    // ── Cancel the removed player's booking + issue refund if applicable ──────
    try {
      const occurrenceStart = req.body.occurrenceStart || req.query.occurrenceStart;
      const isRecurring = event.isRecurring;
      const queryOccurrenceStart = isRecurring ? occurrenceStart : null;
      const removedBooking = await Booking.findActiveByUserAndEvent(
        player._id,
        event._id,
        queryOccurrenceStart
      );

      if (removedBooking) {
        // Mark booking as cancelled
        await Booking.updateStatus(removedBooking.bookingId || removedBooking._id, 'cancelled', {
          cancelledAt: new Date(),
        });

        // Attempt Stripe refund if this was a paid booking
        let refundMessage = null;
        if (removedBooking.paymentIntentId || removedBooking.paymentId) {
          try {
            const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
            let payment = null;
            if (removedBooking.paymentId) {
              payment = await Payment.findById(removedBooking.paymentId);
            }
            if (!payment && removedBooking.paymentIntentId) {
              payment = await Payment.findByStripePaymentIntentId(removedBooking.paymentIntentId);
            }

            if (payment && payment.status === 'success' && payment.stripePaymentIntentId) {
              const refund = await stripe.refunds.create({
                payment_intent: payment.stripePaymentIntentId,
              });
              await Payment.markRefunded(payment.paymentId || payment._id, {
                refundId: refund.id,
                refundStatus: refund.status || 'succeeded',
                refundAmount: payment.finalAmount || payment.amount || 0,
                refundedAt: new Date(),
                refundReason: 'Removed by organiser',
              });
              refundMessage = 'A full refund has been initiated and should reflect in your account shortly.';
              console.log(`💸 [REMOVE-PLAYER] Refund issued for booking ${removedBooking.bookingId}`);
            }
          } catch (refundErr) {
            console.error('[REMOVE-PLAYER] Stripe refund failed:', refundErr.message);
            // Don't block removal — refund failure is non-fatal
          }
        }

        // Email/WhatsApp notification to removed player (fire-and-forget)
        sendPlayerCancelledBookingNotification({
          user: player,
          event,
          booking: removedBooking,
          refundMessage,
        }).catch(err => console.error('[REMOVE-PLAYER] Player email/WhatsApp notification failed:', err.message));

        console.log(`📋 [REMOVE-PLAYER] Booking ${removedBooking.bookingId} cancelled for user ${player.userId}`);
      }
    } catch (bookingCancelErr) {
      // Non-fatal: log but don't fail the removal response
      console.error('[REMOVE-PLAYER] Error cancelling booking:', bookingCancelErr.message);
    }

    // Get updated participant count
    const updatedJoinedCount = await EventJoin.getParticipantCount(event._id);
    const maxGuest = event.eventMaxGuest !== undefined ? event.eventMaxGuest : (event.gameSpots || 0);
    const availableSpots = Math.max(0, maxGuest - updatedJoinedCount);

    res.status(200).json({
      success: true,
      message: 'Player removed from event successfully',
      data: {
        player: {
          userId: player.userId,
          fullName: player.fullName,
          email: player.email,
        },
        event: {
          eventId: event.eventId,
          eventName: event.eventName || event.gameTitle,
        },
        spotsInfo: {
          totalSpots: maxGuest,
          spotsBooked: updatedJoinedCount,
          spotsLeft: availableSpots,
          spotsFull: updatedJoinedCount >= maxGuest,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  removePlayer,
};
