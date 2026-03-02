const { getDB } = require('../config/database');
const { ObjectId } = require('mongodb');
const EventInvite = require('../models/EventInvite');
const Notification = require('../models/Notification');

/**
 * Send invitations to all followers/subscribers of an organiser for a specific event.
 * This is NOT automatic; call it from an API endpoint.
 */
async function inviteFollowersToEvent({ organiserId, event, message = null, organiserName = null }) {
  const db = getDB();
  const followsCollection = db.collection('follows');
  const usersCollection = db.collection('users');

  const organiserObjectId = typeof organiserId === 'string' ? new ObjectId(organiserId) : organiserId;

  const followerDocs = await followsCollection
    .find({ followingId: organiserObjectId })
    .project({ followerId: 1 })
    .toArray();

  const followerIds = Array.from(
    new Set(followerDocs.map((d) => d?.followerId?.toString()).filter(Boolean))
  ).map((id) => new ObjectId(id));

  const results = {
    totalFollowers: followerIds.length,
    eligiblePlayers: 0,
    sent: [],
    skipped: [],
    failed: [],
  };

  if (followerIds.length === 0) return results;

  const players = await usersCollection
    .find({ _id: { $in: followerIds }, userType: 'player' })
    .project({ _id: 1 })
    .toArray();

  results.eligiblePlayers = players.length;

  const eventTitle = event?.eventName || 'Event';
  const organiserDisplayName = organiserName || event?.eventCreatorName || 'An organiser';
  const eventCategory = Array.isArray(event?.eventSports) && event.eventSports.length > 0 ? event.eventSports[0] : null;
  const eventType = event?.eventType || null;

  for (const p of players) {
    const playerId = p._id.toString();
    try {
      const invite = await EventInvite.sendInvite(organiserId, playerId, event._id, message);

      // Best-effort notification
      try {
        await Notification.create(
          playerId,
          'event_invitation',
          'Event Invitation',
          `${organiserDisplayName} invited you to join "${eventTitle}"`,
          {
            inviteId: invite.inviteId,
            eventId: event._id.toString(),
            eventTitle,
            eventName: eventTitle,
            eventCategory,
            eventType,
            organiserId: organiserId,
            organiserName: organiserDisplayName,
            message: message || null,
          }
        );
      } catch (e) {
        console.error('inviteFollowersToEvent notification error:', e);
      }

      results.sent.push({ playerId, inviteId: invite.inviteId });
    } catch (e) {
      if (e?.message === 'Invitation already sent to this player for this event') {
        results.skipped.push({ playerId, reason: 'already_invited' });
      } else {
        results.failed.push({ playerId, error: e?.message || 'Failed to invite follower' });
      }
    }
  }

  return results;
}

module.exports = {
  inviteFollowersToEvent,
};

