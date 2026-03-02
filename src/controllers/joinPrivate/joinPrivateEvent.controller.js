const Event = require('../../models/Event');
const Waitlist = require('../../models/Waitlist');
const EventJoinRequest = require('../../models/EventJoinRequest');
const EventJoin = require('../../models/EventJoin');
const User = require('../../models/User');
const Notification = require('../../models/Notification');
const { findEventById, validateEventId } = require('../../utils/eventHelper');
const { validateAgeForEvent } = require('../../utils/ageRestriction');

/**
 * @desc    Request to join a private event
 * @route   POST /api/private-events/:eventId/join-request
 * @access  Private
 * 
 * Sends a join request to the organizer for a private event.
 * Organizer receives a notification.
 */
const joinPrivateEventRequest = async (req, res, next) => {
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
    const approvalRequired = event.eventApprovalRequired === true || event.eventApprovalReq === true;

    // Allow: private events OR events with approval required (one join-request API for both)
    if (!isPrivate && !approvalRequired) {
      return res.status(400).json({
        success: false,
        error: 'This is a public event. Please use the join endpoint instead.',
        action: 'join',
        joinEndpoint: `/api/events/${eventId}/join`,
      });
    }

    // Check if already has pending join request
    const hasPendingRequest = await EventJoinRequest.findPendingByUserAndEvent(userId, event._id);
    const inWaitlist = await Waitlist.isInWaitlist(userId, event._id);
    if (hasPendingRequest || inWaitlist) {
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

    // Get user details to include in join request
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

    // Prepare user details for join request
    const userDetails = {
      profilePic: user.profilePic || null,
      fullName: user.fullName || null,
      email: user.email || null,
    };

    // Get creator/organizer details
    const creator = await User.findById(event.creatorId);
    const creatorEmail = creator ? creator.email : null;

    // Determine if event is full
    const maxGuest = event.eventMaxGuest !== undefined ? event.eventMaxGuest : (event.gameSpots || 0);
    const currentJoinedCount = await EventJoin.getParticipantCount(event._id);
    const spotsFull = currentJoinedCount >= maxGuest;

    // If event has available spots -> create a pending request (NOT waitlist)
    // If event is full -> send to waitlist
    let joinRequestResult = null;
    let requestType = 'pending-request';
    if (spotsFull) {
      joinRequestResult = await Waitlist.add(userId, event.eventId, userDetails);
      requestType = 'waitlist';
    } else {
      joinRequestResult = await EventJoinRequest.create(userId, event._id, userDetails);
      requestType = 'pending-request';
    }

    // Create notification for organizer (event creator)
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
        'New Join Request',
        requestType === 'waitlist'
          ? `${user.fullName || 'A player'} joined the waitlist for your private event: ${eventName}`
          : `${user.fullName || 'A player'} requested to join your private event: ${eventName}`,
        {
          userId: userId,
          eventId: event._id.toString(),
          eventName: eventName,
          joinRequestId: joinRequestResult.joinRequestId || joinRequestResult.waitlistId || null,
          waitlistId: joinRequestResult.waitlistId || null,
          requestType: requestType,
          spotsFull: requestType === 'waitlist',
        }
      );
      console.log('✅ Private event join request notification created:', notificationResult._id.toString());
    } catch (error) {
      // Don't fail the request if notification creation fails
      console.error('❌ Error creating private event join request notification:', error.message, error.stack);
    }

    // Counts
    const pendingRequestCount = await EventJoinRequest.countPendingByEvent(event._id);
    const waitlistCount = await Waitlist.getWaitlistCount(event.eventId);
    const joinedCount = await EventJoin.getParticipantCount(event._id);
    const availableSpots = Math.max(0, maxGuest - joinedCount);
    const spotsNowFull = joinedCount >= maxGuest;

    res.status(200).json({
      success: true,
      message:
        requestType === 'waitlist'
          ? 'Event is full. You have been added to the waitlist. The organiser will review your request when a spot is available.'
          : 'Join request sent successfully. The event organiser will review your request.',
      data: {
        joinRequestId: joinRequestResult.joinRequestId || joinRequestResult.waitlistId,
        requestType: requestType, // "pending-request" or "waitlist"
        event: {
          eventId: event.eventId,
          eventTitle: event.eventName || null,
          eventName: event.eventName || null,
          eventCategory: Array.isArray(event.eventSports) && event.eventSports.length > 0 ? event.eventSports[0] : null,
          eventType: event.eventType || null,
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
          spotsFull: spotsNowFull,
        },
        counts: {
          totalSpots: maxGuest,
          joinedSpots: joinedCount,
          availableSpots: availableSpots,
          pendingRequests: pendingRequestCount,
          waitlist: waitlistCount,
        },
      },
    });
  } catch (error) {
    if (error.message === 'Already in waitlist') {
      return res.status(400).json({
        success: false,
        error: 'Request already sent. Waiting for organiser approval.',
      });
    }
    if (error.message === 'Event not found') {
      return res.status(404).json({
        success: false,
        error: 'Event not found',
      });
    }
    next(error);
  }
};

module.exports = {
  joinPrivateEventRequest,
};
