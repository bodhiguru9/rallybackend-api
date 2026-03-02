const { getDB } = require('../config/database');
const { ObjectId } = require('mongodb');
const { findEventById } = require('../utils/eventHelper');
const Counter = require('./Counter');

/**
 * Waitlist Model
 * Handles waitlist for private events
 */
class Waitlist {
  /**
   * Add user to waitlist
   * @param {string|ObjectId} userId - User ID (MongoDB ObjectId)
   * @param {string} eventId - Event ID (sequential eventId like "E1" or MongoDB ObjectId)
   * @param {object} userDetails - User details (profilePic, fullName, email)
   */
  static async add(userId, eventId, userDetails = null) {
    const db = getDB();
    const waitlistCollection = db.collection('waitlist');

    // Find event by sequential eventId or MongoDB ObjectId
    const event = await findEventById(eventId);
    if (!event) {
      throw new Error('Event not found');
    }

    // Use MongoDB ObjectId from found event for database operations
    const eventObjectId = event._id;

    // Check if already in waitlist
    const existing = await waitlistCollection.findOne({
      userId: typeof userId === 'string' ? new ObjectId(userId) : userId,
      eventId: eventObjectId,
      status: 'pending',
    });

    if (existing) {
      throw new Error('Already in waitlist');
    }

    // Generate sequential waitlist ID (W1, W2, W3, etc.)
    const waitlistId = await Counter.getNextWaitlistId();
    
    // Generate sequential request ID (Request1, Request2, etc.)
    const requestSequence = await Counter.getNextRequestId();
    const requestId = `Request${requestSequence}`;

    const now = new Date();
    const waitlistData = {
      waitlistId: waitlistId, // Sequential waitlist ID (W1, W2, W3, etc.)
      requestId: requestId, // Sequential request ID (Request1, Request2, etc.)
      userId: typeof userId === 'string' ? new ObjectId(userId) : userId,
      eventId: eventObjectId, // Use MongoDB ObjectId from found event
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };

    // Add user details if provided
    if (userDetails) {
      waitlistData.profilePic = userDetails.profilePic || null;
      waitlistData.fullName = userDetails.fullName || null;
      waitlistData.email = userDetails.email || null;
    }

    const result = await waitlistCollection.insertOne(waitlistData);

    return {
      insertedId: result.insertedId,
      waitlistId: waitlistId, // Sequential waitlist ID (W1, W2, W3, etc.)
      requestId: requestId, // Sequential request ID (Request1, Request2, etc.)
    };
  }

