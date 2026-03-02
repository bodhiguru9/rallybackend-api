const Event = require('../../models/Event');
const EventJoin = require('../../models/EventJoin');
const User = require('../../models/User');
const Notification = require('../../models/Notification');
const { findEventById, validateEventId } = require('../../utils/eventHelper');

/**
 * @desc    Remove a player from a private event (Organiser only)
 * @route   DELETE /api/private-events/:eventId/players/:playerId
 *         OR POST /api/private-events/:eventId/players/:playerId/remove
 * @access  Private (Creator only)
 * 
 * Removes a player from a private event. Only the event creator can remove players.
 * Sends notification to the removed player.
 */
const removePlayer = async (req, res, next) => {
  try {
    const { eventId, playerId } = req.params;
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

    // Find event
    const event = await findEventById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found',
        eventId: eventId,
      });
    }

    // Verify event is private
    const isPrivate = event.IsPrivateEvent !== undefined ? event.IsPrivateEvent : (event.visibility === 'private');
    if (!isPrivate) {
      return res.status(400).json({
        success: false,
        error: 'This endpoint is only for private events',
      });
    }

    // Verify organiser is the event creator
    if (event.creatorId.toString() !== organiserId) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized. Only the event creator can remove players.',
      });
    }

    // Find player by sequential userId or MongoDB ObjectId
    let player;
    const { getDB } = require('../../config/database');
    const { ObjectId } = require('mongodb');
    const db = getDB();
    const usersCollection = db.collection('users');

    // Check if playerId is a sequential userId (number)
    if (!isNaN(playerId) && parseInt(playerId).toString() === playerId.toString()) {
      player = await usersCollection.findOne({ userId: parseInt(playerId) });
    } else {
      // Treat as MongoDB ObjectId
      try {
        const playerObjectId = typeof playerId === 'string' ? new ObjectId(playerId) : playerId;
        player = await usersCollection.findOne({ _id: playerObjectId });
      } catch (error) {
        return res.status(400).json({
          success: false,
          error: 'Invalid player ID format',
        });
      }
    }

    if (!player) {
      return res.status(404).json({
        success: false,
        error: 'Player not found',
        playerId: playerId,
      });
    }

    // Verify user is a player
    if (player.userType !== 'player') {
      return res.status(400).json({
        success: false,
        error: 'Can only remove players from events',
      });
    }

    // Check if player has joined the event
    const hasJoined = await EventJoin.hasJoined(player._id, event._id);
    if (!hasJoined) {
      return res.status(400).json({
        success: false,
        error: 'Player has not joined this event',
        playerId: playerId,
      });
    }

    // Remove player from event
    const removed = await EventJoin.removeUser(event._id, player._id);
    if (!removed) {
      return res.status(400).json({
        success: false,
        error: 'Failed to remove player from event',
      });
    }

    // Send notification to removed player
    try {
      const organiser = await User.findById(organiserId);
      const eventName = event.eventName || event.gameTitle || 'Event';
      await Notification.create(
        player._id.toString(),
        'player_removed_from_event',
        'Removed from Event',
        `You have been removed from "${eventName}" by ${organiser?.fullName || 'the organizer'}`,
        {
          organiserId: organiserId,
          eventId: event._id.toString(),
          eventName: eventName,
        }
      );
    } catch (error) {
      console.error('Error creating notification:', error);
    }

    // Get updated participant count
    const updatedJoinedCount = await EventJoin.getParticipantCount(event._id);
    const maxGuest = event.eventMaxGuest !== undefined ? event.eventMaxGuest : (event.gameSpots || 0);
    const availableSpots = Math.max(0, maxGuest - updatedJoinedCount);

    res.status(200).json({
      success: true,
      message: 'Player removed from event successfully',
      data: {
        player: {
          userId: player.userId,
          fullName: player.fullName,
          email: player.email,
        },
        event: {
          eventId: event.eventId,
          eventName: event.eventName || event.gameTitle,
        },
        spotsInfo: {
          totalSpots: maxGuest,
          spotsBooked: updatedJoinedCount,
          spotsLeft: availableSpots,
          spotsFull: updatedJoinedCount >= maxGuest,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  removePlayer,
};
