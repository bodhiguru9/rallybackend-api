const EventInvite = require('../../models/EventInvite');
const EventJoin = require('../../models/EventJoin');
const Notification = require('../../models/Notification');
const User = require('../../models/User');
const { findEventById } = require('../../utils/eventHelper');
const { ObjectId } = require('mongodb');
const { validateAgeForEvent } = require('../../utils/ageRestriction');

/**
 * @desc    Accept event invitation (Player only)
 * @route   POST /api/event-invites/:inviteId/accept
 * @access  Private (Player only)
 * 
 * Player accepts an invitation and automatically joins the event.
 * Organiser receives a notification.
 */
const acceptInvite = async (req, res, next) => {
  try {
    const { inviteId } = req.params;
    const playerId = req.user.id;

    // Verify user is a player
    if (req.user.userType !== 'player') {
      return res.status(403).json({
        success: false,
        error: 'Only players can accept invitations',
      });
    }

    // Get invitation
    const invite = await EventInvite.getInviteById(inviteId);
    if (!invite) {
      return res.status(404).json({
        success: false,
        error: 'Invitation not found',
      });
    }

    // Verify invitation belongs to this player
    if (invite.playerId.toString() !== playerId) {
      return res.status(403).json({
        success: false,
        error: 'You can only accept your own invitations',
      });
    }

    // Check if invitation is still pending
    if (invite.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `Invitation has already been ${invite.status}`,
        status: invite.status,
      });
    }

    // Get event details (needed for age restriction check before accepting)
    const event = await findEventById(invite.eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found',
      });
    }

    // Age restriction check (players only)
    const player = await User.findById(playerId);
    const ageCheck = validateAgeForEvent(player?.dob, event.eventMinAge, event.eventMaxAge);
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

    // Accept invitation
    const accepted = await EventInvite.acceptInvite(inviteId, playerId);
    if (!accepted) {
      return res.status(400).json({
        success: false,
        error: 'Failed to accept invitation',
      });
    }

    // Automatically join the event (if not already joined)
    try {
      const hasJoined = await EventJoin.hasJoined(playerId, event._id);
      if (!hasJoined) {
        await EventJoin.join(playerId, event._id);
      }
    } catch (error) {
      // If already joined, that's fine
      if (error.message !== 'Already joined this event') {
        console.error('Error joining event after accepting invitation:', error);
      }
    }

    // Send notification to organiser
    try {
      const eventTitle = event.eventName || 'Event';
      const eventCategory = Array.isArray(event.eventSports) && event.eventSports.length > 0 ? event.eventSports[0] : null;
      const eventType = event.eventType || null;
      const playerName = req.user.fullName || 'A player';
      
      await Notification.create(
        invite.organiserId,
        'event_invitation_accepted',
        'Invitation Accepted',
        `${playerName} accepted your invitation to join "${eventTitle}"`,
        {
          inviteId: inviteId,
          eventId: event._id.toString(),
          eventTitle: eventTitle,
          eventName: eventTitle,
          eventCategory,
          eventType,
          // Keep both keys for backward-compatibility across notification consumers
          playerId: playerId,
          userId: playerId,
          playerName: playerName,
        }
      );
    } catch (error) {
      console.error('Error creating notification:', error);
    }

    res.status(200).json({
      success: true,
      message: 'Invitation accepted successfully. You have been added to the event.',
      data: {
        inviteId: inviteId,
        event: {
          eventId: event.eventId,
          eventTitle: event.eventName || null,
          eventName: event.eventName || null,
          eventCategory: Array.isArray(event.eventSports) && event.eventSports.length > 0 ? event.eventSports[0] : null,
          eventType: event.eventType || null,
        },
        status: 'accepted',
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Decline event invitation (Player only)
 * @route   POST /api/event-invites/:inviteId/decline
 * @access  Private (Player only)
 * 
 * Player declines an invitation.
 * Organiser receives a notification.
 */
const declineInvite = async (req, res, next) => {
  try {
    const { inviteId } = req.params;
    const playerId = req.user.id;

    // Verify user is a player
    if (req.user.userType !== 'player') {
      return res.status(403).json({
        success: false,
        error: 'Only players can decline invitations',
      });
    }

    // Get invitation
    const invite = await EventInvite.getInviteById(inviteId);
    if (!invite) {
      return res.status(404).json({
        success: false,
        error: 'Invitation not found',
      });
    }

    // Verify invitation belongs to this player
    if (invite.playerId.toString() !== playerId) {
      return res.status(403).json({
        success: false,
        error: 'You can only decline your own invitations',
      });
    }

    // Check if invitation is still pending
    if (invite.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `Invitation has already been ${invite.status}`,
        status: invite.status,
      });
    }

    // Decline invitation
    const declined = await EventInvite.declineInvite(inviteId, playerId);
    if (!declined) {
      return res.status(400).json({
        success: false,
        error: 'Failed to decline invitation',
      });
    }

    // Get event details
    const event = await findEventById(invite.eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found',
      });
    }

    // Send notification to organiser
    try {
      const eventTitle = event.eventName || 'Event';
      const eventCategory = Array.isArray(event.eventSports) && event.eventSports.length > 0 ? event.eventSports[0] : null;
      const eventType = event.eventType || null;
      const playerName = req.user.fullName || 'A player';
      
      await Notification.create(
        invite.organiserId,
        'event_invitation_declined',
        'Invitation Declined',
        `${playerName} declined your invitation to join "${eventTitle}"`,
        {
          inviteId: inviteId,
          eventId: event._id.toString(),
          eventTitle: eventTitle,
          eventName: eventTitle,
          eventCategory,
          eventType,
          // Keep both keys for backward-compatibility across notification consumers
          playerId: playerId,
          userId: playerId,
          playerName: playerName,
        }
      );
    } catch (error) {
      console.error('Error creating notification:', error);
    }

    res.status(200).json({
      success: true,
      message: 'Invitation declined successfully',
      data: {
        inviteId: inviteId,
        event: {
          eventId: event.eventId,
          eventTitle: event.eventName || null,
          eventName: event.eventName || null,
          eventCategory: Array.isArray(event.eventSports) && event.eventSports.length > 0 ? event.eventSports[0] : null,
          eventType: event.eventType || null,
        },
        status: 'declined',
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Cancel event invitation (Organiser only)
 * @route   POST /api/event-invites/:inviteId/cancel
 * @access  Private (Organiser only)
 * 
 * Organiser cancels a pending invitation.
 */
const cancelInvite = async (req, res, next) => {
  try {
    const { inviteId } = req.params;
    const organiserId = req.user.id;

    // Verify user is an organiser
    if (req.user.userType !== 'organiser') {
      return res.status(403).json({
        success: false,
        error: 'Only organisers can cancel invitations',
      });
    }

    // Get invitation
    const invite = await EventInvite.getInviteById(inviteId);
    if (!invite) {
      return res.status(404).json({
        success: false,
        error: 'Invitation not found',
      });
    }

    // Verify invitation belongs to this organiser
    if (invite.organiserId.toString() !== organiserId) {
      return res.status(403).json({
        success: false,
        error: 'You can only cancel invitations you sent',
      });
    }

    // Check if invitation is still pending
    if (invite.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `Cannot cancel invitation that is already ${invite.status}`,
        status: invite.status,
      });
    }

    // Cancel invitation
    const cancelled = await EventInvite.cancelInvite(inviteId, organiserId);
    if (!cancelled) {
      return res.status(400).json({
        success: false,
        error: 'Failed to cancel invitation',
      });
    }

    // Notify player that invite was cancelled
    try {
      const organiser = await User.findById(organiserId);
      const organiserName = organiser?.communityName || organiser?.fullName || 'The organiser';
      const event = await findEventById(invite.eventId);
      const eventTitle = event?.eventName || 'Event';
      const eventCategory = Array.isArray(event?.eventSports) && event.eventSports.length > 0 ? event.eventSports[0] : null;
      const eventType = event?.eventType || null;

      await Notification.create(
        invite.playerId,
        'event_invitation_cancelled',
        'Invitation Cancelled',
        `${organiserName} cancelled your invitation to join "${eventTitle}"`,
        {
          inviteId: inviteId,
          eventId: event ? event._id.toString() : null,
          eventTitle: eventTitle,
          eventName: eventTitle,
          eventCategory,
          eventType,
          organiserId: organiserId,
          organiserName: organiserName,
        }
      );
    } catch (error) {
      console.error('Error creating invitation cancelled notification:', error);
    }

    res.status(200).json({
      success: true,
      message: 'Invitation cancelled successfully',
      data: {
        inviteId: inviteId,
        status: 'cancelled',
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  acceptInvite,
  declineInvite,
  cancelInvite,
};
