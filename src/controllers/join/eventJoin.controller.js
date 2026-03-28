const Event = require('../../models/Event');
const EventJoin = require('../../models/EventJoin');
const Waitlist = require('../../models/Waitlist');
const User = require('../../models/User');
const Notification = require('../../models/Notification');
const PackagePurchase = require('../../models/PackagePurchase');
const { findEventById, validateEventId } = require('../../utils/eventHelper');
const { getPaginationParams, createPaginationResponse } = require('../../utils/pagination');
const { validateAgeForEvent } = require('../../utils/ageRestriction');

/**
 * @desc    Join a public event (only for public events)
 * @route   POST /api/events/:eventId/join
 * @access  Private
 */
   const normalizeIso = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString();
};

const joinEvent = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.id;
    const requestedOccurrenceStart = req.body.occurrenceStart || req.query.occurrenceStart || null;
const requestedOccurrenceEnd = req.body.occurrenceEnd || req.query.occurrenceEnd || null;

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

    // Support both old and new field names for backward compatibility
    const isPrivate = event.IsPrivateEvent !== undefined ? event.IsPrivateEvent : (event.visibility === 'private');
    const approvalRequired = event.eventApprovalRequired === true || event.eventApprovalReq === true;
    const maxGuest = event.eventMaxGuest !== undefined ? event.eventMaxGuest : (event.gameSpots || 0);

    // Only public events without approval required can be joined directly
    if (isPrivate || approvalRequired) {
      return res.status(400).json({
        success: false,
        error: isPrivate
          ? 'This is a private event. Please use the join-request endpoint instead.'
          : 'This event requires organiser approval. Please use the join-request endpoint instead.',
        action: 'join-request',
        joinRequestEndpoint: `/api/events/${eventId}/join-request`,
      });
    }

    // Age restriction check (players only)
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

    // Check actual booked spots (more accurate than eventTotalAttendNumber)
    const currentJoinedCount = await EventJoin.getParticipantCount(event._id, occurrenceStart);
    const spotsFull = currentJoinedCount >= maxGuest;

    // If event is full, redirect to waitlist
    if (spotsFull) {
      return res.status(400).json({
        success: false,
        error: 'Event is full. All spots have been booked.',
        message: 'Please join the waitlist to be notified when a spot becomes available.',
        spotsInfo: {
          totalSpots: maxGuest,
          spotsBooked: currentJoinedCount,
          spotsLeft: 0,
          spotsFull: true,
        },
        action: 'join-waitlist',
        waitlistEndpoint: `/api/events/${eventId}/join-waitlist`,
      });
    }

    // Check if already joined (use MongoDB ObjectId from found event)
    const hasJoined = await EventJoin.hasJoined(userId, event._id, occurrenceStart);
    if (hasJoined) {
      return res.status(400).json({
        success: false,
        error: 'Already joined this occurrence',
      });
    }

    // Check if user has an active package for this organiser
    let packageUsed = null;
    const Package = require('../../models/Package');
    const activePackage = await PackagePurchase.findAvailablePackageForUser(userId, event.creatorId);
    
    if (activePackage) {
      // Get package details
      const packageDetails = await Package.findById(activePackage.packageId);
      // Use package to join event
      await PackagePurchase.incrementEventsJoined(activePackage._id, event._id);
      packageUsed = {
        packageId: packageDetails ? packageDetails.packageId : null,
        eventsRemaining: activePackage.maxEvents - activePackage.eventsJoined - 1,
      };
    }

    // Join event (use MongoDB ObjectId from found event)
    await EventJoin.join(userId, event._id, occurrenceStart, {
  occurrenceEnd,
  parentEventId: event.eventId,
});

    // Get updated event
    const updatedEvent = await findEventById(eventId);
    
    // Support both old and new field names
    const updatedTotalAttend = updatedEvent.eventTotalAttendNumber !== undefined ? updatedEvent.eventTotalAttendNumber : (updatedEvent.gameAttendNumbers || 0);
    const updatedMaxGuest = updatedEvent.eventMaxGuest !== undefined ? updatedEvent.eventMaxGuest : (updatedEvent.gameSpots || 0);

    const responseData = {
      success: true,
      message: 'Successfully joined event',
      data: {
        event: {
          eventId: updatedEvent.eventId,
          eventTotalAttendNumber: updatedTotalAttend,
          eventMaxGuest: updatedMaxGuest,
          occurrenceStart: occurrenceStart,
occurrenceEnd: occurrenceEnd,
        },
      },
    };

    // Add package info if package was used
    if (packageUsed) {
      responseData.data.package = packageUsed;
      responseData.message += ' (using package)';
    }

    res.status(200).json(responseData);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Leave an event
 * @route   DELETE /api/events/:eventId/join
 * @access  Private
 */
