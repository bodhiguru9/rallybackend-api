const Event = require('../../models/Event');
const Waitlist = require('../../models/Waitlist');
const EventJoin = require('../../models/EventJoin');
const User = require('../../models/User');
const Notification = require('../../models/Notification');
const { findEventById, validateEventId } = require('../../utils/eventHelper');
const { getPaginationParams, createPaginationResponse } = require('../../utils/pagination');
const { validateAgeForEvent } = require('../../utils/ageRestriction');

/**
 * @desc    Join waitlist for a private event
 * @route   POST /api/events/:eventId/join-waitlist
 * @access  Private
 */
const joinWaitlist = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.id;

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
        error: `Event not found with ID: ${eventId}. Please verify the event ID is correct.`,
        eventId: eventId,
        suggestion: 'Use GET /api/events/all to see all available events.',
      });
    }

    // Support both old and new field names for backward compatibility
    const isPrivate = event.IsPrivateEvent !== undefined ? event.IsPrivateEvent : (event.visibility === 'private');
    const maxGuest = event.eventMaxGuest !== undefined ? event.eventMaxGuest : (event.gameSpots || 0);
    
    // Check actual booked spots (more accurate than eventTotalAttendNumber)
    const currentJoinedCount = await EventJoin.getParticipantCount(event._id);
    const spotsFull = currentJoinedCount >= maxGuest;

    // Waitlist API is ONLY for events that are FULL (all spots booked)
    // If event is private, user should use private event join API instead
    if (isPrivate) {
      return res.status(400).json({
        success: false,
        error: 'This is a private event. Please use the private event join request endpoint instead.',
        action: 'join-private-event',
        joinPrivateEndpoint: `/api/private-events/${eventId}/join-request`,
      });
    }

    // Waitlist only works when event is FULL
    if (!spotsFull) {
      return res.status(400).json({
        success: false,
        error: 'Event has available spots. Please use the join endpoint instead.',
        spotsInfo: {
          totalSpots: maxGuest,
          spotsBooked: currentJoinedCount,
          spotsLeft: maxGuest - currentJoinedCount,
          spotsFull: false,
        },
        action: 'join',
        joinEndpoint: `/api/events/${eventId}/join`,
      });
    }

    // Check if already in waitlist (use sequential eventId)
    const inWaitlist = await Waitlist.isInWaitlist(userId, event.eventId);
    if (inWaitlist) {
      return res.status(400).json({
        success: false,
        error: 'Request already sent. Waiting for organiser approval.',
      });
    }

    // Check if already joined (in case they were accepted before)
    const hasJoined = await EventJoin.hasJoined(userId, event._id);
    if (hasJoined) {
      return res.status(400).json({
        success: false,
        error: 'You are already a participant in this event',
      });
    }

    // Prevent users from joining their own events
    if (event.creatorId.toString() === userId) {
      return res.status(400).json({
        success: false,
        error: 'You cannot join your own event',
      });
    }

    // Get user details to include in waitlist
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Age restriction check (players only)
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

    // Prepare user details for waitlist
    const userDetails = {
      profilePic: user.profilePic || null,
      fullName: user.fullName || null,
      email: user.email || null,
    };

    // Get creator email
    const creator = await User.findById(event.creatorId);
    const creatorEmail = creator ? creator.email : null;

    // Add to waitlist with user details (use sequential eventId - Waitlist.add will handle conversion)
    const waitlistResult = await Waitlist.add(userId, event.eventId, userDetails);

    // Create notification for organizer (event creator)
    // Waitlist API is only for full events, so notification is always about waitlist
    try {
      const eventName = event.eventName || 'Event';
      // Ensure creatorId is ObjectId (handle both ObjectId and string)
      const { ObjectId } = require('mongodb');
      const creatorIdObjectId = event.creatorId instanceof ObjectId 
        ? event.creatorId 
        : new ObjectId(event.creatorId);
      
      const notificationResult = await Notification.create(
        creatorIdObjectId,
        'event_join_request',
        'Event Full - Waitlist Request',
        `${user.fullName || 'A player'} joined the waitlist for your full event: ${eventName}`,
        {
          userId: userId,
          eventId: event._id.toString(),
          eventName: eventName,
          waitlistId: waitlistResult.waitlistId,
          requestId: waitlistResult.requestId,
          requestType: 'event-join-request',
          spotsFull: true, // Always true for waitlist API
        }
      );
      console.log('✅ Event waitlist request notification created:', notificationResult._id.toString());
    } catch (error) {
      // Don't fail the request if notification creation fails
      console.error('❌ Error creating event waitlist notification:', error.message, error.stack);
    }

    // Get updated waitlist count
    const pendingWaitlistCount = await Waitlist.getWaitlistCount(event.eventId);
    
    // Get joined participants count
    const joinedCount = await EventJoin.getParticipantCount(event._id);
    
    // Calculate available spots
    const availableSpots = Math.max(0, maxGuest - joinedCount);

    // Waitlist API message (always for full events)
    const message = 'You have been added to the waitlist. You will be notified when a spot becomes available.';

    res.status(200).json({
      success: true,
      message: message,
      data: {
        waitlistId: waitlistResult.waitlistId, // Sequential waitlist ID (W1, W2, W3, etc.)
        requestId: waitlistResult.requestId, // Sequential request ID (Request1, Request2, etc.)
        event: {
          eventId: event.eventId,
          gameCreatorName: event.gameCreatorName,
          gameCreatorEmail: event.gameCreatorEmail || creatorEmail,
          gameCreatorProfilePic: event.gameCreatorProfilePic || (creator ? creator.profilePic : null),
        },
        user: {
          userId: user.userId,
          profilePic: user.profilePic,
          fullName: user.fullName,
          email: user.email,
        },
        spotsInfo: {
          totalSpots: maxGuest,
          spotsBooked: joinedCount,
          spotsLeft: availableSpots,
          spotsFull: spotsFull,
        },
        counts: {
          totalSpots: maxGuest,
          joinedSpots: joinedCount,
          availableSpots: availableSpots,
          pendingWaitlist: pendingWaitlistCount, // Updated pending waitlist (increased)
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get my join requests (for users to see their pending requests)
 * @route   GET /api/events/my-requests
 * @access  Private
 * 
 * Returns:
 * - Requests made by the user (as a player joining events) - from waitlist collection
 * - Requests received by the user (as an organiser for their events) - from requests collection
 */
const getMyJoinRequests = async (req, res, next) => {
  try {
    const userId = req.user.id; // This is a string from auth middleware (user._id.toString())
    const userType = req.user.userType;
    const { page, perPage, skip } = getPaginationParams(req.query.page, 20);

    const { getDB } = require('../../config/database');
    const { ObjectId } = require('mongodb');
    const db = getDB();
    const waitlistCollection = db.collection('waitlist');
    const eventJoinRequestsCollection = db.collection('eventJoinRequests');
    const requestsCollection = db.collection('requests');
    const eventsCollection = db.collection('events');

    // Convert userId string to ObjectId
    let userObjectId;
    try {
      userObjectId = new ObjectId(userId);
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID format',
      });
    }
    
    // 1. Get requests made BY this user (as a player joining events):
    // - waitlist collection (full events)
    // - eventJoinRequests collection (private events not full at request time)
    // Query with ObjectId to match how it's stored (Waitlist.add stores as ObjectId)
    const waitlistRequests = await waitlistCollection
      .find({
        userId: userObjectId, // Use ObjectId for query
        status: 'pending',
      })
      .sort({ createdAt: -1 })
      .toArray();

    const pendingEventRequests = await eventJoinRequestsCollection
      .find({
        userId: userObjectId,
        status: 'pending',
      })
      .sort({ createdAt: -1 })
      .toArray();
    
    // 2. Get requests received BY this user (as an organiser) - from requests collection
    let organiserRequests = [];
    if (userType === 'organiser') {
      organiserRequests = await requestsCollection
        .find({
          organiserId: userObjectId,
          status: 'pending',
        })
        .sort({ createdAt: -1 })
        .toArray();
    }
    
    // Combine all types of requests
    const allRequests = [
      ...waitlistRequests.map((r) => ({ ...r, requestType: 'event-waitlist' })),
      ...pendingEventRequests.map((r) => ({ ...r, requestType: 'event-pending' })),
      ...organiserRequests.map((r) => ({ ...r, requestType: 'organiser-join' })),
    ];
    
    // Sort by creation date (newest first) and apply pagination
    allRequests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const totalCount = allRequests.length;
    const paginatedRequests = allRequests.slice(skip, skip + perPage);
    const pagination = createPaginationResponse(totalCount, page, perPage);

    // Get event IDs from event requests
    const eventIds = [...waitlistRequests, ...pendingEventRequests].map((r) => r.eventId);
    const events = eventIds.length > 0 
      ? await eventsCollection.find({ _id: { $in: eventIds } }).toArray()
      : [];

    // Get user IDs from organiser requests
    const organiserRequestUserIds = organiserRequests.map((r) => r.userId);
    const usersCollection = db.collection('users');
    const organiserRequestUsers = organiserRequestUserIds.length > 0
      ? await usersCollection.find({ _id: { $in: organiserRequestUserIds } }).toArray()
      : [];

    // Get current user details
    const currentUser = await User.findById(userId);
    
    // Process all requests
    const requestsWithDetails = await Promise.all(
      paginatedRequests.map(async (request) => {
        // Check if it's an event request (has eventId) or organiser request (has organiserId)
        const isEventRequest = !!request.eventId;
        
        if (isEventRequest && request.requestType !== 'organiser-join') {
          // This is an event request (pending or waitlist)
          const event = events.find((e) => e._id.toString() === request.eventId.toString());
          
          // Get creator email if event exists
          let creatorEmail = null;
          let creatorProfilePic = null;
          if (event) {
            const creator = await User.findById(event.creatorId);
            creatorEmail = creator ? creator.email : null;
            creatorProfilePic = creator ? creator.profilePic : null;
          }
          
          // Use stored user details from waitlist if available, otherwise fallback to current user document
          const userData = {
            userId: currentUser ? currentUser.userId : null,
            profilePic: request.profilePic || (currentUser ? currentUser.profilePic : null),
            fullName: request.fullName || (currentUser ? currentUser.fullName : null),
            email: request.email || (currentUser ? currentUser.email : null),
          };
          
          return {
            type: 'event-join-request',
            requestSubtype: request.requestType === 'event-pending' ? 'pending-request' : 'waitlist',
            requestId: request.requestType === 'event-waitlist' ? (request.requestId || null) : (request.joinRequestId || null),
            user: userData,
            event: event
              ? {
                  eventId: event.eventId,
                  eventTitle: event.eventName || null,
                  eventName: event.eventName || null,
                  eventCategory: Array.isArray(event.eventSports) && event.eventSports.length > 0 ? event.eventSports[0] : null,
                  eventType: event.eventType || null,
                  gameStartDate: event.gameStartDate,
                  gameTime: event.gameTime,
                  gameLocationArena: event.gameLocationArena,
                  gameCreatorName: event.gameCreatorName,
                  gameCreatorEmail: event.gameCreatorEmail || creatorEmail,
                  gameCreatorProfilePic: event.gameCreatorProfilePic || creatorProfilePic,
                  visibility: event.visibility,
                }
              : null,
            status: request.status,
            requestedAt: request.createdAt,
          };
        } else {
          // This is an organiser join request (user requested to join an organiser)
          const requestingUser = organiserRequestUsers.find((u) => u._id.toString() === request.userId.toString()) || null;
          
          return {
            type: 'organiser-join-request', // Indicates this is a request to join an organiser
            requestId: request.requestId || null,
            user: requestingUser ? {
              userId: requestingUser.userId,
              userType: requestingUser.userType,
              email: requestingUser.email,
              profilePic: requestingUser.profilePic,
              fullName: requestingUser.fullName,
              ...(requestingUser.userType === 'player' && {
                sport1: requestingUser.sport1,
                sport2: requestingUser.sport2,
              }),
            } : null,
            organiser: currentUser ? {
              userId: currentUser.userId,
              fullName: currentUser.fullName,
              communityName: currentUser.communityName,
              profilePic: currentUser.profilePic,
            } : null,
            status: request.status,
            requestedAt: request.createdAt,
          };
        }
      })
    );

    // Calculate total count
    const waitlistCount = await waitlistCollection.countDocuments({
      userId: userObjectId, // Use ObjectId for query
      status: 'pending',
    });

    const pendingEventCount = await eventJoinRequestsCollection.countDocuments({
      userId: userObjectId,
      status: 'pending',
    });
    
    const organiserCount = userType === 'organiser'
      ? await requestsCollection.countDocuments({
          organiserId: userObjectId,
          status: 'pending',
        })
      : 0;

    res.status(200).json({
      success: true,
      data: {
        requests: requestsWithDetails,
        eventJoinRequests: waitlistCount + pendingEventCount, // Count of requests made by user to join events
        organiserJoinRequests: organiserCount, // Count of requests received by user (as organiser)
        pagination,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  joinWaitlist,
  requestToJoinEvent: joinWaitlist, // Keep old name for backward compatibility
  getMyJoinRequests,
};

