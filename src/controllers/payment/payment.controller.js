const stripe = require('stripe');
const Payment = require('../../models/Payment');
const PromoCode = require('../../models/PromoCode');
const Event = require('../../models/Event');
const Booking = require('../../models/Booking');
const EventJoin = require('../../models/EventJoin');
const User = require('../../models/User');
const { findEventById } = require('../../utils/eventHelper');
const { validateAgeForEvent } = require('../../utils/ageRestriction');
const EventJoinRequest = require('../../models/EventJoinRequest');
const { getDB } = require('../../config/database');
const { ObjectId } = require('mongodb');

// Initialize Stripe lazily (only when needed)
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

/**
 * @desc    Create Stripe Payment Intent for event payment
 * @route   POST /api/payments/create-order
 * @access  Private
 */
const createPaymentOrder = async (req, res, next) => {
  try {
    // Support both camelCase and snake_case field names
    const eventId = req.body.eventId || req.body.event_id;
    const promoCode = req.body.promoCode || req.body.promo_code;
    const userId = req.user.id;

    // Better validation with detailed error message
    if (!eventId) {
      return res.status(400).json({
        success: false,
        error: 'Event ID is required',
        message: 'Please provide eventId or event_id in the request body',
        receivedBody: {
          eventId: req.body.eventId,
          event_id: req.body.event_id,
          promoCode: req.body.promoCode,
          promo_code: req.body.promo_code,
        },
      });
    }

    // Trim and validate eventId is not empty string
    const trimmedEventId = typeof eventId === 'string' ? eventId.trim() : eventId;
    if (!trimmedEventId || trimmedEventId === '') {
      return res.status(400).json({
        success: false,
        error: 'Event ID cannot be empty',
      });
    }

    // Find event
    const event = await findEventById(trimmedEventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found',
      });
    }

    // Age restriction check (players only) - block payment creation if not eligible
    if (req.user.userType === 'player') {
      const user = await User.findById(userId);
      const ageCheck = validateAgeForEvent(user?.dob, event.eventMinAge, event.eventMaxAge);
      if (!ageCheck.allowed) {
        return res.status(400).json({
          success: false,
          error: ageCheck.message,
          code: ageCheck.code,
          age: ageCheck.age,
          eventMinAge: ageCheck.minAge,
          eventMaxAge: ageCheck.maxAge,
        });
      }
    }

    // Get original price
    let originalAmount = event.gameJoinPrice || 0;
    let discountAmount = 0;
    let finalAmount = originalAmount;
    let promoCodeId = null;
    let promoCodeString = null;

    // Validate and apply promo code if provided
    const trimmedPromoCode = promoCode ? (typeof promoCode === 'string' ? promoCode.trim() : promoCode) : null;
    if (trimmedPromoCode && trimmedPromoCode !== '') {
      try {
        const validation = await PromoCode.validateAndApply(
          trimmedPromoCode,
          event._id.toString(),
          userId,
          originalAmount
        );

        discountAmount = validation.discountAmount;
        finalAmount = validation.finalAmount;
        promoCodeId = validation.promoCode._id;
        promoCodeString = validation.promoCode.code;
      } catch (error) {
        return res.status(400).json({
          success: false,
          error: error.message || 'Invalid promo code',
        });
      }
    }

    // Convert amount to cents (Stripe uses smallest currency unit)
    const amountInCents = Math.round(finalAmount * 100);

    if (amountInCents <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment amount',
      });
    }

    // Private event: only allow payment if organiser has accepted the request
    const isPrivate = event.IsPrivateEvent !== undefined ? event.IsPrivateEvent : (event.visibility === 'private');
    if (isPrivate && req.user.userType === 'player') {
      const active = await EventJoinRequest.findActiveByUserAndEvent(userId, event._id);
      const accepted = active && active.status === 'accepted';

      if (!accepted) {
        // Also support full-event flow via waitlist accepted status (if implemented later)
        const db = getDB();
        const waitlistCollection = db.collection('waitlist');
        const waitlistAccepted = await waitlistCollection.findOne({
          userId: new ObjectId(userId),
          eventId: event._id,
          status: 'accepted',
        });

        if (!waitlistAccepted) {
          return res.status(403).json({
            success: false,
            error: 'Your request is not accepted yet',
            message: 'Organiser must accept your request before you can pay and join this private event.',
          });
        }
      }
    }

    // Create Stripe Payment Intent
    const stripeInstance = getStripeInstance();
    const paymentIntent = await stripeInstance.paymentIntents.create({
      amount: amountInCents,
      currency: 'usd', // Change to your preferred currency (usd, eur, inr, etc.)
      metadata: {
        eventId: event.eventId,
        eventTitle: event.eventName || '',
        eventName: event.eventName || '',
        eventCategory: Array.isArray(event.eventSports) && event.eventSports.length > 0 ? event.eventSports[0] : '',
        eventType: event.eventType || '',
        userId: userId,
        promoCode: promoCodeString || 'none',
      },
      description: `Payment for event: ${event.eventName || ''}`,
    });

    // Create payment record
    const paymentData = {
      userId: userId,
      eventId: event._id.toString(),
      amount: originalAmount,
      discountAmount: discountAmount,
      finalAmount: finalAmount,
      promoCodeId: promoCodeId,
      promoCode: promoCodeString,
      stripePaymentIntentId: paymentIntent.id,
      status: 'pending',
    };

    const payment = await Payment.create(paymentData);

    res.status(200).json({
      success: true,
      message: 'Payment intent created successfully',
      data: {
        paymentIntent: {
          id: paymentIntent.id,
          clientSecret: paymentIntent.client_secret,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
          status: paymentIntent.status,
        },
        payment: {
          paymentId: payment.paymentId,
          originalAmount: originalAmount,
          discountAmount: discountAmount,
          finalAmount: finalAmount,
          promoCode: promoCodeString,
        },
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
      },
    });
  } catch (error) {
    if (error.type && error.type.startsWith('Stripe')) {
      // Stripe error
      return res.status(400).json({
        success: false,
        error: error.message || 'Payment intent creation failed',
      });
    }
    next(error);
  }
};