  /**
   * Get waitlist for an event
   * @param {string} eventId - Event ID (sequential eventId like "E1" or MongoDB ObjectId)
   */
  static async getEventWaitlist(eventId, limit = 100, skip = 0) {
    const db = getDB();
    const waitlistCollection = db.collection('waitlist');
    const usersCollection = db.collection('users');

    // Find event by sequential eventId or MongoDB ObjectId
    const event = await findEventById(eventId);
    if (!event) {
      return [];
    }

    // Use MongoDB ObjectId from found event for database operations
    const eventObjectId = event._id;

    // Query waitlist - ensure we match eventId correctly (it's stored as ObjectId)
    const waitlist = await waitlistCollection
      .find({ 
        eventId: eventObjectId, 
        status: 'pending' 
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .toArray();

    const userIds = waitlist.map((w) => w.userId);

    if (userIds.length === 0) {
      return [];
    }

    // Get all users - ensure userIds are ObjectIds for the query
    const userObjectIds = userIds.map(id => 
      id instanceof ObjectId ? id : new ObjectId(id)
    );
    const users = await usersCollection.find({ 
      _id: { $in: userObjectIds } 
    }).toArray();

    return waitlist.map((item) => {
      // Find user by matching ObjectIds (handle both ObjectId and string comparisons)
      const user = users.find((u) => {
        const userId = item.userId instanceof ObjectId ? item.userId : new ObjectId(item.userId);
        const userMongoId = u._id instanceof ObjectId ? u._id : new ObjectId(u._id);
        return userId.toString() === userMongoId.toString();
      });
      
      // Use stored user details from waitlist if available, otherwise fallback to user document
      const userData = {
        userId: user ? user.userId : null,
        userType: user ? user.userType : null,
        email: item.email || (user ? user.email : null),
        mobileNumber: user ? user.mobileNumber : null,
        profilePic: item.profilePic || (user ? user.profilePic : null),
        fullName: item.fullName || (user ? user.fullName : null),
      };

      // Add type-specific fields if user exists
      if (user) {
        if (user.userType === 'player') {
          userData.dob = user.dob;
          userData.gender = user.gender;
          userData.sport1 = user.sport1;
          userData.sport2 = user.sport2;
        } else if (user.userType === 'organiser') {
          userData.communityName = user.communityName;
          userData.yourCity = user.yourCity;
        }
      }

      return {
        waitlistId: item.waitlistId || item._id.toString(), // Sequential waitlist ID (W1, W2, W3) or MongoDB ObjectId fallback
        mongoId: item._id.toString(), // MongoDB ObjectId for reference
        requestId: item.requestId || null, // Sequential request ID (Request1, Request2, etc.)
        user: userData,
        status: item.status,
        createdAt: item.createdAt,
      };
    });
  }

  /**
   * Accept user from waitlist (add to event and remove from waitlist)
   * @param {string} waitlistId - Waitlist item ID (sequential waitlistId like "W1" or MongoDB ObjectId)
   * @param {string} eventId - Event ID (sequential eventId like "E1" or MongoDB ObjectId)
   * @param {string} organiserId - Organiser ID (MongoDB ObjectId string)
   */
  static async accept(waitlistId, eventId, organiserId) {
    const db = getDB();
    const waitlistCollection = db.collection('waitlist');
    const Event = require('./Event');
    const EventJoin = require('./EventJoin');

    // Find event by sequential eventId or MongoDB ObjectId
    const event = await findEventById(eventId);
    if (!event) {
      throw new Error('Event not found');
    }

    // Verify event belongs to organiser
    if (event.creatorId.toString() !== organiserId.toString()) {
      throw new Error('Unauthorized');
    }

    // Use MongoDB ObjectId from found event
    const eventObjectId = event._id;

    // Find waitlist item by sequential waitlistId (W1, W2, etc.) or MongoDB ObjectId
    let waitlistItem;
    if (waitlistId && waitlistId.startsWith('W')) {
      // Sequential waitlist ID (W1, W2, W3, etc.)
      waitlistItem = await waitlistCollection.findOne({
        waitlistId: waitlistId,
        eventId: eventObjectId,
        status: 'pending',
      });
    } else {
      // MongoDB ObjectId (fallback for old entries)
      try {
        const waitlistObjectId = typeof waitlistId === 'string' ? new ObjectId(waitlistId) : waitlistId;
        waitlistItem = await waitlistCollection.findOne({
          _id: waitlistObjectId,
          eventId: eventObjectId,
          status: 'pending',
        });
      } catch (error) {
        throw new Error('Invalid waitlist ID format');
      }
    }

    if (!waitlistItem) {
      throw new Error('Waitlist item not found or already processed');
    }

    // Check if event has available spots using actual booked count
    const currentJoinedCount = await EventJoin.getParticipantCount(event._id);
    const maxGuest = event.eventMaxGuest !== undefined ? event.eventMaxGuest : (event.gameSpots || 0);
    
    if (currentJoinedCount >= maxGuest) {
      throw new Error('Event is full');
    }

    // Add user to event
    try {
      // Use MongoDB ObjectId from found event
      await EventJoin.join(waitlistItem.userId, event._id);
    } catch (error) {
      if (error.message.includes('Already joined')) {
        // User already in event, just remove from waitlist
      } else {
        throw error;
      }
    }

    // Remove waitlist entry after accepting (delete instead of updating status)
    await waitlistCollection.deleteOne({ _id: waitlistItem._id });

    return {
      success: true,
      waitlistId: waitlistItem.waitlistId || waitlistItem._id.toString(),
      userId: waitlistItem.userId,
      requestId: waitlistItem.requestId,
    };
  }

  /**
   * Reject user from waitlist
   * @param {string} waitlistId - Waitlist item ID (sequential waitlistId like "W1" or MongoDB ObjectId)
   * @param {string} eventId - Event ID (sequential eventId like "E1" or MongoDB ObjectId)
   * @param {string} organiserId - Organiser ID (MongoDB ObjectId string)
   */
  static async reject(waitlistId, eventId, organiserId) {
    const db = getDB();
    const waitlistCollection = db.collection('waitlist');

    // Find event by sequential eventId or MongoDB ObjectId
    const event = await findEventById(eventId);
    if (!event) {
      throw new Error('Event not found');
    }

    // Verify event belongs to organiser
    if (event.creatorId.toString() !== organiserId.toString()) {
      throw new Error('Unauthorized');
    }

    // Use MongoDB ObjectId from found event
    const eventObjectId = event._id;

    // Find waitlist item by sequential waitlistId (W1, W2, etc.) or MongoDB ObjectId
    let waitlistItem;
    if (waitlistId && waitlistId.startsWith('W')) {
      // Sequential waitlist ID (W1, W2, W3, etc.)
      waitlistItem = await waitlistCollection.findOne({
        waitlistId: waitlistId,
        eventId: eventObjectId,
        status: 'pending',
      });
    } else {
      // MongoDB ObjectId (fallback for old entries)
      try {
        const waitlistObjectId = typeof waitlistId === 'string' ? new ObjectId(waitlistId) : waitlistId;
        waitlistItem = await waitlistCollection.findOne({
          _id: waitlistObjectId,
          eventId: eventObjectId,
          status: 'pending',
        });
      } catch (error) {
        throw new Error('Invalid waitlist ID format');
      }
    }

    if (!waitlistItem) {
      throw new Error('Waitlist item not found or already processed');
    }

    // Remove waitlist entry (delete instead of updating status)
    const result = await waitlistCollection.deleteOne({
      _id: waitlistItem._id,
      eventId: eventObjectId,
      status: 'pending',
    });

    return {
      success: result.deletedCount > 0,
      waitlistId: waitlistItem.waitlistId || waitlistItem._id.toString(),
      userId: waitlistItem.userId,
      requestId: waitlistItem.requestId,
    };
  }

  /**
   * Check if user is in waitlist
   * @param {string|ObjectId} userId - User ID (MongoDB ObjectId)
   * @param {string} eventId - Event ID (sequential eventId like "E1" or MongoDB ObjectId)
   */
  static async isInWaitlist(userId, eventId) {
    const db = getDB();
    const waitlistCollection = db.collection('waitlist');

    // Find event by sequential eventId or MongoDB ObjectId
    const event = await findEventById(eventId);
    if (!event) {
      return false;
    }

    // Use MongoDB ObjectId from found event for database operations
    const eventObjectId = event._id;

    const item = await waitlistCollection.findOne({
      userId: typeof userId === 'string' ? new ObjectId(userId) : userId,
      eventId: eventObjectId,
      status: 'pending',
    });

    return !!item;
  }

  /**
   * Get waitlist count for event
   * @param {string} eventId - Event ID (sequential eventId like "E1" or MongoDB ObjectId)
   */
  static async getWaitlistCount(eventId) {
    const db = getDB();
    const waitlistCollection = db.collection('waitlist');

    // Find event by sequential eventId or MongoDB ObjectId
    const event = await findEventById(eventId);
    if (!event) {
      return 0;
    }

    // Use MongoDB ObjectId from found event for database operations
    const eventObjectId = event._id;

    return await waitlistCollection.countDocuments({
      eventId: eventObjectId,
      status: 'pending',
    });
  }
}

module.exports = Waitlist;

