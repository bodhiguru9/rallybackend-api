const stripe = require('stripe');
const Payment = require('../../models/Payment');
const PromoCode = require('../../models/PromoCode');
const Event = require('../../models/Event');
const Booking = require('../../models/Booking');
const EventJoin = require('../../models/EventJoin');
const User = require('../../models/User');
const { findEventById } = require('../../utils/eventHelper');
const EventJoinRequest = require('../../models/EventJoinRequest');
const { getDB } = require('../../config/database');
const { ObjectId } = require('mongodb');
const { 
  sendBookingConfirmedNotification,
  sendHostBookingNotification
} = require('../../services/eventNotification.service');

// Initialize Stripe lazily
let stripeInstance = null;

const getStripeInstance = () => {
  if (!stripeInstance) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error('Stripe credentials not configured');
    }
    stripeInstance = stripe(secretKey);
  }
  return stripeInstance;
};

/**
 * @desc    Stripe Webhook Handler
 * @route   POST /api/payments/webhook
 * @access  Public
 */
const stripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    const stripeInstance = getStripeInstance();
    // Verify the webhook signature
    // IMPORTANT: req.body MUST be the raw buffer here. 
    // This requires express.raw() middleware on the route.
    event = stripeInstance.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error(`⚠️  Webhook signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object;
        await handlePaymentIntentSucceeded(paymentIntent);
        break;
      
      case 'payment_intent.payment_failed':
      case 'payment_intent.canceled':
        const failedIntent = event.data.object;
        await handlePaymentIntentFailed(failedIntent);
        break;
        
      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    // Return a 200 response to acknowledge receipt of the event
    res.json({received: true});
  } catch (err) {
    console.error(`Error processing webhook: ${err.message}`);
    // Return 500 so Stripe retries the webhook
    res.status(500).send(`Error processing webhook: ${err.message}`);
  }
};

const handlePaymentIntentSucceeded = async (paymentIntent) => {
  const payment_intent_id = paymentIntent.id;

  // Find payment record
  const payment = await Payment.findByStripePaymentIntentId(payment_intent_id);
  if (!payment) {
    console.error(`Webhook: Payment record not found for intent ${payment_intent_id}`);
    return;
  }

  // If already success, skip to avoid duplicate processing
  if (payment.status === 'success') {
    console.log(`Webhook: Payment ${payment_intent_id} already marked as success.`);
    return;
  }

  // Update payment status to success
  await Payment.updateStatus(
    payment.paymentId || payment._id,
    'success',
    paymentIntent.id,
    paymentIntent.payment_method
  );

  // Increment promo code usage if used
  if (payment.promoCodeId) {
    await PromoCode.incrementUsage(payment.promoCodeId);
  }

  let isNewlyBooked = false;

  // Update booking status
  let booking = null;
  try {
    // Find booking by payment intent ID
    const existingBooking = await Booking.findByPaymentIntentId(payment_intent_id);
    
    if (existingBooking) {
      if (existingBooking.status === 'pending') {
        isNewlyBooked = true;
        await Booking.updateStatus(existingBooking.bookingId, 'booked', {
          bookedAt: new Date(),
        });
        
        // Add user to event
        try {
          const eventDoc = await findEventById(existingBooking.eventId);
          
          await EventJoin.join(
            payment.userId,
            existingBooking.eventId,
            existingBooking.occurrenceStart,
            {
              occurrenceEnd: existingBooking.occurrenceEnd || null,
              parentEventId: existingBooking.parentEventId || eventDoc?.eventId || null,
              guestsCount: existingBooking.guestsCount || 1,
            }
          );

          // Private events: remove request record after successful join
          const isPrivate = eventDoc?.IsPrivateEvent !== undefined ? eventDoc.IsPrivateEvent : (eventDoc?.visibility === 'private');
          if (isPrivate) {
            await EventJoinRequest.deleteActiveByUserAndEvent(payment.userId, existingBooking.eventId);
            const db = getDB();
            const waitlistCollection = db.collection('waitlist');
            await waitlistCollection.deleteMany({
              userId: typeof payment.userId === 'string' ? new ObjectId(payment.userId) : payment.userId,
              eventId: typeof existingBooking.eventId === 'string' ? new ObjectId(existingBooking.eventId) : existingBooking.eventId,
              status: { $in: ['pending', 'accepted'] },
            });
          }
        } catch (joinError) {
          if (joinError.message !== 'Already joined this occurrence') {
            console.error('Webhook: Error joining event:', joinError);
          }
        }
      }
      
      booking = await Booking.findById(existingBooking.bookingId);
    } else {
      // Create new booking (fallback for older flow)
      const event = await findEventById(payment.eventId);
      if (event) {
        const existingBookingForPayment = await Booking.findByPaymentId(payment.paymentId);
        const hasJoined = await EventJoin.hasJoined(
          payment.userId,
          event._id,
          payment.occurrenceStart || null
        );
        if (!hasJoined && !existingBookingForPayment) {
          isNewlyBooked = true;
          const bookingData = {
            userId: payment.userId,
            eventId: event._id,
            parentEventId: payment.parentEventId || event.eventId || null,
            occurrenceStart: payment.occurrenceStart || null,
            occurrenceEnd: payment.occurrenceEnd || null,
            paymentId: payment.paymentId,
            paymentIntentId: payment_intent_id,
            status: 'booked',
            amount: payment.amount,
            discountAmount: payment.discountAmount,
            finalAmount: payment.finalAmount,
            promoCode: payment.promoCode,
            bookedAt: new Date(),
          };

          booking = await Booking.create(bookingData);
          await EventJoin.join(
            payment.userId,
            event._id,
            payment.occurrenceStart || null,
            {
              occurrenceEnd: payment.occurrenceEnd || null,
              parentEventId: payment.parentEventId || event.eventId || null,
              guestsCount: bookingData.guestsCount || 1,
            }
          );

          // Private events cleanup
          const isPrivate = event?.IsPrivateEvent !== undefined ? event.IsPrivateEvent : (event?.visibility === 'private');
          if (isPrivate) {
            await EventJoinRequest.deleteActiveByUserAndEvent(payment.userId, event._id);
            const db = getDB();
            const waitlistCollection = db.collection('waitlist');
            await waitlistCollection.deleteMany({
              userId: typeof payment.userId === 'string' ? new ObjectId(payment.userId) : payment.userId,
              eventId: event._id,
              occurrenceStart: payment.occurrenceStart || null,
              status: { $in: ['pending', 'accepted'] },
            });
          }
        }
      }
    }
  } catch (bookingError) {
    console.error('Webhook: Error updating booking:', bookingError);
  }

  // Notifications
  if (booking && isNewlyBooked) {
    try {
      // Do NOT await these so we can return quickly, but we are in a webhook worker anyway.
      // We will look up the user and event without blocking the main thread.
      User.findById(payment.userId).then(user => {
        findEventById(booking.eventId).then(eventForNotification => {
          if (user && eventForNotification) {
            sendBookingConfirmedNotification({
              user,
              event: eventForNotification,
              booking,
            }).catch(err => console.error('Webhook: Booking confirmation notification failed:', err));

            sendHostBookingNotification({
              player: user,
              event: eventForNotification,
              booking,
            }).catch(err => console.error('Webhook: Host booking notification failed:', err));
          }
        }).catch(err => console.error(err));
      }).catch(err => console.error(err));
    } catch (notificationError) {
      console.error('Webhook: Notification setup failed:', notificationError);
    }
  }
};

const handlePaymentIntentFailed = async (paymentIntent) => {
  const payment_intent_id = paymentIntent.id;

  const payment = await Payment.findByStripePaymentIntentId(payment_intent_id);
  if (!payment) {
    console.error(`Webhook: Payment record not found for failed intent ${payment_intent_id}`);
    return;
  }

  // Update payment status to failed
  await Payment.updateStatus(payment.paymentId || payment._id, 'failed');

  // We leave the booking as pending so user can retry, or mark it failed?
  // Existing logic just leaves it pending for user to retry.
  console.log(`Webhook: Payment intent ${payment_intent_id} failed. Status updated.`);
};

module.exports = {
  stripeWebhook
};
