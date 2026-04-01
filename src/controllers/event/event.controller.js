const Event = require('../../models/Event');
const User = require('../../models/User');
const EventJoin = require('../../models/EventJoin');
const Waitlist = require('../../models/Waitlist');
const Follow = require('../../models/Follow');
const Booking = require('../../models/Booking');
const Payment = require('../../models/Payment');
const { validateEvent, validateEventFilters } = require('../../validators/event.validator');
const { uploadEventMedia } = require('../../middleware/eventUpload');
const { findEventById, validateEventId } = require('../../utils/eventHelper');
const { processEventData, formatEventResponse } = require('../../utils/eventFields');
const fs = require('fs');
const EventJoinRequest = require('../../models/EventJoinRequest');
const { getDB } = require('../../config/database');
const { ObjectId } = require('mongodb');

/**
 * @desc    Create a new event
 * @route   POST /api/events
 * @access  Private (Organiser only)
 */
const createEvent = async (req, res, next) => {
  uploadEventMedia(req, res, async (err) => {
    try {
      if (err) {
        return res.status(400).json({
          success: false,
          error: err.message || 'File upload error',
        });
      }

      // Verify user is organiser or super admin
      const { isSuperAdmin } = require('../../middleware/auth');
      if (req.user.userType !== 'organiser' && !isSuperAdmin(req)) {
        return res.status(403).json({
          success: false,
          error: 'Only organisers can create events',
          userType: req.user.userType,
        });
      }

      // Get user details for event creation
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
        });
      }

      // Validate input
      const validation = validateEvent(req.body);
      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          error: validation.errors,
        });
      }

      // Validate image count (optional, but if provided, max 5 images)
      const imageFiles = req.files?.eventImage || req.files?.game_image;
      if (imageFiles) {
        const imageCount = Array.isArray(imageFiles) ? imageFiles.length : 1;
        if (imageCount > 5) {
          return res.status(400).json({
            success: false,
            error: 'Maximum 5 images allowed. Please upload 5 or fewer images.',
            provided: imageCount,
            maxAllowed: 5,
          });
        }
      }

      // Get organiser's full name automatically
      const organiserFullName = user.fullName || req.body.eventCreatorName?.trim() || 'Unknown Organiser';
      const organiserEmail = user.email || null;
      const organiserProfilePic = user.profilePic || null;

      // Process event images (optional - up to 5 images allowed)
      // Support both old field name (game_image) and new field name (eventImage)
      // Use S3 URLs from req.files
      let eventImages = [];
      
      if (imageFiles) {
        if (Array.isArray(imageFiles)) {
          // Limit to maximum 5 images
          const imagesToProcess = imageFiles.slice(0, 5);
          // Use S3 location (public URL) instead of local path
          eventImages = imagesToProcess.map((file) => file.location);
          
          // Warn if more than 5 images were provided
          if (imageFiles.length > 5) {
            console.warn(`More than 5 images provided. Only the first 5 images will be used.`);
          }
        } else {
          // Handle single file (backward compatibility)
          // Use S3 location (public URL) instead of local path
          eventImages = [imageFiles.location];
        }
      }
      // If no images provided, eventImages will remain an empty array (optional)

      // Prepare event data using centralized function
      const organiserData = {
        fullName: organiserFullName,
        email: organiserEmail,
        profilePic: organiserProfilePic,
      };
      
      const processedData = processEventData(req.body, organiserData);
      
      // Handle draft saving - if eventSavedraft is true, save as draft but don't make it live
      // The processEventData function already handles this, but we ensure it's set correctly
      if (req.body.eventSavedraft === 'true' || req.body.eventSavedraft === true || 
          req.body.eventSaveDraft === 'true' || req.body.eventSaveDraft === true) {
        processedData.eventStatus = 'draft';
      }
      
      // Process event video (optional)
      // Support both old field name (game_video) and new field name (eventVideo)
      // Use S3 URL from req.files
      let eventVideo = null;
      const videoFile = req.files?.eventVideo || req.files?.game_video;
      if (videoFile) {
        const video = Array.isArray(videoFile) ? videoFile[0] : videoFile;
        // Use S3 location (public URL) instead of local path
        eventVideo = video.location;
      }
      
      // Set timestamps for event creation
      const now = new Date();
      
      const eventData = {
        creatorId: req.user.id,
        ...processedData,
        gameImages: eventImages, // Store in gameImages for backward compatibility
        gameVideo: eventVideo, // Store in gameVideo for backward compatibility
        eventImages: eventImages, // Store in eventImages (max 5 images, optional)
        eventVideo: eventVideo, // Store in eventVideo (optional)
        createdAt: now, // Timestamp for creation
        updatedAt: now, // Timestamp for last update
      };

      // Create event
      const event = await Event.create(eventData);

      res.status(201).json({
        success: true,
        message: eventData.eventStatus === 'draft' ? 'Event saved as draft successfully' : 'Event created successfully',
        data: {
          event: formatEventResponse(event),
        },
      });
    } catch (error) {
      // Files are already uploaded to S3, no need to delete
      next(error);
    }
  });
};