const leaveEvent = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.id;
    const requestedOccurrenceStart = req.body.occurrenceStart || req.query.occurrenceStart || null;

    // Validate and find event first to get MongoDB ObjectId
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
        error: `Event not found with ID: ${eventId}`,
        eventId: eventId,
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

if (!occurrenceStart) {
  return res.status(400).json({
    success: false,
    error: 'Invalid occurrenceStart',
  });
}

    // Leave event (use MongoDB ObjectId from found event)
    const left = await EventJoin.leave(userId, event._id, occurrenceStart);

    if (!left) {
      return res.status(400).json({
        success: false,
        error: 'Not joined to this event',
      });
    }

    // Create notification for organizer (event creator)
    try {
      const user = await User.findById(userId);
      const eventName = event.eventName || 'Event';
      await Notification.create(
        event.creatorId,
        'event_leave',
        'Player Left Event',
        `${user?.fullName || 'A player'} has left your event: ${eventName}`,
        {
          userId: userId,
          eventId: event._id.toString(),
          eventName: eventName,
          occurrenceStart: occurrenceStart,
        }
      );
    } catch (error) {
      // Don't fail the request if notification creation fails
      console.error('Error creating notification:', error);
    }

    // Get updated event
    const updatedEvent = await findEventById(eventId);
    
    // Support both old and new field names
    const updatedTotalAttend = updatedEvent.eventTotalAttendNumber !== undefined ? updatedEvent.eventTotalAttendNumber : (updatedEvent.gameAttendNumbers || 0);

    res.status(200).json({
      success: true,
      message: 'Successfully left event',
      data: {
        event: {
          id: updatedEvent._id.toString(),
          eventTotalAttendNumber: updatedTotalAttend,
          occurrenceStart: occurrenceStart,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get event participants
 * @route   GET /api/events/:eventId/participants?page=1
 * @access  Public (or Private for creator)
 * 
 * Uses page-based pagination: 20 items per page
 * Query parameter: page (default: 1)
 */
const getParticipants = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const { page, perPage, skip } = getPaginationParams(req.query.page, 20);

    // Validate and find event
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
        error: `Event not found with ID: ${eventId}`,
        eventId: eventId,
      });
    }

    const requestedOccurrenceStart = req.query.occurrenceStart || null;
const isRecurring = Array.isArray(event.eventFrequency) && event.eventFrequency.length > 0;

if (isRecurring && !requestedOccurrenceStart) {
  return res.status(400).json({
    success: false,
    error: 'occurrenceStart is required for recurring events',
  });
}

const occurrenceStart = normalizeIso(requestedOccurrenceStart || event.eventDateTime);

if (!occurrenceStart) {
  return res.status(400).json({
    success: false,
    error: 'Invalid occurrenceStart',
  });
}
    // Support both old and new field names for backward compatibility
    const isPrivate = event.IsPrivateEvent !== undefined ? event.IsPrivateEvent : (event.visibility === 'private');
    
    // Check if user can view participants
    // Public events: Anyone can view
    // Private events: Only creator can view (must be authenticated)
    if (isPrivate) {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required to view participants of private events',
        });
      }
      
      const isCreator = req.user.id === event.creatorId.toString();
      if (!isCreator) {
        return res.status(403).json({
          success: false,
          error: 'Not authorized to view participants. Only the event creator can view participants of private events.',
        });
      }
    }

    // Use MongoDB ObjectId from found event
    const participants = await EventJoin.getEventParticipants(event._id, occurrenceStart, perPage, skip);
