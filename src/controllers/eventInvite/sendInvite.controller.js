const EventInvite = require('../../models/EventInvite');
const Event = require('../../models/Event');
const User = require('../../models/User');
const Notification = require('../../models/Notification');
const { inviteFollowersToEvent } = require('../../services/autoInviteFollowers.service');
const { findEventById, validateEventId } = require('../../utils/eventHelper');
const { getPaginationParams, createPaginationResponse } = require('../../utils/pagination');

/**
 * @desc    Send event invitation to a player (Organiser only)
 * @route   POST /api/event-invites/:eventId/send/:playerId (preferred)
 * @route   POST /api/event-invites/:eventId/send (backward compatible - playerId in body)
 * @access  Private (Organiser only)
 * 
 * Organiser can send invitations to players for their events.
 * Player will receive a notification.
 */
const sendInvite = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const playerId = req.params.playerId || req.body.playerId;
    const { message } = req.body;
    const organiserId = req.user.id;

    // Verify user is organiser
    if (req.user.userType !== 'organiser') {
      return res.status(403).json({
        success: false,
        error: 'Only organisers can send event invitations',
      });
    }

    // Validate inputs
    if (!playerId) {
      return res.status(400).json({
        success: false,
        error: 'playerId is required (send as URL param :playerId)',
      });
    }

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
      });
    }

    // Verify organiser is the event creator
    if (event.creatorId.toString() !== organiserId) {
      return res.status(403).json({
        success: false,
        error: 'You can only send invitations for events you created',
      });
    }

    // Verify player exists and is a player
    // Support both sequential userId (e.g. "12") and Mongo ObjectId
    let player = null;
    if (playerId !== undefined && playerId !== null && !isNaN(playerId) && parseInt(playerId).toString() === playerId.toString()) {
      player = await User.findByUserId(parseInt(playerId));
    } else {
      player = await User.findById(playerId);
    }
    if (!player) {
      return res.status(404).json({
        success: false,
        error: 'Player not found',
      });
    }

    if (player.userType !== 'player') {
      return res.status(400).json({
        success: false,
        error: 'Can only send invitations to players',
      });
    }

    // Send invitation (use MongoDB ObjectId for player)
    const invite = await EventInvite.sendInvite(organiserId, player._id, eventId, message);

    // Send notification to player
    try {
      const eventTitle = event.eventName || 'Event';
      const organiserName = req.user.fullName || 'An organiser';
      
      await Notification.create(
        player._id,
        'event_invitation',
        'Event Invitation',
        `${organiserName} invited you to join "${eventTitle}"`,
        {
          inviteId: invite.inviteId,
          eventId: event._id.toString(),
          eventTitle: eventTitle,
          eventName: eventTitle,
          eventCategory: Array.isArray(event.eventSports) && event.eventSports.length > 0 ? event.eventSports[0] : null,
          eventType: event.eventType || null,
          organiserId: organiserId,
          organiserName: organiserName,
          message: message || null,
        }
      );
    } catch (error) {
      // Don't fail the request if notification creation fails
      console.error('Error creating notification:', error);
    }

    res.status(200).json({
      success: true,
      message: 'Event invitation sent successfully. The player will receive a notification.',
      data: {
        inviteId: invite.inviteId,
        event: {
          eventId: event.eventId,
          eventTitle: event.eventName || null,
          eventName: event.eventName || null,
          eventCategory: Array.isArray(event.eventSports) && event.eventSports.length > 0 ? event.eventSports[0] : null,
          eventType: event.eventType || null,
          eventDateTime: event.eventDateTime || event.gameStartDate,
        },
        player: {
          userId: player.userId,
          fullName: player.fullName,
        },
        message: message || null,
        status: 'pending',
        createdAt: invite.createdAt,
      },
    });
  } catch (error) {
    if (error.message === 'Event not found') {
      return res.status(404).json({
        success: false,
        error: 'Event not found',
      });
    }
    if (error.message === 'Invitation already sent to this player for this event') {
      return res.status(400).json({
        success: false,
        error: 'Invitation already sent to this player for this event',
      });
    }
    next(error);
  }
};

/**
 * @desc    Send multiple event invitations (Organiser only)
 * @route   POST /api/event-invites/:eventId/send-bulk
 * @access  Private (Organiser only)
 * 
 * Organiser can send invitations to multiple players at once.
 */
