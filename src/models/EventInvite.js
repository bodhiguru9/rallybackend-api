const { getDB } = require('../config/database');
const { ObjectId } = require('mongodb');
const { findEventById } = require('../utils/eventHelper');
const { getNextUniqueEventInviteId } = require('../utils/idManager');

/**
 * Event Invite Model
 * Handles event invitations from organisers to players
 */
class EventInvite {
  static async createIndexes() {
    const db = getDB();
    const invitesCollection = db.collection('eventInvites');
    await invitesCollection.createIndex({ inviteId: 1 }, { unique: true, sparse: true });
    await invitesCollection.createIndex({ organiserId: 1, eventId: 1, createdAt: -1 });
    await invitesCollection.createIndex({ playerId: 1, createdAt: -1 });
  }

  static async _ensureInviteId(inviteDoc) {
    if (!inviteDoc) return null;
    if (inviteDoc.inviteId) return inviteDoc;

    const db = getDB();
    const invitesCollection = db.collection('eventInvites');

    // Lazy migration: assign inviteId for legacy documents
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const inviteId = await getNextUniqueEventInviteId();
        const result = await invitesCollection.updateOne(
          { _id: inviteDoc._id, inviteId: { $exists: false } },
          { $set: { inviteId, updatedAt: new Date() } }
        );
        if (result.modifiedCount > 0) {
          return { ...inviteDoc, inviteId };
        }

        // If not modified (inviteId already set by another process), refetch
        const refreshed = await invitesCollection.findOne({ _id: inviteDoc._id });
        return refreshed;
      } catch (e) {
        // Retry on rare collision
      }
    }

    return inviteDoc;
  }

  static async _resolveInvite(inviteIdOrMongoId) {
    const db = getDB();
    const invitesCollection = db.collection('eventInvites');

    // Prefer custom inviteId format: INV123
    if (typeof inviteIdOrMongoId === 'string' && inviteIdOrMongoId.startsWith('INV')) {
      const doc = await invitesCollection.findOne({ inviteId: inviteIdOrMongoId });
      return await this._ensureInviteId(doc);
    }

    // Fallback: Mongo ObjectId
    try {
      const oid = typeof inviteIdOrMongoId === 'string' ? new ObjectId(inviteIdOrMongoId) : inviteIdOrMongoId;
      const doc = await invitesCollection.findOne({ _id: oid });
      return await this._ensureInviteId(doc);
    } catch (e) {
      return null;
    }
  }

  /**
   * Send event invitation to a player
   * @param {string|ObjectId} organiserId - Organiser ID (MongoDB ObjectId)
   * @param {string|ObjectId} playerId - Player ID (MongoDB ObjectId)
   * @param {string} eventId - Event ID (sequential eventId like "E1" or MongoDB ObjectId)
   * @param {string} message - Optional invitation message
   * @returns {Promise<Object>} Created invitation
   */
  static async sendInvite(organiserId, playerId, eventId, message = null) {
    const db = getDB();
    const invitesCollection = db.collection('eventInvites');

    // Find event by sequential eventId or MongoDB ObjectId
    const event = await findEventById(eventId);
    if (!event) {
      throw new Error('Event not found');
    }

    // Use MongoDB ObjectId from found event
    const eventObjectId = event._id;
    const organiserObjectId = typeof organiserId === 'string' ? new ObjectId(organiserId) : organiserId;
    const playerObjectId = typeof playerId === 'string' ? new ObjectId(playerId) : playerId;

    // Check if invitation already exists
    const existing = await invitesCollection.findOne({
      organiserId: organiserObjectId,
      playerId: playerObjectId,
      eventId: eventObjectId,
      status: { $in: ['pending', 'accepted'] }, // Don't allow duplicate pending/accepted invites
    });

    if (existing) {
      throw new Error('Invitation already sent to this player for this event');
    }

    const now = new Date();
    const inviteData = {
      inviteId: await getNextUniqueEventInviteId(),
      organiserId: organiserObjectId,
      playerId: playerObjectId,
      eventId: eventObjectId,
      message: message || null,
      status: 'pending', // 'pending', 'accepted', 'declined', 'cancelled'
      createdAt: now,
      updatedAt: now,
    };

    const result = await invitesCollection.insertOne(inviteData);

    return {
      _id: result.insertedId,
      ...inviteData,
    };
  }

  /**
   * Accept invitation
   * @param {string|ObjectId} inviteId - Invitation ID (MongoDB ObjectId)
   * @param {string|ObjectId} playerId - Player ID (MongoDB ObjectId)
   * @returns {Promise<boolean>} Success status
   */
  static async acceptInvite(inviteId, playerId) {
    const db = getDB();
    const invitesCollection = db.collection('eventInvites');

    const inviteDoc = await this._resolveInvite(inviteId);
    if (!inviteDoc) return false;
    const inviteObjectId = inviteDoc._id;
    const playerObjectId = typeof playerId === 'string' ? new ObjectId(playerId) : playerId;

    // Find and update invitation
    const result = await invitesCollection.findOneAndUpdate(
      {
        _id: inviteObjectId,
        playerId: playerObjectId,
        status: 'pending',
      },
      {
        $set: {
          status: 'accepted',
          acceptedAt: new Date(),
          updatedAt: new Date(),
        },
      },
      {
        returnDocument: 'after',
      }
    );

    return result.value !== null;
  }

  /**
   * Decline invitation
   * @param {string|ObjectId} inviteId - Invitation ID (MongoDB ObjectId)
   * @param {string|ObjectId} playerId - Player ID (MongoDB ObjectId)
   * @returns {Promise<boolean>} Success status
   */
  static async declineInvite(inviteId, playerId) {
    const db = getDB();
    const invitesCollection = db.collection('eventInvites');

    const inviteDoc = await this._resolveInvite(inviteId);
    if (!inviteDoc) return false;
    const inviteObjectId = inviteDoc._id;
    const playerObjectId = typeof playerId === 'string' ? new ObjectId(playerId) : playerId;

    const result = await invitesCollection.findOneAndUpdate(
      {
        _id: inviteObjectId,
        playerId: playerObjectId,
        status: 'pending',
      },
      {
        $set: {
          status: 'declined',
          declinedAt: new Date(),
          updatedAt: new Date(),
        },
      },
      {
        returnDocument: 'after',
      }
    );

    return result.value !== null;
  }

  /**
   * Cancel invitation (organiser only)
   * @param {string|ObjectId} inviteId - Invitation ID (MongoDB ObjectId)
   * @param {string|ObjectId} organiserId - Organiser ID (MongoDB ObjectId)
   * @returns {Promise<boolean>} Success status
   */
  static async cancelInvite(inviteId, organiserId) {
    const db = getDB();
    const invitesCollection = db.collection('eventInvites');

    const inviteDoc = await this._resolveInvite(inviteId);
    if (!inviteDoc) return false;
    const inviteObjectId = inviteDoc._id;
    const organiserObjectId = typeof organiserId === 'string' ? new ObjectId(organiserId) : organiserId;

    const result = await invitesCollection.findOneAndUpdate(
      {
        _id: inviteObjectId,
        organiserId: organiserObjectId,
        status: 'pending',
      },
      {
        $set: {
          status: 'cancelled',
          cancelledAt: new Date(),
          updatedAt: new Date(),
        },
      },
      {
        returnDocument: 'after',
      }
    );

    return result.value !== null;
  }

  /**
   * Get player invitations
   * @param {string|ObjectId} playerId - Player ID (MongoDB ObjectId)
   * @param {string} status - Filter by status ('pending', 'accepted', 'declined', 'cancelled')
   * @param {number} limit - Maximum number of results
   * @param {number} skip - Number of results to skip
   * @returns {Promise<Array>} Array of invitations with event details
   */
  static async getPlayerInvites(playerId, status = null, limit = 100, skip = 0) {
    const db = getDB();
    const invitesCollection = db.collection('eventInvites');
    const eventsCollection = db.collection('events');
    const usersCollection = db.collection('users');

    const playerObjectId = typeof playerId === 'string' ? new ObjectId(playerId) : playerId;

    // Build query
    const query = { playerId: playerObjectId };
    if (status) {
      query.status = status;
    }

    const invites = await invitesCollection
      .find(query)
      .sort({ createdAt: -1 }) // Most recent first
      .limit(limit)
      .skip(skip)
      .toArray();

    if (invites.length === 0) {
      return [];
    }

    // Get event IDs and organiser IDs
    const eventIds = invites.map(i => i.eventId);
    const organiserIds = invites.map(i => i.organiserId);

    // Fetch events and organisers in parallel
    const [events, organisers] = await Promise.all([
      eventsCollection.find({ _id: { $in: eventIds } }).toArray(),
      usersCollection.find({ _id: { $in: organiserIds } }).toArray(),
    ]);

    return invites.map(invite => {
      const event = events.find(e => e._id.toString() === invite.eventId.toString());
      const organiser = organisers.find(o => o._id.toString() === invite.organiserId.toString());

      return {
        inviteId: invite.inviteId || null,
        event: event ? {
          eventId: event.eventId,
          eventTitle: event.eventName || null,
          eventName: event.eventName || null,
          eventCategory: Array.isArray(event.eventSports) && event.eventSports.length > 0 ? event.eventSports[0] : null,
          eventType: event.eventType || null,
          eventDateTime: event.eventDateTime || event.gameStartDate,
          eventLocation: event.eventLocation || event.gameLocationArena,
          eventImages: event.eventImages || event.gameImages || [],
          IsPrivateEvent: event.IsPrivateEvent !== undefined ? event.IsPrivateEvent : false,
        } : null,
        organiser: organiser ? {
          userId: organiser.userId,
          fullName: organiser.fullName,
          profilePic: organiser.profilePic,
          communityName: organiser.communityName,
        } : null,
        message: invite.message,
        status: invite.status,
        createdAt: invite.createdAt,
        acceptedAt: invite.acceptedAt || null,
        declinedAt: invite.declinedAt || null,
        cancelledAt: invite.cancelledAt || null,
      };
    });
  }

  /**
   * Get organiser sent invitations
   * @param {string|ObjectId} organiserId - Organiser ID (MongoDB ObjectId)
   * @param {string} eventId - Event ID (optional, filter by event)
   * @param {string} status - Filter by status (optional)
   * @param {number} limit - Maximum number of results
   * @param {number} skip - Number of results to skip
   * @returns {Promise<Array>} Array of invitations
   */
  static async getOrganiserInvites(organiserId, eventId = null, status = null, limit = 100, skip = 0) {
    const db = getDB();
    const invitesCollection = db.collection('eventInvites');
    const eventsCollection = db.collection('events');
    const usersCollection = db.collection('users');

    const organiserObjectId = typeof organiserId === 'string' ? new ObjectId(organiserId) : organiserId;

    // Build query
    const query = { organiserId: organiserObjectId };
    if (eventId) {
      const event = await findEventById(eventId);
      if (event) {
        query.eventId = event._id;
      } else {
        // If event not found, return empty array
        return [];
      }
    }
    if (status) {
      query.status = status;
    }

    const invites = await invitesCollection
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .toArray();

    if (invites.length === 0) {
      return [];
    }

    // Get event IDs and player IDs
    const eventIds = invites.map(i => i.eventId);
    const playerIds = invites.map(i => i.playerId);

    // Fetch events and players in parallel
    const [events, players] = await Promise.all([
      eventsCollection.find({ _id: { $in: eventIds } }).toArray(),
      usersCollection.find({ _id: { $in: playerIds } }).toArray(),
    ]);

    return invites.map(invite => {
      const event = events.find(e => e._id.toString() === invite.eventId.toString());
      const player = players.find(p => p._id.toString() === invite.playerId.toString());

      return {
        inviteId: invite.inviteId || null,
        event: event ? {
          eventId: event.eventId,
          eventTitle: event.eventName || null,
          eventName: event.eventName || null,
          eventCategory: Array.isArray(event.eventSports) && event.eventSports.length > 0 ? event.eventSports[0] : null,
          eventType: event.eventType || null,
          eventDateTime: event.eventDateTime || event.gameStartDate,
        } : null,
        player: player ? {
          userId: player.userId,
          fullName: player.fullName,
          profilePic: player.profilePic,
        } : null,
        message: invite.message,
        status: invite.status,
        createdAt: invite.createdAt,
        acceptedAt: invite.acceptedAt || null,
        declinedAt: invite.declinedAt || null,
        cancelledAt: invite.cancelledAt || null,
      };
    });
  }

  /**
   * Get invitation count for player
   * @param {string|ObjectId} playerId - Player ID (MongoDB ObjectId)
   * @param {string} status - Filter by status (optional)
   * @returns {Promise<number>} Count of invitations
   */
  static async getPlayerInviteCount(playerId, status = null) {
    const db = getDB();
    const invitesCollection = db.collection('eventInvites');

    const playerObjectId = typeof playerId === 'string' ? new ObjectId(playerId) : playerId;

    const query = { playerId: playerObjectId };
    if (status) {
      query.status = status;
    }

    return await invitesCollection.countDocuments(query);
  }

  /**
   * Get invitation count for organiser (sent invites)
   * @param {string|ObjectId} organiserId - Organiser ID (MongoDB ObjectId)
   * @param {string} eventId - Event ID (optional, filter by event)
   * @param {string} status - Filter by status (optional)
   * @returns {Promise<number>} Count of invitations
   */
  static async getOrganiserInviteCount(organiserId, eventId = null, status = null) {
    const db = getDB();
    const invitesCollection = db.collection('eventInvites');

    const organiserObjectId = typeof organiserId === 'string' ? new ObjectId(organiserId) : organiserId;

    const query = { organiserId: organiserObjectId };
    if (eventId) {
      const event = await findEventById(eventId);
      if (event) {
        query.eventId = event._id;
      } else {
        return 0;
      }
    }
    if (status) {
      query.status = status;
    }

    return await invitesCollection.countDocuments(query);
  }

  /**
   * Get invitation by ID
   * @param {string|ObjectId} inviteId - Invitation ID (MongoDB ObjectId)
   * @returns {Promise<Object|null>} Invitation object or null
   */
  static async getInviteById(inviteId) {
    return await this._resolveInvite(inviteId);
  }
}

module.exports = EventInvite;
