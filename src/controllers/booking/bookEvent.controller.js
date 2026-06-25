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

    // Use occurrenceEnd if available, otherwise default to 1 hour after occurrenceStart
    const eventEndTimeForBooking = occurrenceEnd 
      ? new Date(occurrenceEnd) 
      : new Date(new Date(occurrenceStart).getTime() + 60 * 60 * 1000);

    if (new Date() > eventEndTimeForBooking) {
      return res.status(400).json({
        success: false,
        error: 'Cannot book an ended occurrence',
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

    // Fetch organiser details dynamically
    let organiserName = event.eventCreatorName || '';
    if (event.creatorId) {
      try {
        const organiser = await User.findById(event.creatorId);
        if (organiser) {
          organiserName = organiser.communityName || organiser.fullName || event.eventCreatorName || '';
        }
      } catch (err) {
        console.error('Failed to fetch organiser details for booking:', err);
      }
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

    // Parse guest count EARLY so it's available throughout (including the pending-booking reuse path)
    const guestsCount = parseInt(req.query.guestsCount || req.body.guestsCount || req.body.guests_count || 1, 10);
    const safeGuestsCount = isNaN(guestsCount) || guestsCount < 1 ? 1 : guestsCount;

    // Enforce spot capacity: currentOccupied + safeGuestsCount must not exceed eventMaxGuest
    const maxGuest = event.eventMaxGuest !== undefined ? event.eventMaxGuest : (event.gameSpots || 0);
    const currentOccupied = await EventJoin.getParticipantCount(event._id, occurrenceStart);
    const availableSpots = maxGuest - currentOccupied;

    if (availableSpots <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Event is full. All spots have been booked.',
        message: 'Please join the waitlist to be notified when a spot becomes available.',
        spotsInfo: { totalSpots: maxGuest, spotsBooked: currentOccupied, spotsLeft: 0, spotsFull: true },
      });
    }

    if (safeGuestsCount > availableSpots) {
      return res.status(400).json({
        success: false,
        error: `Only ${availableSpots} spot(s) available. Your party size of ${safeGuestsCount} exceeds the available spots.`,
        spotsInfo: { totalSpots: maxGuest, spotsBooked: currentOccupied, spotsLeft: availableSpots },
      });
    }

    // Skip reuse for Apple Pay — old PaymentIntents may have setup_future_usage
    // which is incompatible with Apple Pay tokens.
    const existingPendingBooking = await Booking.findExactPendingBooking(userId, event._id, occurrenceStart, safeGuestsCount);

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

          // Skip checkout session creation in the reuse path as well
          const stripeCheckoutSession = null;

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

    // guestsCount and safeGuestsCount are now declared above (after hasJoined check)
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
      guestsCount: safeGuestsCount,
      bookedAt: isFreeEvent ? new Date() : null,
    };

    const booking = await Booking.create(bookingData);

    // If it's a free event, skip Stripe payment and directly add user to event
    if (isFreeEvent) {
      try {
        await EventJoin.join(userId, event._id, occurrenceStart, {
          occurrenceEnd,
          parentEventId: event.eventId,
          guestsCount: safeGuestsCount,
          capacityLimit: maxGuest,
        });
      } catch (joinError) {
        await Booking.updateStatus(booking.bookingId, 'failed');
        const isDuplicate = joinError.code === 11000 || joinError.message === 'Already joined this occurrence';
        return res.status(400).json({
          success: false,
          error: isDuplicate ? 'Already joined this occurrence' : 'Failed to join event',
          details: joinError.message,
        });
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
        sendBookingConfirmedNotification({
          user,
          event,
          booking: updatedBooking,
        }).catch(err => console.error('Booking confirmation notification failed:', err));

        // Notify organiser
        sendHostBookingNotification({
          player: user,
          event,
          booking: updatedBooking,
        }).catch(err => console.error('Host booking notification failed:', err));
      } catch (notificationError) {
        console.error('Notification dispatch failed:', notificationError);
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
      // Customer / Player details
      customerName: user?.fullName || '',
      mobileNumber: user?.mobileNumber || '',
      playerId: user?.userId ? String(user.userId) : '',
      playerName: user?.fullName || '',
      // Organiser details
      organiserId: event.creatorId ? String(event.creatorId) : '',
      organiserName: organiserName,
      // Party size
      partySize: String(safeGuestsCount),
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
      }, {
        idempotencyKey: booking.bookingId
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
    // Skip checkout session creation as the native app uses Payment Intents directly
    checkoutSession = null;

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