const totalCount = await EventJoin.getParticipantCount(event._id, occurrenceStart);
    const pagination = createPaginationResponse(totalCount, page, perPage);

    res.status(200).json({
      success: true,
      data: {
        participants,
        pagination,
        occurrence: {
  occurrenceStart,
},
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Remove participant from event (Creator/Admin only)
 * @route   DELETE /api/events/:eventId/participants/:userId
 * @access  Private (Creator only)
 */
const removeParticipant = async (req, res, next) => {
  try {
    const { eventId, userId } = req.params;
    const requestedOccurrenceStart = req.body.occurrenceStart || req.query.occurrenceStart || null;
    const organiserId = req.user.id;

    // Verify event exists and user is creator
    // Validate and find event
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
        error: `Event not found with ID: ${eventId}`,
        eventId: eventId,
      });
    }

    if (event.creatorId.toString() !== organiserId) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to remove participants',
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

if (!occurrenceStart) {
  return res.status(400).json({
    success: false,
    error: 'Invalid occurrenceStart',
  });
}

    // Resolve user to remove (supports sequential userId or MongoDB ObjectId)
    let userToRemove = null;
    if (!isNaN(userId) && parseInt(userId).toString() === userId) {
      userToRemove = await User.findByUserId(userId);
    } else {
      userToRemove = await User.findById(userId);
    }

    if (!userToRemove) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        suggestion: 'Please provide a valid user ID (sequential userId like 5, or MongoDB ObjectId)',
      });
    }

    // Remove user from event (use MongoDB ObjectId from found event)
    const removed = await EventJoin.removeUser(event._id, userToRemove._id, occurrenceStart);
    if (!removed) {
      return res.status(400).json({
        success: false,
        error: 'User not found in event participants',
        occurrenceStart: occurrenceStart,
      });
    }

    // Notify removed player/user (best-effort)
    try {
      const organiser = await User.findById(organiserId);
      const organiserName = organiser?.communityName || organiser?.fullName || 'the organiser';
      const eventName = event.eventName || 'Event';

      await Notification.create(
        userToRemove._id,
        'event_participant_removed',
        'Removed from Event',
        `${organiserName} removed you from "${eventName}"`,
        {
          organiserId: organiserId,
          organiserName: organiserName,
          eventId: event._id.toString(),
          eventName: eventName,
          occurrenceStart: occurrenceStart,
        }
      );
    } catch (error) {
      console.error('Error creating removed-from-event notification:', error);
    }

    // Get updated event
    const updatedEvent = await findEventById(eventId);
    
    // Support both old and new field names
    const updatedTotalAttend = updatedEvent.eventTotalAttendNumber !== undefined ? updatedEvent.eventTotalAttendNumber : (updatedEvent.gameAttendNumbers || 0);

    res.status(200).json({
      success: true,
      message: 'Participant removed successfully',
      data: {
        removedUser: {
          userId: userToRemove.userId,
          mongoId: userToRemove._id.toString(),
          userType: userToRemove.userType,
          fullName: userToRemove.fullName || null,
          email: userToRemove.email || null,
          profilePic: userToRemove.profilePic || null,
        },
        event: {
          id: updatedEvent._id.toString(),
          eventId: updatedEvent.eventId,
          eventTotalAttendNumber: updatedTotalAttend,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Check if user has joined event
 * @route   GET /api/events/:eventId/join-status
 * @access  Private
 */
const getJoinStatus = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.id;
    const requestedOccurrenceStart = req.query.occurrenceStart || req.body.occurrenceStart || null;

    // Validate and find event
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
        error: `Event not found with ID: ${eventId}`,
        eventId: eventId,
      });
    }

    const isRecurringEvent = Array.isArray(event.eventFrequency) && event.eventFrequency.length > 0;

if (isRecurringEvent && !requestedOccurrenceStart) {
  return res.status(400).json({
    success: false,
    error: 'occurrenceStart is required for recurring events',
  });
}

const occurrenceStart = normalizeIso(requestedOccurrenceStart || event.eventDateTime);

if (!occurrenceStart) {
  return res.status(400).json({
    success: false,
    error: 'Invalid occurrenceStart',
  });
}

    let hasJoined = false;
    let inWaitlist = false;

    // Support both old and new field names for backward compatibility
    const isPrivate = event.IsPrivateEvent !== undefined ? event.IsPrivateEvent : (event.visibility === 'private');

    // Use MongoDB ObjectId from found event
    if (!isPrivate) {
      hasJoined = await EventJoin.hasJoined(userId, event._id, occurrenceStart);
    } else {
      inWaitlist = await Waitlist.isInWaitlist(userId, event._id);
      // Also check if accepted from waitlist (now in participants)
      if (!inWaitlist) {
        hasJoined = await EventJoin.hasJoined(userId, event._id, occurrenceStart);
      }
    }

    res.status(200).json({
      success: true,
      data: {
        hasJoined,
        inWaitlist,
        IsPrivateEvent: isPrivate,
        occurrenceStart: occurrenceStart,
      },
    });
  } catch (error) {
    next(error);
  }

 
};

 /**
 * @desc    Organiser sends a manual update/reminder to all attendees (in-app)
 * @route   POST /api/events/:eventId/notify-attendees
 * @access  Private (Creator or Superadmin)
 */
