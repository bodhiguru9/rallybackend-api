const Booking = require('../../models/Booking');
const Payment = require('../../models/Payment');
const PromoCode = require('../../models/PromoCode');
const Event = require('../../models/Event');
const EventJoin = require('../../models/EventJoin');
const User = require('../../models/User');
const stripe = require('stripe');
const { findEventById } = require('../../utils/eventHelper');
const { validateAgeForEvent } = require('../../utils/ageRestriction');
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
      throw new Error('Stripe credentials not configured. Please set STRIPE_SECRET_KEY in environment variables.');
    }
    stripeInstance = stripe(secretKey);
  }
  return stripeInstance;
};

/**
 * @desc    Create booking and initiate Stripe payment
 * @route   POST /api/bookings/book-event/:eventId
 * @access  Private
 *
 * Flow:
 * 1. User clicks booking API
 * 2. Create pending booking
 * 3. Create Stripe payment intent
 * 4. Return booking ID and payment intent for frontend
 */
const bookEvent = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const eventId = req.params.eventId;
    const promoCode = req.query.promoCode || req.body.promoCode || req.body.promo_code;

    const requestedOccurrenceStart = req.body.occurrenceStart || req.query.occurrenceStart || null;
    const requestedOccurrenceEnd = req.body.occurrenceEnd || req.query.occurrenceEnd || null;
    const requestedTimeZone = req.body.timeZone || req.query.timeZone || null;
    const paymentMethod = req.query.paymentMethod || req.body.paymentMethod || null;

    const normalizeIso = (value) => {
      if (!value) return null;
      const d = new Date(value);
      return isNaN(d.getTime()) ? null : d.toISOString();
    };

    // Validation
    if (!eventId) {
      return res.status(400).json({
        success: false,
        error: 'Event ID is required',
      });
    }

    // Trim and validate eventId
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

    const isRecurring = Array.isArray(event.eventFrequency) && event.eventFrequency.length > 0;

    if (isRecurring && !requestedOccurrenceStart) {
      return res.status(400).json({
        success: false,
        error: 'occurrenceStart is required for recurring events',
      });
    }

    const occurrenceStart = normalizeIso(requestedOccurrenceStart || event.eventDateTime);
    const occurrenceEnd = normalizeIso(requestedOccurrenceEnd || event.eventEndDateTime || null);

    if (!occurrenceStart) {
      return res.status(400).json({
        success: false,
        error: 'Invalid occurrenceStart',
      });
    }

    if (new Date(occurrenceStart) <= new Date()) {
      return res.status(400).json({
        success: false,
        error: 'Cannot book a past occurrence',
      });
    }

    // Normalize event price across old/new schemas
    const eventPrice = Number(event?.gameJoinPrice ?? event?.eventPricePerGuest ?? 0);
    const safeEventPrice = Number.isNaN(eventPrice) ? 0 : eventPrice;

    // Fetch user (used later too) and enforce age restriction before any booking/payment
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    if (req.user.userType === 'player') {
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

    // Check if user already joined the event
    const hasJoined = await EventJoin.hasJoined(userId, event._id, occurrenceStart);
    if (hasJoined) {
      return res.status(400).json({
        success: false,
        error: 'Already joined this occurrence',
      });
    }

    // Check if there's already a pending booking for this user and event
    // Skip reuse for Apple Pay — old PaymentIntents may have setup_future_usage
    // which is incompatible with Apple Pay tokens.
    const existingBookings = await Booking.findByUser(userId, 'pending', 100, 0);
    const existingPendingBooking = existingBookings.find(
      (b) =>
        b.eventId.toString() === event._id.toString() &&
        (b.occurrenceStart || null) === occurrenceStart
    );

    if (existingPendingBooking && paymentMethod !== 'apple_pay') {
      const payment = existingPendingBooking.paymentIntentId
        ? await Payment.findByStripePaymentIntentId(existingPendingBooking.paymentIntentId)
        : null;

      if (payment && payment.stripePaymentIntentId) {
        const stripeInstance = getStripeInstance();
        try {
          const paymentIntent = await stripeInstance.paymentIntents.retrieve(payment.stripePaymentIntentId);

          const userDetails = {
            userId: user?.userId || null,
            userType: user?.userType || null,
            email: user?.email || null,
            fullName: user?.fullName || null,
            mobileNumber: user?.mobileNumber || null,
            profilePic: user?.profilePic || null,
          };

          const eventDetails = {
            eventId: event.eventId,
            eventTitle: event.eventName || null,
            eventName: event.eventName || null,
            eventCategory: Array.isArray(event.eventSports) && event.eventSports.length > 0 ? event.eventSports[0] : null,
            eventType: event.eventType || null,
            eventDateTime: event.eventDateTime,
            eventLocation: event.eventLocation,
            eventImages: event.eventImages || event.gameImages || [],
            gameJoinPrice: safeEventPrice,
          };

          const paymentDetails = {
            paymentId: payment.paymentId,
            status: payment.status || 'pending',
            originalAmount: existingPendingBooking.amount,
            discountAmount: existingPendingBooking.discountAmount,
            finalAmount: existingPendingBooking.finalAmount,
            finalAmountInCents: paymentIntent.amount,
            currency: 'aed',
            promoCode: existingPendingBooking.promoCode,
            stripePaymentIntentId: paymentIntent.id,
          };

          const stripePaymentIntent = {
            id: paymentIntent.id,
            clientSecret: paymentIntent.client_secret,
            amount: paymentIntent.amount,
            amountInDollars: (paymentIntent.amount / 100).toFixed(2),
            currency: paymentIntent.currency,
            status: paymentIntent.status,
            description: paymentIntent.description,
          };

          let existingCheckoutSession = null;
          try {
            const frontendUrl = process.env.FRONTEND_URL;

            if (frontendUrl && frontendUrl.trim() !== '') {
              const backendHost = req.get('host');
              if (!frontendUrl.includes(backendHost)) {
                existingCheckoutSession = await stripeInstance.checkout.sessions.create({
                  payment_method_types: ['card'],
                  line_items: [
                    {
                      price_data: {
                        currency: 'aed',
                        product_data: {
                          name: event.eventName || 'Event',
                          description: `Booking for event: ${event.eventName || 'Event'}`,
                          images: event.eventImages && event.eventImages.length > 0 ? [event.eventImages[0]] : [],
                        },
                        unit_amount: paymentIntent.amount,
                      },
                      quantity: 1,
                    },
                  ],
                  mode: 'payment',
                  success_url: `${frontendUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}&booking_id=${existingPendingBooking.bookingId}`,
                  cancel_url: `${frontendUrl}/payment/cancel?booking_id=${existingPendingBooking.bookingId}`,
                  metadata: {
                    bookingId: existingPendingBooking.bookingId,
                    eventId: event.eventId,
                    eventTitle: event.eventName || '',
                    eventName: event.eventName || '',
                    eventCategory: Array.isArray(event.eventSports) && event.eventSports.length > 0 ? event.eventSports[0] : '',
                    eventType: event.eventType || '',
                    userId: userId,
                    ...(existingPendingBooking.promoCode && { promoCode: existingPendingBooking.promoCode }),
                  },
                  customer_email: user?.email || null,
                  payment_intent_data: {
                    metadata: {
                      bookingId: existingPendingBooking.bookingId,
                      eventId: event.eventId,
                      eventTitle: event.eventName || '',
                      eventName: event.eventName || '',
                      eventCategory: Array.isArray(event.eventSports) && event.eventSports.length > 0 ? event.eventSports[0] : '',
                      eventType: event.eventType || '',
                      userId: userId,
                      ...(existingPendingBooking.promoCode && { promoCode: existingPendingBooking.promoCode }),
                    },
                  },
                });
              }
            }
          } catch (checkoutError) {
            console.error('Failed to create checkout session:', checkoutError);
          }

          const stripeCheckoutSession = existingCheckoutSession
            ? {
              id: existingCheckoutSession.id,
              url: existingCheckoutSession.url,
              successUrl: existingCheckoutSession.success_url,
              cancelUrl: existingCheckoutSession.cancel_url,
            }
            : null;

          return res.status(200).json({
            success: true,
            message: 'Pending booking found',
            data: {
              user: userDetails,
              event: eventDetails,
              booking: {
                bookingId: existingPendingBooking.bookingId,
                status: existingPendingBooking.status,
                amount: existingPendingBooking.amount,
                discountAmount: existingPendingBooking.discountAmount,
                finalAmount: existingPendingBooking.finalAmount,
                promoCode: existingPendingBooking.promoCode,
                occurrenceStart: existingPendingBooking.occurrenceStart || null,
                occurrenceEnd: existingPendingBooking.occurrenceEnd || null,
                createdAt: existingPendingBooking.createdAt,
              },
              occurrence: {
                occurrenceStart: existingPendingBooking.occurrenceStart || occurrenceStart,
                occurrenceEnd: existingPendingBooking.occurrenceEnd || occurrenceEnd,
              },
              payment: paymentDetails,
              paymentIntent: stripePaymentIntent,
              checkoutSession: stripeCheckoutSession,
              publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
              isFreeEvent: false,
              paymentRequired: true,
              paymentStatus: payment.status || 'pending',
            },
          });
        } catch (stripeError) {
          // Payment intent not found, continue to create new one
        }
      }
    }

    // Get guests count (default to 1)
    const guestsCount = parseInt(req.query.guestsCount || req.body.guestsCount || req.body.guests_count || 1, 10);
    const safeGuestsCount = isNaN(guestsCount) || guestsCount < 1 ? 1 : guestsCount;

    // Get original price (multiplied by guests count)
    let originalAmount = safeEventPrice * safeGuestsCount;
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

    // Add 5% VAT
    const vatRate = 0.05;
    const vatAmount = Math.round(finalAmount * vatRate * 100) / 100;
    finalAmount = finalAmount + vatAmount;

    // Optional temporary debug log
    console.log('BOOK EVENT PRICE DEBUG:', {
      eventId: event.eventId,
      gameJoinPrice: event.gameJoinPrice,
      eventPricePerGuest: event.eventPricePerGuest,
      originalAmount,
      finalAmount,
    });

    const amountInCents = Math.round(finalAmount * 100);
    const isFreeEvent = amountInCents <= 0;

    // STEP 1: Create booking first (before payment)
    const bookingData = {
      userId: userId,
      eventId: event._id,
      parentEventId: event.eventId,
      occurrenceStart: occurrenceStart,
      occurrenceEnd: occurrenceEnd,
      timeZone: requestedTimeZone,
      paymentId: null,
      paymentIntentId: null,
      status: isFreeEvent ? 'booked' : 'pending',
      amount: originalAmount,
      discountAmount: discountAmount,
      finalAmount: finalAmount,
      promoCode: promoCodeString,
      bookedAt: isFreeEvent ? new Date() : null,
    };

    const booking = await Booking.create(bookingData);

    // If it's a free event, skip Stripe payment and directly add user to event
    if (isFreeEvent) {
      try {
        await EventJoin.join(userId, event._id, occurrenceStart, {
          occurrenceEnd,
          parentEventId: event.eventId,
        });
      } catch (joinError) {
        if (joinError.message !== 'Already joined this occurrence') {
          console.error('Error joining event:', joinError);
        }
      }

      const updatedBooking = await Booking.findById(booking._id);// or Booking.findByBookingId(booking.bookingId)

      let bookingConfirmationUrl = null;
      const frontendUrl = process.env.FRONTEND_URL;

      if (frontendUrl && frontendUrl.trim() !== '') {
        const backendHost = req.get('host');
        if (!frontendUrl.includes(backendHost)) {
          bookingConfirmationUrl = `${frontendUrl}/booking/confirmed?booking_id=${updatedBooking.bookingId}`;
        }
      }

      const userDetails = {
        userId: user?.userId || null,
        userType: user?.userType || null,
        email: user?.email || null,
        fullName: user?.fullName || null,
        mobileNumber: user?.mobileNumber || null,
        profilePic: user?.profilePic || null,
      };

      const eventDetails = {
        eventId: event.eventId,
        eventTitle: event.eventName || null,
        eventName: event.eventName || null,
        eventCategory: Array.isArray(event.eventSports) && event.eventSports.length > 0 ? event.eventSports[0] : null,
        eventType: event.eventType || null,
        eventDateTime: event.eventDateTime,
        eventLocation: event.eventLocation,
        eventImages: event.eventImages || event.gameImages || [],
        gameJoinPrice: safeEventPrice,
      };

      try {
        await sendBookingConfirmedNotification({
          user,
          event,
          booking: updatedBooking,
        });

        // Notify organiser
        await sendHostBookingNotification({
          player: user,
          event,
          booking: updatedBooking,
        });
      } catch (notificationError) {
        console.error('Booking confirmation notification failed:', notificationError);
      }

      return res.status(201).json({
        success: true,
        message: 'Free event booked successfully',
        data: {
          user: userDetails,
          event: eventDetails,
          booking: {
            bookingId: updatedBooking.bookingId,
            status: updatedBooking.status,
            amount: updatedBooking.amount,
            discountAmount: updatedBooking.discountAmount,
            finalAmount: updatedBooking.finalAmount,
            promoCode: updatedBooking.promoCode,
            occurrenceStart: updatedBooking.occurrenceStart || occurrenceStart,
            occurrenceEnd: updatedBooking.occurrenceEnd || occurrenceEnd,
            bookedAt: updatedBooking.bookedAt,
            createdAt: updatedBooking.createdAt,
          },
          occurrence: {
            occurrenceStart,
            occurrenceEnd,
          },
          bookingConfirmationUrl,
          isFreeEvent: true,
          paymentRequired: false,
          paymentStatus: 'not_required',
        },
      });
    }

    // STEP 2: Create Stripe Payment Intent and Checkout Session (only for paid events)
    const stripeInstance = getStripeInstance();
    let paymentIntent;
    let checkoutSession = null;

    const metadata = {
      bookingId: booking.bookingId,
      eventId: event.eventId,
      parentEventId: event.eventId,
      occurrenceStart: occurrenceStart,
      ...(occurrenceEnd && { occurrenceEnd: occurrenceEnd }),
      eventTitle: event.eventName || '',
      eventName: event.eventName || '',
      eventCategory: Array.isArray(event.eventSports) && event.eventSports.length > 0 ? event.eventSports[0] : '',
      eventType: event.eventType || '',
      userId: String(userId),
    };

    if (promoCodeString) {
      metadata.promoCode = promoCodeString;
    }

    try {

      let customerId = user.stripeCustomerId;

      if (!customerId) {
        const customer = await stripeInstance.customers.create({
          email: user.email,
          name: user.fullName,
        });

        customerId = customer.id;

        // Save in DB
        await User.updateById(userId, {
          stripeCustomerId: customerId,
        });
      }

      // NOTE: Do NOT set setup_future_usage here.
      // Cards are saved independently via /api/cards endpoint.
      // Setting setup_future_usage: 'off_session' causes Stripe to strip
      // apple_pay from allowed payment_method_types, breaking Apple Pay.
      paymentIntent = await stripeInstance.paymentIntents.create({
        amount: amountInCents,
        currency: 'aed',
        customer: customerId,
        metadata: metadata,
        description: `Payment for event: ${event.eventName || ''}`,
      });
    } catch (stripeError) {
      await Booking.updateStatus(booking.bookingId, 'failed');
      const errorMessage = stripeError.message || 'Failed to create payment intent';
      return res.status(400).json({
        success: false,
        error: errorMessage,
        details: stripeError.toString(),
      });
    }
    // Skip checkout session for Apple Pay — native app uses confirmPlatformPayPayment directly
    if (paymentMethod === 'apple_pay') {
      checkoutSession = null;
    } else {
      try {
        const frontendUrl = process.env.FRONTEND_URL;

        if (!frontendUrl || frontendUrl.trim() === '') {
          console.warn('FRONTEND_URL not set. Skipping checkout session creation.');
          checkoutSession = null;
        } else {
          const backendHost = req.get('host');
          if (frontendUrl.includes(backendHost)) {
            console.warn('FRONTEND_URL points to backend. Skipping checkout session creation.');
            checkoutSession = null;
          } else {
            checkoutSession = await stripeInstance.checkout.sessions.create({
              payment_method_types: ['card'],
              line_items: [
                {
                  price_data: {
                    currency: 'aed',
                    product_data: {
                      name: event.eventName || 'Event',
                      description: `Booking for event: ${event.eventName || 'Event'}`,
                      images: event.eventImages && event.eventImages.length > 0 ? [event.eventImages[0]] : [],
                    },
                    unit_amount: amountInCents,
                  },
                  quantity: 1,
                },
              ],
              mode: 'payment',
              success_url: `${frontendUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}&booking_id=${booking.bookingId}`,
              cancel_url: `${frontendUrl}/payment/cancel?booking_id=${booking.bookingId}`,
              metadata: {
                bookingId: booking.bookingId,
                eventId: event.eventId,
                parentEventId: event.eventId,
                occurrenceStart: occurrenceStart,
                ...(occurrenceEnd && { occurrenceEnd: occurrenceEnd }),
                eventTitle: event.eventName || '',
                eventName: event.eventName || '',
                eventCategory: Array.isArray(event.eventSports) && event.eventSports.length > 0 ? event.eventSports[0] : '',
                eventType: event.eventType || '',
                userId: String(userId),
                ...(promoCodeString && { promoCode: promoCodeString }),
              },
              customer_email: user?.email || null,
              payment_intent_data: {
                metadata: {
                  bookingId: booking.bookingId,
                  eventId: event.eventId,
                  eventTitle: event.eventName || '',
                  eventName: event.eventName || '',
                  eventCategory: Array.isArray(event.eventSports) && event.eventSports.length > 0 ? event.eventSports[0] : '',
                  eventType: event.eventType || '',
                  userId: userId,
                  ...(promoCodeString && { promoCode: promoCodeString }),
                },
              },
            });
          }
        }
      } catch (checkoutError) {
        console.error('Failed to create checkout session:', checkoutError);
        checkoutSession = null;
      }
    }

    // STEP 3: Create payment record
    const paymentData = {
      userId: userId,
      bookingId: booking.bookingId,
      eventId: event._id.toString(),
      parentEventId: event.eventId,
      occurrenceStart: occurrenceStart,
      occurrenceEnd: occurrenceEnd,
      amount: originalAmount,
      discountAmount: discountAmount,
      finalAmount: finalAmount,
      promoCodeId: promoCodeId,
      promoCode: promoCodeString,
      stripePaymentIntentId: paymentIntent.id,
      status: 'pending',
      metadata: metadata,
    };

    const payment = await Payment.create(paymentData);

    // STEP 4: Update booking with payment info
    await Booking.updateStatus(booking.bookingId, 'pending', {
      paymentId: payment.paymentId,
      paymentIntentId: paymentIntent.id,
    });

    const updatedBooking = await Booking.findById(booking._id);

    const userDetails = {
      userId: user?.userId || null,
      userType: user?.userType || null,
      email: user?.email || null,
      fullName: user?.fullName || null,
      mobileNumber: user?.mobileNumber || null,
      profilePic: user?.profilePic || null,
    };

    const eventDetails = {
      eventId: event.eventId,
      eventTitle: event.eventName || null,
      eventName: event.eventName || null,
      eventCategory: Array.isArray(event.eventSports) && event.eventSports.length > 0 ? event.eventSports[0] : null,
      eventType: event.eventType || null,
      eventDateTime: event.eventDateTime,
      eventLocation: event.eventLocation,
      eventImages: event.eventImages || event.gameImages || [],
      gameJoinPrice: safeEventPrice,
    };

    const paymentDetails = {
      paymentId: payment.paymentId,
      status: 'pending',
      originalAmount: originalAmount,
      discountAmount: discountAmount,
      finalAmount: finalAmount,
      finalAmountInCents: amountInCents,
      currency: 'aed',
      promoCode: promoCodeString,
      stripePaymentIntentId: paymentIntent.id,
    };

    const stripePaymentIntent = {
      id: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      amount: paymentIntent.amount,
      amountInDollars: (paymentIntent.amount / 100).toFixed(2),
      currency: paymentIntent.currency,
      status: paymentIntent.status,
      description: paymentIntent.description,
    };

    const stripeCheckoutSession = checkoutSession
      ? {
        id: checkoutSession.id,
        url: checkoutSession.url,
        successUrl: checkoutSession.success_url,
        cancelUrl: checkoutSession.cancel_url,
      }
      : null;

    return res.status(201).json({
      success: true,
      message: 'Booking created. Please complete payment.',
      data: {
        user: userDetails,
        event: eventDetails,
        booking: {
          bookingId: updatedBooking.bookingId,
          status: updatedBooking.status,
          amount: updatedBooking.amount,
          discountAmount: updatedBooking.discountAmount,
          finalAmount: updatedBooking.finalAmount,
          promoCode: updatedBooking.promoCode,
          occurrenceStart: updatedBooking.occurrenceStart || occurrenceStart,
          occurrenceEnd: updatedBooking.occurrenceEnd || occurrenceEnd,
          createdAt: updatedBooking.createdAt,
        },
        occurrence: {
          occurrenceStart,
          occurrenceEnd,
        },
        payment: paymentDetails,
        paymentIntent: stripePaymentIntent,
        checkoutSession: stripeCheckoutSession,
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
        isFreeEvent: false,
        paymentRequired: true,
        paymentStatus: 'pending',
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = bookEvent;