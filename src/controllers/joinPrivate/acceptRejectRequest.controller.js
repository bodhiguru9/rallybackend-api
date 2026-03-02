const Event = require('../../models/Event');
const Waitlist = require('../../models/Waitlist');
const EventJoinRequest = require('../../models/EventJoinRequest');
const EventJoin = require('../../models/EventJoin');
const User = require('../../models/User');
const Notification = require('../../models/Notification');
const { findEventById, validateEventId } = require('../../utils/eventHelper');

/**
 * @desc    Accept a join request for a private event
 * @route   POST /api/private-events/:eventId/join-requests/:requestId/accept
 *         OR POST /api/private-events/:eventId/join-requests/user/:userId/accept
 * @access  Private (Creator only)
 * 
 * Accepts a join request, adds user to event, removes from join requests list.
 * Can use either requestId (waitlistId) or userId to identify the request.
 * Sends notification to the player.
 */
const acceptJoinRequest = async (req, res, next) => {
  try {
    const { eventId, requestId, userId } = req.params;
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

    // Find event to get ObjectId (needed for both pending requests and waitlist)
    const event = await findEventById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found',
      });
    }

    // If userId is provided, try pending request first, then waitlist
    let pendingRequest = null;
    let waitlistId = requestId;
    if (userId && !requestId) {
      const { getDB } = require('../../config/database');
      const { ObjectId } = require('mongodb');
      const db = getDB();
      const waitlistCollection = db.collection('waitlist');
      
      // Try pending request by user+event
      pendingRequest = await EventJoinRequest.findPendingByUserAndEvent(userId, event._id);
      if (pendingRequest) {
        // We'll handle below
      } else {
      // Find request by userId and eventId
      const userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
      const requestItem = await waitlistCollection.findOne({
        userId: userObjectId,
        eventId: event._id,
        status: 'pending',
      });

      if (!requestItem) {
        return res.status(404).json({
          success: false,
          error: 'Join request not found for this user',
        });
      }

      waitlistId = requestItem.waitlistId || requestItem._id.toString();
      }
    }

    // If requestId provided, try to interpret it as pending joinRequestId first
    if (!pendingRequest && requestId) {
      // Try pending join request id (EJR...)
      const db = require('../../config/database').getDB();
      const col = db.collection('eventJoinRequests');
      pendingRequest = await col.findOne({ joinRequestId: String(requestId), eventId: event._id, status: 'pending' });
    }

    if (!pendingRequest && !waitlistId) {
      return res.status(400).json({
        success: false,
        error: 'Either requestId or userId must be provided',
      });
    }

    // If this is a pending request:
    // - If event is full now, move user to waitlist
    // - Else, mark as accepted (payment pending) and keep it in pending list until payment success
    if (pendingRequest) {
      const maxGuest = event.eventMaxGuest !== undefined ? event.eventMaxGuest : (event.gameSpots || 0);
      const currentJoinedCount = await EventJoin.getParticipantCount(event._id);
      const spotsFull = currentJoinedCount >= maxGuest;

      if (spotsFull) {
        // Move to waitlist
        const userDoc = await User.findById(pendingRequest.userId);
        const userDetails = {
          profilePic: pendingRequest.profilePic || userDoc?.profilePic || null,
          fullName: pendingRequest.fullName || userDoc?.fullName || null,
          email: pendingRequest.email || userDoc?.email || null,
        };
        const waitlistResult = await Waitlist.add(pendingRequest.userId, event.eventId, userDetails);
        await EventJoinRequest.deleteByJoinRequestId(pendingRequest.joinRequestId, event._id);

        return res.status(200).json({
          success: true,
          message: 'Event is full. Pending request moved to waitlist.',
          data: {
            requestType: 'waitlist',
            joinRequestId: waitlistResult.waitlistId,
            waitlistId: waitlistResult.waitlistId,
            event: { eventId: event.eventId, eventName: event.eventName || event.gameTitle },
          },
        });
      }

      // Accept: mark accepted (payment pending) - do not join yet
      await EventJoinRequest.markAccepted(pendingRequest.joinRequestId, event._id, organiserId);

      // Notify player
      try {
        const organiser = await User.findById(organiserId);
        const eventName = event.eventName || event.gameTitle || 'Event';
        await Notification.create(
          pendingRequest.userId,
          'event_request_accepted',
          'Request Accepted',
          `Your request to join "${eventName}" has been accepted by ${organiser?.fullName || 'the organizer'}. Please complete the payment to join.`,
          {
            organiserId: organiserId,
            eventId: event._id.toString(),
            eventName: eventName,
            joinRequestId: pendingRequest.joinRequestId,
            requestType: 'pending-request',
            paymentStatus: 'pending',
          }
        );
      } catch (error) {
        console.error('Error creating notification:', error);
      }

      const updatedJoinedCount = await EventJoin.getParticipantCount(event._id);
      const pendingRequestCount = await EventJoinRequest.countActiveByEvent(event._id);
      const waitlistCount = await Waitlist.getWaitlistCount(event.eventId);
      const availableSpots = Math.max(0, maxGuest - updatedJoinedCount);

      return res.status(200).json({
        success: true,
        message: 'Join request accepted. Payment is required to join the event.',
        data: {
          requestType: 'pending-request',
          joinRequestId: pendingRequest.joinRequestId,
          event: { eventId: event.eventId, eventName: event.eventName || event.gameTitle },
          payment: { status: 'pending' },
          spotsInfo: {
            totalSpots: maxGuest,
            spotsBooked: updatedJoinedCount,
            spotsLeft: availableSpots,
            spotsFull: updatedJoinedCount >= maxGuest,
          },
          counts: {
            pendingRequests: pendingRequestCount,
            waitlist: waitlistCount,
          },
        },
      });
    }

    // Otherwise: Accept join request from waitlist (existing logic)
    const acceptResult = await Waitlist.accept(waitlistId, eventId, organiserId);

    // Get updated event info
    const updatedEvent = await findEventById(eventId);
    if (!updatedEvent) {
      return res.status(404).json({
        success: false,
        error: 'Event not found',
      });
    }

    // Get user details
    const acceptedUser = await User.findById(acceptResult.userId);
    const organiser = await User.findById(organiserId);

    // Create notification for player (accepted user)
    try {
      const eventName = updatedEvent.eventName || updatedEvent.gameTitle || 'Event';
      await Notification.create(
        acceptResult.userId,
        'event_request_accepted',
        'Request Accepted',
        `Your request to join "${eventName}" has been accepted by ${organiser?.fullName || 'the organizer'}`,
        {
          organiserId: organiserId,
          eventId: updatedEvent._id.toString(),
          eventName: eventName,
          requestId: acceptResult.requestId,
          joinRequestId: acceptResult.waitlistId, // Keep waitlistId internally for compatibility
        }
      );
    } catch (error) {
      // Don't fail the request if notification creation fails
      console.error('Error creating notification:', error);
    }

    // Get updated counts
    const joinedCount = await EventJoin.getParticipantCount(updatedEvent._id);
    const pendingRequestCount = await Waitlist.getWaitlistCount(eventId);
    const maxGuest = updatedEvent.eventMaxGuest !== undefined ? updatedEvent.eventMaxGuest : (updatedEvent.gameSpots || 0);
    const availableSpots = Math.max(0, maxGuest - joinedCount);
    const spotsFull = joinedCount >= maxGuest;

    res.status(200).json({
      success: true,
      message: 'Join request accepted. User has been added to the event.',
      data: {
        requestId: acceptResult.requestId,
        joinRequestId: acceptResult.waitlistId, // Sequential ID for reference
        user: acceptedUser ? {
          userId: acceptedUser.userId,
          userType: acceptedUser.userType,
          fullName: acceptedUser.fullName,
          email: acceptedUser.email,
          profilePic: acceptedUser.profilePic,
        } : null,
        event: {
          eventId: updatedEvent.eventId,
          eventName: updatedEvent.eventName || updatedEvent.gameTitle,
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
          pendingRequests: pendingRequestCount,
        },
      },
    });
  } catch (error) {
    if (error.message === 'Unauthorized') {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to accept this join request',
      });
    }
    if (error.message === 'Event not found') {
      return res.status(404).json({
        success: false,
        error: 'Event not found',
      });
    }
    if (error.message === 'Event is full') {
      return res.status(400).json({
        success: false,
        error: 'Event is full. Cannot accept more participants.',
      });
    }
    if (error.message === 'Waitlist item not found or already processed') {
      return res.status(404).json({
        success: false,
        error: 'Join request not found or already processed',
      });
    }
    next(error);
  }
};