/**
 * @desc    Get event details
 * @route   GET /api/events/:eventId
 * @access  Public
 */
const getEventDetails = async (req, res, next) => {
  try {
    const { eventId } = req.params;

    // Validate eventId format
    const validation = validateEventId(eventId);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: validation.error,
        eventId: eventId,
      });
    }

    // Find event by either sequential ID or ObjectId
    const event = await findEventById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        error: `Event not found with ID: ${eventId}. Please check if the event exists.`,
        eventId: eventId,
        suggestion: 'Use GET /api/events/all to see all available events.',
      });
    }

    // If event is a draft, only the creator can view it
    if (event.status === 'draft') {
      if (!req.user || req.user.id !== event.creatorId.toString()) {
        return res.status(404).json({
          success: false,
          error: 'Event not found',
          eventId: eventId,
          message: 'Draft events are only visible to their creators.',
        });
      }
    }

    // Get creator/organiser details (only required fields)
    const creator = await User.findById(event.creatorId);
    let creatorData = null;
    
    if (creator && creator.userType === 'organiser') {
      creatorData = {
        userId: creator.userId,
        email: creator.email,
        profilePic: creator.profilePic,
        fullName: creator.fullName,
        communityName: creator.communityName,
        eventsCreated: creator.eventsCreated || 0,
        totalAttendees: creator.totalAttendees || 0,
      };
    }

    // Use MongoDB ObjectId from found event for database operations
    const mongoEventId = event._id;

    // Support both old and new field names for backward compatibility
    const isPrivate = event.IsPrivateEvent !== undefined ? event.IsPrivateEvent : (event.visibility === 'private');
    const approvalRequired = event.eventApprovalRequired === true || event.eventApprovalReq === true;
    const maxGuest = event.eventMaxGuest !== undefined ? event.eventMaxGuest : (event.gameSpots || 0);

    // Get actual booked participants count (more accurate than eventTotalAttendNumber)
    let participantsCount = 0;
    let participants = [];
    if (!isPrivate || (req.user && req.user.id === event.creatorId.toString())) {
      participantsCount = await EventJoin.getParticipantCount(mongoEventId);
      participants = await EventJoin.getEventParticipants(mongoEventId, null, 10, 0); // Get first 10 participants (matching getAllEvents)
    }

    // Get waitlist count (for private or approval-required events when user is creator)
    let waitlistCount = 0;
    let waitlist = [];
    if ((isPrivate || approvalRequired) && req.user && req.user.id === event.creatorId.toString()) {
      waitlistCount = await Waitlist.getWaitlistCount(mongoEventId);
      waitlist = await Waitlist.getEventWaitlist(mongoEventId, 10, 0); // Get first 10 waitlist items (matching getAllEvents)
    }

    // Calculate spots information
    const spotsFull = participantsCount >= maxGuest;
    const availableSpots = Math.max(0, maxGuest - participantsCount);
    const spotsBooked = participantsCount;
    const spotsLeft = availableSpots;

    // Get user's join status if authenticated (also exposed as userStatus)
    let userJoinStatus = null;
    let isJoined = null;
    let isPending = null;
    let isLeave = null;
    if (req.user) {
      if (!isPrivate && !approvalRequired) {
        const hasJoined = await EventJoin.hasJoined(req.user.id, mongoEventId);
        const inWaitlist = await Waitlist.isInWaitlist(req.user.id, mongoEventId);
        userJoinStatus = {
          hasJoined,
          inWaitlist,
          canJoin: !hasJoined && !spotsFull && !inWaitlist,
          action: hasJoined ? 'joined' : inWaitlist ? 'requested' : spotsFull ? 'join-waitlist' : 'join',
        };
        isJoined = hasJoined;
        isPending = inWaitlist;
        isLeave = !hasJoined && !inWaitlist;
      } else {
        // Private or approval-required event
        const inWaitlist = await Waitlist.isInWaitlist(req.user.id, mongoEventId);
        const activeReq = await EventJoinRequest.findActiveByUserAndEvent(req.user.id, mongoEventId);
        const hasJoined = await EventJoin.hasJoined(req.user.id, mongoEventId);

        // If request accepted but payment not done yet, treat as not joined.
        let paymentDone = false;
        try {
          const db = getDB();
          const bookingsCollection = db.collection('bookings');
          const userObjectId = new ObjectId(req.user.id);
          const booked = await bookingsCollection.findOne({ userId: userObjectId, eventId: mongoEventId, status: 'booked' });
          paymentDone = !!booked;
        } catch (e) {
          // best effort
        }

        // Check if user has fully joined (joined AND payment done if event has price)
        const joinedAfterPayment = hasJoined && (event.gameJoinPrice ? paymentDone : true);
        
        // isPending should be true if:
        // - User has NOT fully joined (payment not done), AND
        // - User has an active request (pending or accepted) OR is in waitlist
        const hasActiveRequest = !!activeReq;
        const isAcceptedButUnpaid = activeReq?.status === 'accepted' && !joinedAfterPayment;
        
        userJoinStatus = {
          hasJoined: joinedAfterPayment,
          inWaitlist,
          hasRequest: hasActiveRequest,
          requestStatus: activeReq?.status || null,
          canRequest: !joinedAfterPayment && !inWaitlist && !hasActiveRequest,
          action: joinedAfterPayment
            ? 'joined'
            : isAcceptedButUnpaid
              ? 'payment-pending'
              : (inWaitlist || hasActiveRequest)
                ? 'requested'
                : 'request-join',
        };
        
        // isJoined: true only if user has joined AND payment is done (if event has price)
        isJoined = joinedAfterPayment;
        
        // isPending: true if user has NOT fully joined AND has pending request/waitlist
        // This includes: pending requests, accepted requests (payment pending), or waitlist
        isPending = !joinedAfterPayment && (inWaitlist || hasActiveRequest);
        
        isLeave = !joinedAfterPayment && !inWaitlist && !hasActiveRequest;
      }
    } else {
      // Not authenticated - show appropriate action based on visibility
      userJoinStatus = {
        action: !isPrivate && !approvalRequired ? (spotsFull ? 'join-waitlist' : 'join') : 'request-join',
        requiresAuth: true,
      };
      isJoined = false;
      isPending = false;
      isLeave = false;
    }

    // Get payment details if user is authenticated and has a booking for this event
    let paymentStatus = 'not_required'; // Default for free events or events without payment
    let paymentDetails = null;
    let bookingDetails = null;
    
    if (req.user) {
      try {
        // Find user's booking for this event
        const userBookings = await Booking.findByUser(req.user.id, null, 100, 0);
        const relatedBooking = userBookings.find(
          (booking) => booking.eventId.toString() === mongoEventId.toString()
        );
        
        if (relatedBooking) {
          bookingDetails = {
            bookingId: relatedBooking.bookingId,
            status: relatedBooking.status, // pending/booked/cancelled/failed
            joinedAt: null, // Will be set if we can get it from EventJoin
          };
          
          // Try to get joinedAt from EventJoin
          if (isJoined) {
            try {
              const db = getDB();
              const joinsCollection = db.collection('eventJoins');
              const userObjectId = new ObjectId(req.user.id);
              const joinRecord = await joinsCollection.findOne({
                userId: userObjectId,
                eventId: mongoEventId,
              });
              if (joinRecord) {
                bookingDetails.joinedAt = joinRecord.joinedAt || joinRecord.createdAt;
              }
            } catch (joinError) {
              // If there's an error, just skip joinedAt
              console.error('Error fetching join record:', joinError);
            }
          }
          
          // Check if event is free (price is 0)
          const eventPrice = event.eventPricePerGuest || event.gameJoinPrice || 0;
          
          if (eventPrice > 0 && relatedBooking.paymentId) {
            // Fetch payment details
            const payment = await Payment.findById(relatedBooking.paymentId);
            
            if (payment) {
              // Map payment status to user-friendly values
              const paymentStatusMap = {
                'pending': 'pending',
                'success': 'done',
                'failed': 'cancelled',
                'refunded': 'cancelled'
              };
              
              paymentStatus = paymentStatusMap[payment.status] || payment.status;
              
              paymentDetails = {
                paymentId: payment.paymentId,
                amount: payment.amount,
                discountAmount: payment.discountAmount || 0,
                finalAmount: payment.finalAmount,
                promoCode: payment.promoCode || null,
                status: payment.status, // Original status from payment
                paymentMethod: payment.paymentMethod || 'stripe',
                createdAt: payment.createdAt,
                updatedAt: payment.updatedAt,
              };
            } else {
              // Payment ID exists but payment not found - might be pending
              paymentStatus = 'pending';
            }
          } else if (eventPrice === 0) {
            // Free event - payment not required, but user has joined
            paymentStatus = 'done';
          } else if (relatedBooking.status === 'booked') {
            // Booking is confirmed but no payment record - likely free event or payment completed
            paymentStatus = 'done';
          } else if (relatedBooking.status === 'pending') {
            // Booking is pending - payment might be pending
            paymentStatus = 'pending';
          } else if (relatedBooking.status === 'cancelled' || relatedBooking.status === 'failed') {
            // Booking is cancelled or failed
            paymentStatus = 'cancelled';
          }
        } else {
          // No booking found but user might have joined - check if it's a free event
          const eventPrice = event.eventPricePerGuest || event.gameJoinPrice || 0;
          if (eventPrice === 0 && isJoined) {
            paymentStatus = 'done'; // Free event, no payment needed
          }
        }
      } catch (paymentError) {
        // If there's an error fetching payment details, just log it and continue
        console.error('Error fetching payment details:', paymentError);
        // Keep default values
      }
    }

    // Format response to match getAllEvents structure
    const eventData = {
      ...formatEventResponse(event),
      eventApprovalReq: event.eventApprovalReq !== undefined ? event.eventApprovalReq : false,
      eventApprovalRequired: event.eventApprovalRequired !== undefined ? event.eventApprovalRequired : false,
      approvalRequired,
      approvalStatus: approvalRequired ? 'required' : 'not_required',
      creator: creatorData,
      participants: participants,
      participantsCount: participantsCount,
      waitlist: waitlist,
      waitlistCount: waitlistCount,
      userJoinStatus: userJoinStatus,
      userStatus: userJoinStatus,
      isJoined,
      isPending,
      isLeave,
      spotsInfo: {
        totalSpots: maxGuest,
        spotsBooked: spotsBooked,
        spotsLeft: spotsLeft,
        spotsFull: spotsFull,
      },
      availableSpots: availableSpots,
      isFull: spotsFull, // Keep for backward compatibility
      ...(bookingDetails && { booking: bookingDetails }),
      payment: {
        paymentStatus: paymentStatus, // pending/done/cancelled/not_required
        ...(paymentDetails || {}), // Include full payment details if available
      },
    };

    res.status(200).json({
      success: true,
      message: 'Event details retrieved successfully',
      data: {
        event: eventData,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get events with filters
 * @route   GET /api/events
 * @access  Public
 */
const getEvents = async (req, res, next) => {
  try {
    const filters = {
      eventType: req.query.eventType,
      eventCreatorName: req.query.eventCreatorName,
      eventSports: req.query.eventSports,
      IsPrivateEvent: req.query.IsPrivateEvent || req.query.isPrivateEvent,
      eventStatus: req.query.eventStatus || req.query.status,
      startDate: req.query.startDate, // Filter events from this date onwards (ISO format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)
      endDate: req.query.endDate, // Filter events up to this date (ISO format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)
      sortBy: req.query.sortBy, // 'date' to sort by eventDateTime, default sorts by createdAt
    };

    // Validate filters
    const filterValidation = validateEventFilters(filters);
    if (!filterValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: filterValidation.errors,
      });
    }

    const limit = parseInt(req.query.limit) || 50;
    const skip = parseInt(req.query.skip) || 0;

    const events = await Event.findWithFilters(filters, limit, skip);

    // Get creator details for each event
        const eventsWithCreators = await Promise.all(
          events.map(async (event) => {
            const creator = await User.findById(event.creatorId);
            return {
              ...formatEventResponse(event),
              creator: creator
                ? {
                    userId: creator.userId,
                    fullName: creator.fullName,
                    profilePic: creator.profilePic,
                    communityName: creator.communityName,
                    eventsCreated: creator.eventsCreated || 0,
                    totalAttendees: creator.totalAttendees || 0,
                  }
                : null,
            };
          })
        );

    res.status(200).json({
      success: true,
      data: {
        events: eventsWithCreators,
        limit,
        skip,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get events created by organiser
 * @route   GET /api/events/my-events
 * @access  Private (Organiser only)
 */
const getMyEvents = async (req, res, next) => {
  try {
    const organiserId = req.user.id;

    // Verify user is organiser
    const user = await User.findById(organiserId);
    if (!user || user.userType !== 'organiser') {
      return res.status(403).json({
        success: false,
        error: 'Only organisers can view their events',
      });
    }

    const limit = parseInt(req.query.limit) || 50;
    const skip = parseInt(req.query.skip) || 0;

    const events = await Event.findByCreator(organiserId, limit, skip);

    // Get organiser's email
    const organiserEmail = user.email || null;

    const eventsData = events.map((event) => ({
      ...formatEventResponse(event),
    }));

    res.status(200).json({
      success: true,
      data: {
        events: eventsData,
        limit,
        skip,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get events created by logged-in organiser
 * @route   GET /api/events/organiser/created-events
 * @access  Private (Organiser only)
 */
const getOrganiserCreatedEvents = async (req, res, next) => {
  try {
    const organiserId = req.user.id;

    // Verify user is organiser
    const user = await User.findById(organiserId);
    if (!user || user.userType !== 'organiser') {
      return res.status(403).json({
        success: false,
        error: 'Only organisers can view their created events',
      });
    }

    // Pagination support
    let page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    // Get total count for pagination first
    const totalCount = await Event.getEventCount(organiserId);
    const totalPages = Math.ceil(totalCount / limit) || 1;

    // Clamp page to available range
    if (page > totalPages) {
      page = totalPages;
    }
    if (page < 1) {
      page = 1;
    }
    const skip = (page - 1) * limit;

    // Get events created by this organiser
    const events = await Event.findByCreator(organiserId, limit, skip);

    // Format events with full details
    const eventsData = await Promise.all(
      events.map(async (event) => {
        // Get participants count
        let participantsCount = 0;
        const isPrivate = event.IsPrivateEvent !== undefined ? event.IsPrivateEvent : (event.visibility === 'private');
        
        if (!isPrivate) {
          participantsCount = await EventJoin.getParticipantCount(event._id);
        }

        // Get waitlist count for private events
        let waitlistCount = 0;
        if (isPrivate) {
          waitlistCount = await Waitlist.getWaitlistCount(event._id);
        }

        return {
          ...formatEventResponse(event),
          participantsCount: participantsCount,
          waitlistCount: waitlistCount,
          isCreator: true, // Always true since these are created by the organiser
        };
      })
    );

    res.status(200).json({
      success: true,
      message: 'Organiser created events retrieved successfully',
      data: {
        events: eventsData,
        pagination: {
          total: totalCount,
          totalPages: totalPages,
          currentPage: page,
          limit: limit,
          skip: skip,
          hasMore: skip + limit < totalCount,
          hasPrevious: page > 1,
        },
        organiser: {
          userId: user.userId,
          fullName: user.fullName,
          email: user.email,
          profilePic: user.profilePic,
          eventsCreated: user.eventsCreated || 0,
          totalAttendees: user.totalAttendees || 0,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get event creator profile by eventId
 * @route   GET /api/events/:eventId/creator
 * @access  Public (but shows follow status if authenticated)
 */
const getEventCreatorProfile = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const authenticatedUserId = req.user?.id; // Optional - user may not be logged in

    // Validate eventId format
    const validation = validateEventId(eventId);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: validation.error,
        eventId: eventId,
      });
    }

    // Find event by either sequential ID or ObjectId
    const event = await findEventById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        error: `Event not found with ID: ${eventId}. Please check if the event exists.`,
        eventId: eventId,
        suggestion: 'Use GET /api/events/all to see all available events.',
      });
    }

    // If event is a draft, only the creator can view the creator profile
    if (event.eventStatus === 'draft' || event.status === 'draft') {
      if (!req.user || req.user.id !== event.creatorId.toString()) {
        return res.status(404).json({
          success: false,
          error: 'Event not found',
          eventId: eventId,
          message: 'Draft events are only visible to their creators.',
        });
      }
    }

    // Get creator details
    const creator = await User.findById(event.creatorId);
    if (!creator) {
      return res.status(404).json({
        success: false,
        error: 'Event creator not found',
        eventId: eventId,
      });
    }

    // Prepare creator profile response
    const creatorProfile = {
      userId: creator.userId,
      mongoId: creator._id.toString(),
      userType: creator.userType,
      email: creator.email,
      mobileNumber: creator.mobileNumber,
      profilePic: creator.profilePic,
      isEmailVerified: creator.isEmailVerified || false,
      isMobileVerified: creator.isMobileVerified || false,
      createdAt: creator.createdAt,
      updatedAt: creator.updatedAt,
    };

    // Add type-specific fields
    if (creator.userType === 'player') {
      creatorProfile.fullName = creator.fullName;
      creatorProfile.dob = creator.dob;
      creatorProfile.gender = creator.gender;
      creatorProfile.sport1 = creator.sport1;
      creatorProfile.sport2 = creator.sport2;
      creatorProfile.sports = creator.sports || [];
      creatorProfile.followingCount = creator.followingCount || 0;
    } else if (creator.userType === 'organiser') {
      creatorProfile.fullName = creator.fullName;
      creatorProfile.yourBest = creator.yourBest;
      creatorProfile.communityName = creator.communityName;
      creatorProfile.yourCity = creator.yourCity;
      creatorProfile.sport1 = creator.sport1;
      creatorProfile.sport2 = creator.sport2;
      creatorProfile.sports = creator.sports || [];
      creatorProfile.bio = creator.bio;
      creatorProfile.instagramLink = creator.instagramLink || null;
      creatorProfile.profileVisibility = creator.profileVisibility || 'private';
      
      // Get actual follower count from follows collection
      const followerCount = await Follow.getFollowerCount(creator._id.toString());
      creatorProfile.followersCount = followerCount;
      
      creatorProfile.eventsCreated = creator.eventsCreated || 0;
      creatorProfile.totalAttendees = creator.totalAttendees || 0;
      creatorProfile.followingCount = creator.followingCount || 0;

      // If user is authenticated, check if they are following this organiser
      if (authenticatedUserId) {
        const isFollowing = await Follow.isFollowing(authenticatedUserId, creator._id.toString());
        creatorProfile.isFollowing = isFollowing;
      } else {
        creatorProfile.isFollowing = false;
      }

      // Show if organiser can be followed (is public)
      creatorProfile.canFollow = creator.profileVisibility === 'public';
    }

    // Include event information
    const eventInfo = {
      eventId: event.eventId,
      eventTitle: event.eventName || null,
      eventName: event.eventName || null,
      eventCategory: Array.isArray(event.eventSports) && event.eventSports.length > 0 ? event.eventSports[0] : null,
      eventType: event.eventType || null,
      eventDateTime: event.eventDateTime || event.gameStartDate || null,
    };

    res.status(200).json({
      success: true,
      message: 'Event creator profile retrieved successfully',
      data: {
        creator: creatorProfile,
        event: eventInfo,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createEvent,
  getEventDetails,
  getEvents,
  getMyEvents,
  getOrganiserCreatedEvents,
  getEventCreatorProfile,
};