const notifyAttendees = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const senderId = req.user.id;       // mongo ObjectId string
    const senderType = req.user.userType;

    // Validate eventId format
    const validation = validateEventId(eventId);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: validation.error,
        eventId,
      });
    }

    // Find event (supports E44 or mongoId)
    const event = await findEventById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        error: `Event not found with ID: ${eventId}`,
        eventId,
      });
    }

    const requestedOccurrenceStart = req.body.occurrenceStart || req.query.occurrenceStart || null;
const isRecurring = Array.isArray(event.eventFrequency) && event.eventFrequency.length > 0;

if (isRecurring && !requestedOccurrenceStart) {
  return res.status(400).json({
    success: false,
    error: 'occurrenceStart is required for recurring events',
  });
}

const occurrenceStart = normalizeIso(requestedOccurrenceStart || event.eventDateTime);

if (!occurrenceStart) {
  return res.status(400).json({
    success: false,
    error: 'Invalid occurrenceStart',
  });
}

    // Permission: creator or superadmin
    const isCreator = senderId === event.creatorId?.toString();
    const isSuperadmin = senderType === 'superadmin';

    if (!isCreator && !isSuperadmin) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized. Only the event creator can notify attendees.',
      });
    }

    // Optional: if you want ONLY organiser/superadmin to send
    if (!isSuperadmin && senderType !== 'organiser') {
      return res.status(403).json({
        success: false,
        error: 'Only organisers can send attendee reminders',
      });
    }

    const organiserName =
      req.user.communityName || req.user.fullName || 'Organiser';

    // Defaults (can be overridden by req.body)
    const title =
      (typeof req.body?.title === 'string' && req.body.title.trim()) ||
      `${organiserName} has sent you some updates.`;

    const message =
      (typeof req.body?.message === 'string' && req.body.message.trim()) ||
      `Reminder for "${event.eventName || 'your event'}".`;

    // Get ALL attendee userIds
    const attendeeIds = await EventJoin.getAllParticipantUserIds(event._id, occurrenceStart);

    if (!attendeeIds.length) {
      return res.status(200).json({
        success: true,
        message: 'No attendees found to notify',
        data: { sentCount: 0, attendees: 0 },
      });
    }

    // Create notifications
    let sentCount = 0;
    let skippedSelf = 0;

    for (const recipientObjectId of attendeeIds) {
      const recipientId = recipientObjectId.toString();

      // Skip organiser if they joined
      if (recipientId === senderId) {
        skippedSelf++;
        continue;
      }

      try {
        // IMPORTANT:
        // Include organiserId + eventId keys so your existing player notifications enrichment works.
        await Notification.create(
          recipientId,
          'event_update', // new type
          title,
          message,
          {
            organiserId: senderId,
  eventId: event._id.toString(),
  eventSeqId: event.eventId,
  eventName: event.eventName,
  occurrenceStart: occurrenceStart,
  eventDateTime: occurrenceStart || event.eventDateTime || null,
  eventLocation: event.eventLocation || null,
          }
        );
        sentCount++;
      } catch (err) {
        console.error('notifyAttendees: failed for', recipientId, err);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Update sent to attendees',
      data: {
        eventId: event.eventId,
        mongoId: event._id.toString(),
        attendees: attendeeIds.length,
        occurrenceStart: occurrenceStart,
        sentCount,
        skippedSelf,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  joinEvent,
  leaveEvent,
  getParticipants,
  removeParticipant,
  getJoinStatus,
  notifyAttendees,
};

