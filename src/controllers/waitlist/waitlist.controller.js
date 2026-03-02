const Waitlist = require('../../models/Waitlist');
const Event = require('../../models/Event');
const User = require('../../models/User');
const Notification = require('../../models/Notification');
const { findEventById, validateEventId } = require('../../utils/eventHelper');
const { getPaginationParams, createPaginationResponse } = require('../../utils/pagination');

/**
 * @desc    Get waitlist for private event (Organiser only)
 * @route   GET /api/events/:eventId/waitlist?page=1
 * @access  Private (Creator only)
 * 
 * Uses page-based pagination: 20 items per page
 * Query parameter: page (default: 1)
 */
const getEventWaitlist = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const organiserId = req.user.id;

    // Validate and find event
    const validation = validateEventId(eventId);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: validation.error,
        eventId: eventId,
      });
    }

    // Verify event exists and user is creator
    const event = await findEventById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        error: `Event not found with ID: ${eventId}`,
        eventId: eventId,
      });
    }

    if (event.creatorId.toString() !== organiserId) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to view waitlist',
      });
    }

    const { page, perPage, skip } = getPaginationParams(req.query.page, 20);

    const waitlist = await Waitlist.getEventWaitlist(eventId, perPage, skip);
    const totalCount = await Waitlist.getWaitlistCount(eventId);
    const pagination = createPaginationResponse(totalCount, page, perPage);

    // Get creator details
    const creator = await User.findById(event.creatorId);

    // Get joined participants count
    const EventJoin = require('../../models/EventJoin');
    const joinedCount = await EventJoin.getParticipantCount(event._id);

    // Calculate available spots
    const totalSpots = event.gameSpots || 0;
    const availableSpots = Math.max(0, totalSpots - joinedCount);

    res.status(200).json({
      success: true,
      message: 'Waitlist retrieved successfully',
      data: {
        event: {
          eventId: event.eventId,
          gameCreatorName: event.gameCreatorName,
          gameCreatorEmail: event.gameCreatorEmail || (creator ? creator.email : null),
          gameCreatorProfilePic: event.gameCreatorProfilePic || (creator ? creator.profilePic : null),
          eventTitle: event.eventName || null,
          eventName: event.eventName || null,
          eventCategory: Array.isArray(event.eventSports) && event.eventSports.length > 0 ? event.eventSports[0] : null,
          eventType: event.eventType || null,
          visibility: event.visibility,
        },
        waitlist,
        counts: {
          totalSpots: totalSpots, // Total spots available in event
          joinedSpots: joinedCount, // How many users have joined
          availableSpots: availableSpots, // Available spots (totalSpots - joinedSpots)
          pendingWaitlist: totalCount, // How many users applied (pending in waitlist)
        },
        pagination,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Accept user from waitlist
 * @route   POST /api/events/:eventId/waitlist/:waitlistId/accept
 * @access  Private (Creator only)
 */
const acceptFromWaitlist = async (req, res, next) => {
  try {
    const { eventId, waitlistId } = req.params;
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

    // Accept and remove from waitlist
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

    // Create notification for player (accepted user)
    try {
      const eventName = updatedEvent.eventName || updatedEvent.gameTitle || 'Event';
      const organiser = await User.findById(organiserId);
      await Notification.create(
        acceptResult.userId,
        'event_request_accepted',
        'Waitlist Request Accepted',
        `Your waitlist request for "${eventName}" has been accepted by ${organiser?.fullName || 'the organizer'}. You have been added to the event.`,
        {
          organiserId: organiserId,
          eventId: updatedEvent._id.toString(),
          eventName: eventName,
          waitlistId: acceptResult.waitlistId,
          requestId: acceptResult.requestId,
        }
      );
    } catch (error) {
      // Don't fail the request if notification creation fails
      console.error('Error creating notification:', error);
    }

    // Get updated counts
    const EventJoin = require('../../models/EventJoin');
    const joinedCount = await EventJoin.getParticipantCount(updatedEvent._id);
    const pendingWaitlistCount = await Waitlist.getWaitlistCount(eventId);
    const totalSpots = updatedEvent.gameSpots || 0;
    const availableSpots = Math.max(0, totalSpots - joinedCount);

    res.status(200).json({
      success: true,
      message: 'User accepted from waitlist and added to event. Waitlist entry removed.',
      data: {
        waitlistId: acceptResult.waitlistId,
        requestId: acceptResult.requestId,
        user: acceptedUser ? {
          userId: acceptedUser.userId,
          userType: acceptedUser.userType,
          fullName: acceptedUser.fullName,
          email: acceptedUser.email,
          profilePic: acceptedUser.profilePic,
        } : null,
        event: {
          eventId: updatedEvent.eventId,
          gameAttendNumbers: updatedEvent.gameAttendNumbers,
          gameSpots: updatedEvent.gameSpots,
        },
        counts: {
          totalSpots: totalSpots,
          joinedSpots: joinedCount, // Updated joined count (increased)
          availableSpots: availableSpots, // Updated available spots (decreased)
          pendingWaitlist: pendingWaitlistCount, // Updated pending waitlist (decreased - removed)
        },
      },
    });
  } catch (error) {
    if (error.message === 'Unauthorized') {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to accept this waitlist request',
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
        error: 'Waitlist request not found or already processed',
      });
    }
    next(error);
  }
};

/**
 * @desc    Reject user from waitlist
 * @route   POST /api/events/:eventId/waitlist/:waitlistId/reject
 * @access  Private (Creator only)
 */
const rejectFromWaitlist = async (req, res, next) => {
  try {
    const { eventId, waitlistId } = req.params;
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

    // Reject and remove from waitlist
    const rejectResult = await Waitlist.reject(waitlistId, eventId, organiserId);

    if (!rejectResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Waitlist item not found or already processed',
      });
    }

    // Get event and user details
    const event = await findEventById(eventId);
    const rejectedUser = await User.findById(rejectResult.userId);
    const organiser = await User.findById(organiserId);

    // Create notification for player (rejected user)
    try {
      const eventName = event ? (event.eventName || event.gameTitle || 'Event') : 'Event';
      await Notification.create(
        rejectResult.userId,
        'event_request_rejected',
        'Waitlist Request Rejected',
        `Your waitlist request for "${eventName}" has been rejected by ${organiser?.fullName || 'the organizer'}`,
        {
          organiserId: organiserId,
          eventId: event ? event._id.toString() : null,
          eventName: eventName,
          waitlistId: rejectResult.waitlistId,
          requestId: rejectResult.requestId,
        }
      );
    } catch (error) {
      // Don't fail the request if notification creation fails
      console.error('Error creating notification:', error);
    }

    // Get updated waitlist count
    const pendingWaitlistCount = await Waitlist.getWaitlistCount(eventId);

    res.status(200).json({
      success: true,
      message: 'User rejected from waitlist. Waitlist entry removed.',
      data: {
        waitlistId: rejectResult.waitlistId,
        requestId: rejectResult.requestId,
        user: rejectedUser ? {
          userId: rejectedUser.userId,
          userType: rejectedUser.userType,
          fullName: rejectedUser.fullName,
          email: rejectedUser.email,
          profilePic: rejectedUser.profilePic,
        } : null,
        event: event ? {
          eventId: event.eventId,
          eventName: event.eventName || event.gameTitle,
        } : null,
        pendingWaitlist: pendingWaitlistCount, // Updated pending waitlist (decreased - removed)
      },
    });
  } catch (error) {
    if (error.message === 'Unauthorized') {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to reject this waitlist request',
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
        error: 'Waitlist request not found or already processed',
      });
    }
    next(error);
  }
};

module.exports = {
  getEventWaitlist,
  acceptFromWaitlist,
  rejectFromWaitlist,
};

