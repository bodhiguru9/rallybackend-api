const Event = require('../../models/Event');
const { findEventById, validateEventId } = require('../../utils/eventHelper');
const crypto = require('crypto');

/**
 * @desc    Generate shareable link for an event
 * @route   GET /api/events/:eventId/share-link
 * @access  Public (for public events) / Private (for private events - creator only)
 */
const generateShareLink = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const userId = req.user ? req.user.id : null;

    // Validate eventId format
    const validation = validateEventId(eventId);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: validation.error,
        eventId: eventId,
      });
    }

    // Find event
    const event = await findEventById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        error: `Event not found with ID: ${eventId}`,
        eventId: eventId,
      });
    }

    // For private events, only creator can generate share link
    if (event.visibility === 'private') {
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required to share private events',
        });
      }

      if (event.creatorId.toString() !== userId.toString()) {
        return res.status(403).json({
          success: false,
          error: 'Only the event creator can generate share links for private events',
        });
      }
    }

    // Get base URL from environment or request
    const baseUrl = process.env.BASE_URL || req.protocol + '://' + req.get('host');
    
    // Generate share link using eventId
    // For better security, we can use a share token, but for simplicity, using eventId
    const shareLink = `${baseUrl}/api/events/share/${event.eventId}`;
    
    // Alternative: Generate a secure share token (optional, more secure)
    const shareToken = crypto.randomBytes(32).toString('hex');
    const shareLinkWithToken = `${baseUrl}/api/events/share/${event.eventId}?token=${shareToken}`;

    res.status(200).json({
      success: true,
      message: 'Share link generated successfully',
      data: {
        eventId: event.eventId,
        eventTitle: event.eventName || null,
        eventName: event.eventName || null,
        eventCategory: Array.isArray(event.eventSports) && event.eventSports.length > 0 ? event.eventSports[0] : null,
        eventType: event.eventType || null,
        visibility: event.visibility,
        shareLink: shareLink, // Simple link using eventId
        shareLinkWithToken: shareLinkWithToken, // More secure link with token
        shareOptions: {
          simple: shareLink,
          secure: shareLinkWithToken,
        },
        message: event.visibility === 'public' 
          ? 'This link can be shared publicly. Anyone can view and join the event.'
          : 'This is a private event link. Only people with this link can view the event, but they still need to request to join.',
        expiresAt: null, // Can add expiration if needed
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Access event via share link
 * @route   GET /api/events/share/:eventId
 * @access  Public (works for both public and private events via share link)
 */
const accessEventViaShareLink = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const { token } = req.query; // Optional token for additional security

    // Validate eventId format
    const validation = validateEventId(eventId);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: validation.error,
        eventId: eventId,
      });
    }

    // Find event
    const event = await findEventById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        error: `Event not found with ID: ${eventId}`,
        eventId: eventId,
      });
    }

    // Get creator details
    const User = require('../../models/User');
    const creator = await User.findById(event.creatorId);

    // Prepare event data for sharing
    const eventData = {
      eventId: event.eventId,
      eventTitle: event.eventName || null,
      eventName: event.eventName || null,
      eventCategory: Array.isArray(event.eventSports) && event.eventSports.length > 0 ? event.eventSports[0] : null,
      eventType: event.eventType || null,
      gameStartDate: event.gameStartDate,
      gameTime: event.gameTime,
      gameRecurrences: event.gameRecurrences,
      gameSpots: event.gameSpots,
      gameLocationArena: event.gameLocationArena,
      gameLocation: event.gameLocation,
      gameDescription: event.gameDescription,
      gameCancellationPolicy: event.gameCancellationPolicy,
      gameRegistrationStartTime: event.gameRegistrationStartTime,
      gameRegistrationEndTime: event.gameRegistrationEndTime,
      gameGender: event.gameGender,
      gameAge: event.gameAge,
      gameSkills: event.gameSkills,
      gameJoinPrice: event.gameJoinPrice,
      gameCreatorName: event.gameCreatorName,
      gameCreatorEmail: event.gameCreatorEmail || (creator ? creator.email : null),
      gameCreatorProfilePic: event.gameCreatorProfilePic || (creator ? creator.profilePic : null),
      gameAttendNumbers: event.gameAttendNumbers || 0,
      gameRestrictions: event.gameRestrictions,
      visibility: event.visibility,
      status: event.status || 'upcoming',
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
      accessedViaShareLink: true,
    };

    // For private events, show limited info unless user is authenticated
    if (event.visibility === 'private' && !req.user) {
      // Still show event details but indicate it's private
      eventData.requiresAuthToJoin = true;
      eventData.message = 'This is a private event. You need to sign in to request to join.';
    }

    res.status(200).json({
      success: true,
      message: 'Event accessed via share link',
      data: {
        event: eventData,
        shareInfo: {
          accessedViaShareLink: true,
          canJoin: event.visibility === 'public',
          requiresAuth: event.visibility === 'private',
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  generateShareLink,
  accessEventViaShareLink,
};