const sendBulkInvites = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const { playerIds, message } = req.body;
    const organiserId = req.user.id;

    // Verify user is organiser
    if (req.user.userType !== 'organiser') {
      return res.status(403).json({
        success: false,
        error: 'Only organisers can send event invitations',
      });
    }

    // Validate inputs
    if (!playerIds || !Array.isArray(playerIds) || playerIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'playerIds array is required and must not be empty',
      });
    }

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
      });
    }

    // Verify organiser is the event creator
    if (event.creatorId.toString() !== organiserId) {
      return res.status(403).json({
        success: false,
        error: 'You can only send invitations for events you created',
      });
    }

    const eventTitle = event.eventName || 'Event';
    const organiserName = req.user.fullName || 'An organiser';

    // Process invitations
    const results = {
      sent: [],
      failed: [],
      skipped: [],
    };

    for (const playerId of playerIds) {
      try {
        // Verify player exists and is a player
        const player = await User.findById(playerId);
        if (!player) {
          results.failed.push({
            playerId: playerId,
            error: 'Player not found',
          });
          continue;
        }

        if (player.userType !== 'player') {
          results.skipped.push({
            playerId: playerId,
            error: 'User is not a player',
          });
          continue;
        }

        // Send invitation
        const invite = await EventInvite.sendInvite(organiserId, playerId, eventId, message);

        // Send notification to player
        try {
          await Notification.create(
            playerId,
            'event_invitation',
            'Event Invitation',
            `${organiserName} invited you to join "${eventTitle}"`,
            {
              inviteId: invite.inviteId,
              eventId: event._id.toString(),
              eventTitle: eventTitle,
              eventName: eventTitle,
              eventCategory: Array.isArray(event.eventSports) && event.eventSports.length > 0 ? event.eventSports[0] : null,
              eventType: event.eventType || null,
              organiserId: organiserId,
              organiserName: organiserName,
              message: message || null,
            }
          );
        } catch (error) {
          console.error(`Error creating notification for player ${playerId}:`, error);
        }

        results.sent.push({
          playerId: playerId,
          inviteId: invite.inviteId,
        });
      } catch (error) {
        if (error.message === 'Invitation already sent to this player for this event') {
          results.skipped.push({
            playerId: playerId,
            error: 'Invitation already sent',
          });
        } else {
          results.failed.push({
            playerId: playerId,
            error: error.message || 'Failed to send invitation',
          });
        }
      }
    }

    res.status(200).json({
      success: true,
      message: `Invitations processed: ${results.sent.length} sent, ${results.skipped.length} skipped, ${results.failed.length} failed`,
      data: {
        event: {
          eventId: event.eventId,
          eventTitle: event.eventName || null,
          eventName: event.eventName || null,
          eventCategory: Array.isArray(event.eventSports) && event.eventSports.length > 0 ? event.eventSports[0] : null,
          eventType: event.eventType || null,
        },
        results: {
          total: playerIds.length,
          sent: results.sent.length,
          skipped: results.skipped.length,
          failed: results.failed.length,
        },
        sent: results.sent,
        skipped: results.skipped,
        failed: results.failed,
      },
    });
  } catch (error) {
    if (error.message === 'Event not found') {
      return res.status(404).json({
        success: false,
        error: 'Event not found',
      });
    }
    next(error);
  }
};

/**
 * @desc    Send invitations to all followers/subscribers of organiser (Organiser only)
 * @route   POST /api/event-invites/:eventId/send-to-followers
 * @access  Private (Organiser only)
 */
const sendToFollowers = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const organiserId = req.user.id;
    const { message } = req.body;

    if (req.user.userType !== 'organiser') {
      return res.status(403).json({
        success: false,
        error: 'Only organisers can send event invitations',
      });
    }

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
      });
    }

    if (event.creatorId.toString() !== organiserId) {
      return res.status(403).json({
        success: false,
        error: 'You can only send invitations for events you created',
      });
    }

    const summary = await inviteFollowersToEvent({
      organiserId,
      event,
      message: message || null,
      organiserName: req.user.fullName || null,
    });

    return res.status(200).json({
      success: true,
      message: `Invitations processed: ${summary.sent.length} sent, ${summary.skipped.length} skipped, ${summary.failed.length} failed`,
      data: {
        event: {
          eventId: event.eventId,
          eventName: event.eventName || event.gameTitle,
        },
        invitations: summary,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  sendInvite,
  sendBulkInvites,
  sendToFollowers,
};
