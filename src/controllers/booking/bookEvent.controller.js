const Booking = require('../../models/Booking');
const Payment = require('../../models/Payment');
const PromoCode = require('../../models/PromoCode');
const Event = require('../../models/Event');
const EventJoin = require('../../models/EventJoin');
const User = require('../../models/User');
const stripe = require('stripe');
const { findEventById } = require('../../utils/eventHelper');
const { validateAgeForEvent } = require('../../utils/ageRestriction');

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
    const userId = req.user.id; // MongoDB ObjectId (automatically from logged-in user)
    const eventId = req.params.eventId; // From URL params
    const promoCode = req.query.promoCode || req.body.promoCode || req.body.promo_code; // Optional from query or body

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
    const hasJoined = await EventJoin.hasJoined(userId, event.eventId);
    if (hasJoined) {
      return res.status(400).json({
        success: false,
        error: 'Already joined this event',
      });
    }

    // Check if there's already a pending booking for this user and event
    const existingBookings = await Booking.findByUser(userId, 'pending', 100, 0);
    const existingPendingBooking = existingBookings.find(
      b => b.eventId.toString() === event._id.toString()
    );

    if (existingPendingBooking) {
      // Return existing pending booking with payment intent
      const payment = existingPendingBooking.paymentIntentId 
        ? await Payment.findByStripePaymentIntentId(existingPendingBooking.paymentIntentId)
        : null;

      if (payment && payment.stripePaymentIntentId) {
        const stripeInstance = getStripeInstance();
        try {
          const paymentIntent = await stripeInstance.paymentIntents.retrieve(payment.stripePaymentIntentId);
          
          // Prepare user details response
          const userDetails = {
            userId: user?.userId || null,
            userType: user?.userType || null,
            email: user?.email || null,
            fullName: user?.fullName || null,
            mobileNumber: user?.mobileNumber || null,
            profilePic: user?.profilePic || null,
          };

          // Prepare event details
          const eventDetails = {
            eventId: event.eventId,
            eventTitle: event.eventName || null,
            eventName: event.eventName || null,
            eventCategory: Array.isArray(event.eventSports) && event.eventSports.length > 0 ? event.eventSports[0] : null,
            eventType: event.eventType || null,
            eventDateTime: event.eventDateTime,
            eventLocation: event.eventLocation,
            eventImages: event.eventImages || event.gameImages || [],
            gameJoinPrice: event.gameJoinPrice || 0,
          };

          // Prepare payment details
          const paymentDetails = {
            paymentId: payment.paymentId,
            status: payment.status || 'pending',
            originalAmount: existingPendingBooking.amount,
            discountAmount: existingPendingBooking.discountAmount,
            finalAmount: existingPendingBooking.finalAmount,
            finalAmountInCents: paymentIntent.amount,
            currency: 'usd',
            promoCode: existingPendingBooking.promoCode,
            stripePaymentIntentId: paymentIntent.id,
          };

          // Prepare Stripe payment intent details
          const stripePaymentIntent = {
            id: paymentIntent.id,
            clientSecret: paymentIntent.client_secret,
            amount: paymentIntent.amount,
            amountInDollars: (paymentIntent.amount / 100).toFixed(2),
            currency: paymentIntent.currency,
            status: paymentIntent.status,
            description: paymentIntent.description,
          };
          
          // Try to get or create checkout session for existing booking
          let existingCheckoutSession = null;
          try {
            const frontendUrl = process.env.FRONTEND_URL;
            
            if (frontendUrl && frontendUrl.trim() !== '') {
              // Ensure it's not pointing to backend
              const backendHost = req.get('host');
              if (!frontendUrl.includes(backendHost)) {
                existingCheckoutSession = await stripeInstance.checkout.sessions.create({
              payment_method_types: ['card'],
              line_items: [
                {
                  price_data: {
                    currency: 'usd',
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
          
          const stripeCheckoutSession = existingCheckoutSession ? {
            id: existingCheckoutSession.id,
            url: existingCheckoutSession.url,
            successUrl: existingCheckoutSession.success_url,
            cancelUrl: existingCheckoutSession.cancel_url,
          } : null;
          
          return res.status(200).json({
            success: true,
            message: 'Pending booking found',
            data: {
              // User details
              user: userDetails,
              
              // Event details
              event: eventDetails,
              
              // Booking details
              booking: {
                bookingId: existingPendingBooking.bookingId,
                status: existingPendingBooking.status,
                amount: existingPendingBooking.amount,
                discountAmount: existingPendingBooking.discountAmount,
                finalAmount: existingPendingBooking.finalAmount,
                promoCode: existingPendingBooking.promoCode,
                createdAt: existingPendingBooking.createdAt,
              },
              
              // Payment details
              payment: paymentDetails,
              
              // Stripe Payment Intent
              paymentIntent: stripePaymentIntent,
              
              // Stripe Checkout Session (payment link)
              checkoutSession: stripeCheckoutSession,
              
              // Stripe publishable key
              publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
              
              // Flags
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

    // Get original price
    const eventPrice = Number(event?.gameJoinPrice ?? event?.eventPricePerGuest ?? 0);
  let originalAmount = Number.isNaN(eventPrice) ? 0 : eventPrice;
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
    const isFreeEvent = amountInCents <= 0;

    // STEP 1: Create booking first (before payment)
    const bookingData = {
      userId: userId,
      eventId: event._id,
      paymentId: null, // Will be set after payment is created (if not free)
      paymentIntentId: null, // Will be set after payment intent is created (if not free)
      status: isFreeEvent ? 'booked' : 'pending', // Free events are automatically booked
      amount: originalAmount,
      discountAmount: discountAmount,
      finalAmount: finalAmount,
      promoCode: promoCodeString,
      bookedAt: isFreeEvent ? new Date() : null, // Set bookedAt for free events
    };

    const booking = await Booking.create(bookingData);

    // If it's a free event, skip Stripe payment and directly add user to event
    if (isFreeEvent) {
      // Add user to event immediately for free events
      try {
        await EventJoin.join(userId, event._id);
      } catch (joinError) {
        // User might already be joined, that's okay
        if (joinError.message !== 'Already joined this event') {
          console.error('Error joining event:', joinError);
        }
      }

      // Get updated booking
      const updatedBooking = await Booking.findById(booking.bookingId);

      // Create a booking confirmation URL for free events (no payment needed)
      // Note: This URL should point to frontend, not backend
      // Only generate URL if FRONTEND_URL is explicitly set to avoid backend URL issues
      const frontendUrl = process.env.FRONTEND_URL;
      let bookingConfirmationUrl = null;
      
      if (frontendUrl && frontendUrl.trim() !== '') {
        // Ensure it's not pointing to backend
        const backendHost = req.get('host');
        if (!frontendUrl.includes(backendHost)) {
          bookingConfirmationUrl = `${frontendUrl}/booking/confirmed?booking_id=${updatedBooking.bookingId}`;
        }
      }

      // Prepare user details response
      const userDetails = {
        userId: user?.userId || null,
        userType: user?.userType || null,
        email: user?.email || null,
        fullName: user?.fullName || null,
        mobileNumber: user?.mobileNumber || null,
        profilePic: user?.profilePic || null,
      };

      // Prepare event details
      const eventDetails = {
        eventId: event.eventId,
        eventTitle: event.eventName || null,
        eventName: event.eventName || null,
        eventCategory: Array.isArray(event.eventSports) && event.eventSports.length > 0 ? event.eventSports[0] : null,
        eventType: event.eventType || null,
        eventDateTime: event.eventDateTime,
        eventLocation: event.eventLocation,
        eventImages: event.eventImages || event.gameImages || [],
        gameJoinPrice: event.gameJoinPrice || 0,
      };

      return res.status(201).json({
        success: true,
        message: 'Free event booked successfully',
        data: {
          // User details
          user: userDetails,
          
          // Event details
          event: eventDetails,
          
          // Booking details
          booking: {
            bookingId: updatedBooking.bookingId,
            status: updatedBooking.status, // "booked" for free events
            amount: updatedBooking.amount,
            discountAmount: updatedBooking.discountAmount,
            finalAmount: updatedBooking.finalAmount,
            promoCode: updatedBooking.promoCode,
            bookedAt: updatedBooking.bookedAt,
            createdAt: updatedBooking.createdAt,
          },
          
          // Booking confirmation link (for free events)
          bookingConfirmationUrl: bookingConfirmationUrl,
          
          // Flags
          isFreeEvent: true,
          paymentRequired: false,
          paymentStatus: 'not_required', // No payment needed for free events
        },
      });
    }

    // STEP 2: Create Stripe Payment Intent and Checkout Session (only for paid events)
    const stripeInstance = getStripeInstance();
    let paymentIntent;
    let checkoutSession = null;
    
    // user already fetched above (reuse for checkout session)
    try {
      // Build metadata - only include promoCode if it exists
      const metadata = {
        bookingId: booking.bookingId,
        eventId: event.eventId,
        eventTitle: event.eventName || '',
        eventName: event.eventName || '',
        eventCategory: Array.isArray(event.eventSports) && event.eventSports.length > 0 ? event.eventSports[0] : '',
        eventType: event.eventType || '',
        userId: userId,
      };
      
      // Only add promoCode to metadata if it exists
      if (promoCodeString) {
        metadata.promoCode = promoCodeString;
      }

      // Create Payment Intent
      paymentIntent = await stripeInstance.paymentIntents.create({
        amount: amountInCents,
        currency: 'usd',
        metadata: metadata,
        description: `Payment for event: ${event.eventName || ''}`,
      });
    } catch (stripeError) {
      // If Stripe fails, update booking status to failed
      await Booking.updateStatus(booking.bookingId, 'failed');
      return res.status(400).json({
        success: false,
        error: 'Failed to create payment intent',
        details: stripeError.message,
      });
    }

    // Create Checkout Session for payment link (optional - if Payment Intent succeeds)
    try {
      // Use FRONTEND_URL for success/cancel URLs (frontend pages, not backend API)
      // Only create checkout session if FRONTEND_URL is set
      const frontendUrl = process.env.FRONTEND_URL;
      
      if (!frontendUrl || frontendUrl.trim() === '') {
        console.warn('FRONTEND_URL not set. Skipping checkout session creation.');
        checkoutSession = null;
      } else {
        // Ensure it's not pointing to backend
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
              currency: 'usd',
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
          eventTitle: event.eventName || '',
          eventName: event.eventName || '',
          eventCategory: Array.isArray(event.eventSports) && event.eventSports.length > 0 ? event.eventSports[0] : '',
          eventType: event.eventType || '',
          userId: userId,
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
      // Log error but don't fail - payment intent is still available
      console.error('Failed to create checkout session:', checkoutError);
      checkoutSession = null;
    }

    // STEP 3: Create payment record
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

    // STEP 4: Update booking with payment info
    await Booking.updateStatus(booking.bookingId, 'pending', {
      paymentId: payment.paymentId,
      paymentIntentId: paymentIntent.id,
    });

    // Get updated booking
    const updatedBooking = await Booking.findById(booking.bookingId);

    // Prepare user details response
    const userDetails = {
      userId: user?.userId || null,
      userType: user?.userType || null,
      email: user?.email || null,
      fullName: user?.fullName || null,
      mobileNumber: user?.mobileNumber || null,
      profilePic: user?.profilePic || null,
    };

    // Prepare event details
    const eventDetails = {
      eventId: event.eventId,
      eventTitle: event.eventName || null,
      eventName: event.eventName || null,
      eventCategory: Array.isArray(event.eventSports) && event.eventSports.length > 0 ? event.eventSports[0] : null,
      eventType: event.eventType || null,
      eventDateTime: event.eventDateTime,
      eventLocation: event.eventLocation,
      eventImages: event.eventImages || event.gameImages || [],
      gameJoinPrice: event.gameJoinPrice || 0,
    };

    // Prepare payment details
    const paymentDetails = {
      paymentId: payment.paymentId,
      status: 'pending', // Payment is always pending initially
      originalAmount: originalAmount,
      discountAmount: discountAmount,
      finalAmount: finalAmount,
      finalAmountInCents: amountInCents,
      currency: 'usd',
      promoCode: promoCodeString,
      stripePaymentIntentId: paymentIntent.id,
    };

    // Prepare Stripe payment intent details
    const stripePaymentIntent = {
      id: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      amount: paymentIntent.amount, // Amount in cents
      amountInDollars: (paymentIntent.amount / 100).toFixed(2), // Amount in dollars for display
      currency: paymentIntent.currency,
      status: paymentIntent.status,
      description: paymentIntent.description,
    };

    // Prepare Stripe checkout session (payment link)
    const stripeCheckoutSession = checkoutSession ? {
      id: checkoutSession.id,
      url: checkoutSession.url, // Payment link URL
      successUrl: checkoutSession.success_url,
      cancelUrl: checkoutSession.cancel_url,
    } : null;

    res.status(201).json({
      success: true,
      message: 'Booking created. Please complete payment.',
      data: {
        // User details
        user: userDetails,
        
        // Event details
        event: eventDetails,
        
        // Booking details
        booking: {
          bookingId: updatedBooking.bookingId,
          status: updatedBooking.status, // "pending" for paid events
          amount: updatedBooking.amount,
          discountAmount: updatedBooking.discountAmount,
          finalAmount: updatedBooking.finalAmount,
          promoCode: updatedBooking.promoCode,
          createdAt: updatedBooking.createdAt,
        },
        
        // Payment details
        payment: paymentDetails,
        
        // Stripe Payment Intent (for frontend payment processing)
        paymentIntent: stripePaymentIntent,
        
        // Stripe Checkout Session (payment link)
        checkoutSession: stripeCheckoutSession,
        
        // Stripe publishable key (for frontend)
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
        
        // Flags
        isFreeEvent: false,
        paymentRequired: true,
        paymentStatus: 'pending', // Payment status is always pending initially
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = bookEvent;