/**
 * @desc    Verify Stripe payment
 * @route   POST /api/payments/verify
 * @access  Private
 */
const verifyPayment = async (req, res, next) => {
  try {
    const { payment_intent_id } = req.body;

    if (!payment_intent_id) {
      return res.status(400).json({
        success: false,
        error: 'Payment intent ID is required',
      });
    }

    // Find payment record
    const payment = await Payment.findByStripePaymentIntentId(payment_intent_id);
    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment record not found',
      });
    }

    // Verify with Stripe API
    try {
      const stripeInstance = getStripeInstance();
      const paymentIntent = await stripeInstance.paymentIntents.retrieve(payment_intent_id);

      if (paymentIntent.status === 'succeeded') {
        // Age restriction safety check before joining the event (players only).
        // We also block earlier in createPaymentOrder/bookEvent, but this prevents edge cases.
        const ensureAgeAllowedForEvent = async (eventDoc) => {
          if (req.user?.userType !== 'player') return { allowed: true };
          const user = await User.findById(payment.userId);
          const ageCheck = validateAgeForEvent(user?.dob, eventDoc?.eventMinAge, eventDoc?.eventMaxAge);
          return ageCheck;
        };

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

        // Update booking status from pending to booked if payment is successful
        let booking = null;
        try {
          // Find booking by payment intent ID
          const existingBooking = await Booking.findByPaymentIntentId(payment_intent_id);
          
          if (existingBooking) {
            // Update booking status to booked
            if (existingBooking.status === 'pending') {
              await Booking.updateStatus(existingBooking.bookingId, 'booked', {
                bookedAt: new Date(),
              });
              
              // Add user to event if not already joined
              try {
                const eventDoc = await findEventById(existingBooking.eventId);
                const ageCheck = await ensureAgeAllowedForEvent(eventDoc);
                if (!ageCheck.allowed) {
                  return res.status(400).json({
                    success: false,
                    error: ageCheck.message,
                    code: ageCheck.code,
                    age: ageCheck.age,
                    eventMinAge: ageCheck.minAge,
                    eventMaxAge: ageCheck.maxAge,
                  });
                }
                await EventJoin.join(payment.userId, existingBooking.eventId);

                // Private events: remove request record after successful join
                try {
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
                } catch (cleanupErr) {
                  console.error('Error cleaning up private request after payment:', cleanupErr);
                }
              } catch (joinError) {
                // User might already be joined, that's okay
                if (joinError.message !== 'Already joined this event') {
                  console.error('Error joining event:', joinError);
                }
              }
            }
            
            // Get updated booking
            booking = await Booking.findById(existingBooking.bookingId);
          } else {
            // If no booking exists, create one (backward compatibility)
            const event = await findEventById(payment.eventId);
            if (event) {
              const hasJoined = await EventJoin.hasJoined(payment.userId, event.eventId);
              if (!hasJoined) {
                const ageCheck = await ensureAgeAllowedForEvent(event);
                if (!ageCheck.allowed) {
                  return res.status(400).json({
                    success: false,
                    error: ageCheck.message,
                    code: ageCheck.code,
                    age: ageCheck.age,
                    eventMinAge: ageCheck.minAge,
                    eventMaxAge: ageCheck.maxAge,
                  });
                }
                const bookingData = {
                  userId: payment.userId,
                  eventId: event._id,
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
                await EventJoin.join(payment.userId, event._id);

                // Private events: remove request record after successful join
                try {
                  const isPrivate = event?.IsPrivateEvent !== undefined ? event.IsPrivateEvent : (event?.visibility === 'private');
                  if (isPrivate) {
                    await EventJoinRequest.deleteActiveByUserAndEvent(payment.userId, event._id);
                    const db = getDB();
                    const waitlistCollection = db.collection('waitlist');
                    await waitlistCollection.deleteMany({
                      userId: typeof payment.userId === 'string' ? new ObjectId(payment.userId) : payment.userId,
                      eventId: event._id,
                      status: { $in: ['pending', 'accepted'] },
                    });
                  }
                } catch (cleanupErr) {
                  console.error('Error cleaning up private request after payment:', cleanupErr);
                }
              }
            }
          }
        } catch (bookingError) {
          // Log error but don't fail the payment verification
          console.error('Error updating booking after payment:', bookingError);
        }

        // Get updated payment record
        const updatedPayment = await Payment.findById(payment.paymentId || payment._id);

        const responseData = {
          payment: {
            paymentId: updatedPayment.paymentId,
            status: updatedPayment.status,
            amount: updatedPayment.amount,
            discountAmount: updatedPayment.discountAmount,
            finalAmount: updatedPayment.finalAmount,
            promoCode: updatedPayment.promoCode,
            stripePaymentIntentId: updatedPayment.stripePaymentIntentId,
            stripePaymentId: updatedPayment.stripePaymentId,
            createdAt: updatedPayment.createdAt,
          },
        };

        // Add booking info if created
        if (booking) {
          const event = await findEventById(booking.eventId);
          responseData.booking = {
            bookingId: booking.bookingId,
            eventId: event ? event.eventId : null,
            eventTitle: event ? (event.eventName || null) : null,
            eventName: event ? (event.eventName || null) : null,
            eventCategory: event && Array.isArray(event.eventSports) && event.eventSports.length > 0 ? event.eventSports[0] : null,
            eventType: event ? (event.eventType || null) : null,
            status: booking.status,
            bookedAt: booking.bookedAt,
          };
        }

        res.status(200).json({
          success: true,
          message: booking ? 'Payment verified and event booked successfully' : 'Payment verified successfully',
          data: responseData,
        });
      } else if (paymentIntent.status === 'requires_payment_method' || 
                 paymentIntent.status === 'canceled' ||
                 paymentIntent.status === 'requires_capture') {
        // Update payment status based on Stripe status
        const status = paymentIntent.status === 'canceled' ? 'failed' : 'pending';
        await Payment.updateStatus(payment.paymentId || payment._id, status);

        // Update booking status if exists (keep as pending or mark as cancelled)
        try {
          const existingBooking = await Booking.findByPaymentIntentId(payment_intent_id);
          if (existingBooking && existingBooking.status === 'pending') {
            // Keep booking as pending if payment was cancelled
            // Don't change status, let user retry payment
          }
        } catch (bookingError) {
          console.error('Error updating booking status:', bookingError);
        }

        return res.status(400).json({
          success: false,
          error: 'Payment not completed',
          status: paymentIntent.status,
        });
      } else {
        // Payment is still processing
        return res.status(200).json({
          success: true,
          message: 'Payment is processing',
          data: {
            payment: {
              paymentId: payment.paymentId,
              status: 'pending',
              stripeStatus: paymentIntent.status,
            },
          },
        });
      }
    } catch (stripeError) {
      // Update payment status to failed
      await Payment.updateStatus(payment.paymentId || payment._id, 'failed');

      return res.status(400).json({
        success: false,
        error: 'Payment verification failed',
        details: stripeError.message,
      });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get payment history for user
 * @route   GET /api/payments/history?userId=xxx&limit=50&skip=0
 * @access  Private
 * 
 * Query Parameters:
 * - userId: (optional) User ID to get payments for. If not provided, uses logged-in user's ID.
 *            If provided, must be the logged-in user or admin/organiser can view others' payments.
 * - limit: (optional) Number of results per page (default: 50)
 * - skip: (optional) Number of results to skip (default: 0)
 */
const getPaymentHistory = async (req, res, next) => {
  try {
    // Get logged-in user's sequential userId (from req.user.userId set by auth middleware)
    const loggedInUserId = req.user.userId; // Sequential userId (1, 2, 3, etc.)
    const { userId: queryUserId, limit, skip } = req.query;

    // Use query userId if provided, otherwise use logged-in user's sequential userId
    let targetUserId = queryUserId ? parseInt(queryUserId) : loggedInUserId;

    // If query userId is provided and different from logged-in user, 
    // verify user has permission
    if (queryUserId && parseInt(queryUserId) !== loggedInUserId) {
      // Check if user is organiser (they can view other users' payments)
      if (req.user.userType !== 'organiser') {
        return res.status(403).json({
          success: false,
          error: 'Not authorized to view other users\' payment history',
          message: 'Only organisers can view other users\' payment history',
        });
      }
    }

    // Validate targetUserId
    if (!targetUserId || isNaN(targetUserId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID',
        message: 'Please provide a valid sequential userId (1, 2, 3, etc.)',
      });
    }

    const limitNum = parseInt(limit) || 50;
    const skipNum = parseInt(skip) || 0;

    // findByUser now accepts sequential userId
    const payments = await Payment.findByUser(targetUserId, limitNum, skipNum);

    // Get event details for each payment
    const paymentsWithDetails = await Promise.all(
      payments.map(async (payment) => {
        const event = await Event.findById(payment.eventId);
        return {
          paymentId: payment.paymentId,
          eventId: event ? event.eventId : null,
          eventTitle: event ? (event.eventName || null) : null,
          eventName: event ? (event.eventName || null) : null,
          eventCategory: event && Array.isArray(event.eventSports) && event.eventSports.length > 0 ? event.eventSports[0] : null,
          eventType: event ? (event.eventType || null) : null,
          amount: payment.amount,
          discountAmount: payment.discountAmount,
          finalAmount: payment.finalAmount,
          promoCode: payment.promoCode,
          status: payment.status,
          stripePaymentIntentId: payment.stripePaymentIntentId,
          stripePaymentId: payment.stripePaymentId,
          createdAt: payment.createdAt,
          updatedAt: payment.updatedAt,
        };
      })
    );

    res.status(200).json({
      success: true,
      data: {
        payments: paymentsWithDetails,
        userId: targetUserId, // Sequential userId
        requestedBy: loggedInUserId, // Sequential userId of requester
        limit: limitNum,
        skip: skipNum,
        total: paymentsWithDetails.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get payment by ID
 * @route   GET /api/payments/:id
 * @access  Private
 */
const getPaymentById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const payment = await Payment.findById(id);
    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found',
      });
    }

    // Check if user owns this payment
    if (payment.userId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to view this payment',
      });
    }

    const event = await Event.findById(payment.eventId);

    res.status(200).json({
      success: true,
      data: {
        payment: {
          paymentId: payment.paymentId,
          eventId: event ? event.eventId : null,
          eventTitle: event ? (event.eventName || null) : null,
          eventName: event ? (event.eventName || null) : null,
          eventCategory: event && Array.isArray(event.eventSports) && event.eventSports.length > 0 ? event.eventSports[0] : null,
          eventType: event ? (event.eventType || null) : null,
          amount: payment.amount,
          discountAmount: payment.discountAmount,
          finalAmount: payment.finalAmount,
          promoCode: payment.promoCode,
          status: payment.status,
          stripePaymentIntentId: payment.stripePaymentIntentId,
          stripePaymentId: payment.stripePaymentId,
          createdAt: payment.createdAt,
          updatedAt: payment.updatedAt,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createPaymentOrder,
  verifyPayment,
  getPaymentHistory,
  getPaymentById,
};