/**
 * @desc    Reject a join request for a private event
 * @route   POST /api/private-events/:eventId/join-requests/:requestId/reject
 *         OR POST /api/private-events/:eventId/join-requests/user/:userId/reject
 * @access  Private (Creator only)
 * 
 * Rejects a join request and removes from join requests list.
 * Can use either requestId (waitlistId) or userId to identify the request.
 * Sends notification to the player.
 */
const rejectJoinRequest = async (req, res, next) => {
  try {
    const { eventId, requestId, userId } = req.params;
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

    const event = await findEventById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found',
      });
    }

    // If userId is provided, try pending request first, then waitlist
    let pendingRequest = null;
    let waitlistId = requestId;
    if (userId && !requestId) {
      const { getDB } = require('../../config/database');
      const { ObjectId } = require('mongodb');
      const db = getDB();
      const waitlistCollection = db.collection('waitlist');
      
      pendingRequest = await EventJoinRequest.findPendingByUserAndEvent(userId, event._id);
      if (!pendingRequest) {
      // Find request by userId and eventId
      const userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
      const requestItem = await waitlistCollection.findOne({
        userId: userObjectId,
        eventId: event._id,
        status: 'pending',
      });

      if (!requestItem) {
        return res.status(404).json({
          success: false,
          error: 'Join request not found for this user',
        });
      }

      waitlistId = requestItem.waitlistId || requestItem._id.toString();
      }
    }

    // If requestId provided, try pending joinRequestId first
    if (!pendingRequest && requestId) {
      const db = require('../../config/database').getDB();
      const col = db.collection('eventJoinRequests');
      pendingRequest = await col.findOne({ joinRequestId: String(requestId), eventId: event._id, status: 'pending' });
    }

    if (!pendingRequest && !waitlistId) {
      return res.status(400).json({
        success: false,
        error: 'Either requestId or userId must be provided',
      });
    }

    // Reject pending request
    if (pendingRequest) {
      await EventJoinRequest.deleteByJoinRequestId(pendingRequest.joinRequestId, event._id);

      // Notify player
      try {
        const organiser = await User.findById(organiserId);
        const eventName = event ? (event.eventName || event.gameTitle || 'Event') : 'Event';
        await Notification.create(
          pendingRequest.userId,
          'event_request_rejected',
          'Request Rejected',
          `Your request to join "${eventName}" has been rejected by ${organiser?.fullName || 'the organizer'}`,
          {
            organiserId: organiserId,
            eventId: event._id.toString(),
            eventName: eventName,
            joinRequestId: pendingRequest.joinRequestId,
            requestType: 'pending-request',
          }
        );
      } catch (error) {
        console.error('Error creating notification:', error);
      }

      const pendingCount = await EventJoinRequest.countPendingByEvent(event._id);
      const waitlistCount = await Waitlist.getWaitlistCount(event.eventId);

      return res.status(200).json({
        success: true,
        message: 'Join request rejected. User has been removed from pending requests.',
        data: {
          requestType: 'pending-request',
          joinRequestId: pendingRequest.joinRequestId,
          pendingRequests: pendingCount,
          waitlist: waitlistCount,
        },
      });
    }

    // Reject join request from waitlist (existing logic)
    const rejectResult = await Waitlist.reject(waitlistId, eventId, organiserId);

    if (!rejectResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Join request not found or already processed',
      });
    }

    // Get event and user details
    const eventDoc = await findEventById(eventId);
    const rejectedUser = await User.findById(rejectResult.userId);
    const organiser = await User.findById(organiserId);

    // Create notification for player (rejected user)
    try {
      const eventName = eventDoc ? (eventDoc.eventName || eventDoc.gameTitle || 'Event') : 'Event';
      await Notification.create(
        rejectResult.userId,
        'event_request_rejected',
        'Request Rejected',
        `Your request to join "${eventName}" has been rejected by ${organiser?.fullName || 'the organizer'}`,
        {
          organiserId: organiserId,
          eventId: eventDoc ? eventDoc._id.toString() : null,
          eventName: eventName,
          requestId: rejectResult.requestId,
          joinRequestId: rejectResult.waitlistId, // Keep waitlistId internally for compatibility
        }
      );
    } catch (error) {
      // Don't fail the request if notification creation fails
      console.error('Error creating notification:', error);
    }

    // Get updated join request count
    const pendingRequestCount = await Waitlist.getWaitlistCount(eventId);

    res.status(200).json({
      success: true,
      message: 'Join request rejected. User has been removed from join requests.',
      data: {
        requestId: rejectResult.requestId,
        joinRequestId: rejectResult.waitlistId, // Sequential ID for reference
        user: rejectedUser ? {
          userId: rejectedUser.userId,
          userType: rejectedUser.userType,
          fullName: rejectedUser.fullName,
          email: rejectedUser.email,
          profilePic: rejectedUser.profilePic,
        } : null,
        event: eventDoc ? {
          eventId: eventDoc.eventId,
          eventName: eventDoc.eventName || eventDoc.gameTitle,
        } : null,
        pendingRequests: pendingRequestCount,
      },
    });
  } catch (error) {
    if (error.message === 'Unauthorized') {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to reject this join request',
      });
    }
    if (error.message === 'Event not found') {
      return res.status(404).json({
        success: false,
        error: 'Event not found',
      });
    }
    if (error.message === 'Waitlist item not found or already processed') {
      return res.status(404).json({
        success: false,
        error: 'Join request not found or already processed',
      });
    }
    next(error);
  }
};

module.exports = {
  acceptJoinRequest,
  rejectJoinRequest,
};
