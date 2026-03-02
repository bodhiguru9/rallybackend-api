const { getDB } = require('../config/database');
const { ObjectId } = require('mongodb');
const Counter = require('./Counter');

/**
 * Event Model
 * Handles event/game creation and management by organisers
 */
class Event {
  constructor(data) {
    this.eventId = data.eventId; // Sequential event ID (E1, E2, E3, ...)
    // Convert creatorId to ObjectId if it's a string
    if (data.creatorId) {
      this.creatorId = typeof data.creatorId === 'string' ? new ObjectId(data.creatorId) : data.creatorId;
    } else {
      this.creatorId = data.creatorId;
    }
    this.gameImages = data.gameImages || (data.gameImage ? [data.gameImage] : []); // Array of game images (backward compatibility)
    this.gameVideo = data.gameVideo; // Video (backward compatibility)
    this.eventImages = data.eventImages || data.gameImages || (data.gameImage ? [data.gameImage] : []); // Array of event images (max 5, optional)
    this.eventVideo = data.eventVideo || data.gameVideo; // Event video (optional)
    this.eventName = data.eventName; // Event name
    this.eventType = data.eventType; // Event type
    this.eventSports = data.eventSports || []; // Array of sports (e.g., ["cricket", "football"])
    this.eventDateTime = data.eventDateTime; // Combined date and time
    this.eventEndDateTime = data.eventEndDateTime || null; // End date/time (optional)
    this.eventFrequency = data.eventFrequency || []; // Array of frequency values (optional)
    this.eventLocation = data.eventLocation || null; // Event location
    this.eventDescription = data.eventDescription || null; // Event description/details
    this.eventGender = data.eventGender || null; // Gender restriction ('male', 'female', 'all', null)
    this.eventSportsLevel = data.eventSportsLevel || null; // Sports level (e.g., "beginner", "intermediate", "advanced", null)
    this.eventMinAge = data.eventMinAge || null; // Minimum age
    this.eventMaxAge = data.eventMaxAge || null; // Maximum age
    this.eventLevelRestriction = data.eventLevelRestriction || null; // Level restriction
    this.eventMaxGuest = data.eventMaxGuest; // Maximum guests/spots available
    this.eventPricePerGuest = data.eventPricePerGuest || 0; // Price per guest
    this.IsPrivateEvent = data.IsPrivateEvent !== undefined ? data.IsPrivateEvent : false; // Boolean: true or false
    this.eventOurGuestAllowed = data.eventOurGuestAllowed !== undefined ? data.eventOurGuestAllowed : false; // Boolean: true or false
    this.eventApprovalReq = data.eventApprovalReq !== undefined ? data.eventApprovalReq : false; // Boolean: true or false
    this.eventDisallow = data.eventDisallow !== undefined ? data.eventDisallow : false; // Boolean: true or false
    this.eventApprovalRequired = data.eventApprovalRequired !== undefined ? data.eventApprovalRequired : false; // Boolean: true or false
    this.policyJoind = data.policyJoind !== undefined && data.policyJoind !== null ? data.policyJoind : null; // Value (string, number, etc.)
    this.eventRegistrationStartTime = data.eventRegistrationStartTime || null; // Registration start date/time
    this.eventRegistrationEndTime = data.eventRegistrationEndTime || null; // Registration end date/time
    this.eventStatus = data.eventStatus || 'upcoming'; // 'draft', 'past', 'ongoing', 'upcoming', 'completed', 'cancelled'
    this.eventCreatorName = data.eventCreatorName; // Organiser's name
    this.eventCreatorEmail = data.eventCreatorEmail; // Organiser's email
    this.eventCreatorProfilePic = data.eventCreatorProfilePic; // Organiser's profile picture
    this.eventTotalAttendNumber = data.eventTotalAttendNumber || 0; // Current attendees
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  /**
   * Create a new event
   */
  static async create(eventData) {
    const db = getDB();
    const eventsCollection = db.collection('events');

    // Generate sequential event ID with uniqueness verification
    const { getNextUniqueEventId } = require('../utils/idManager');
    const { sequence: eventSequence, eventId } = await getNextUniqueEventId();

    // Add eventId to eventData
    const eventWithId = { ...eventData, eventId };

    const event = new Event(eventWithId);
    event.createdAt = new Date();
    event.updatedAt = new Date();

    const result = await eventsCollection.insertOne(event);

    // Update organiser's events count
    await this.updateEventsCount(eventData.creatorId, 1);

    // Return event with all fields including eventId
    return {
      _id: result.insertedId,
      eventId: event.eventId,
      creatorId: event.creatorId,
      gameImages: event.gameImages, // Backward compatibility
      gameVideo: event.gameVideo, // Backward compatibility
      eventImages: event.eventImages || event.gameImages || [], // Array of event images (max 5, optional)
      eventVideo: event.eventVideo || event.gameVideo || null, // Event video (optional)
      eventName: event.eventName,
      eventType: event.eventType,
      eventSports: event.eventSports || [],
      eventDateTime: event.eventDateTime,
      eventFrequency: event.eventFrequency || [],
      eventLocation: event.eventLocation,
      eventDescription: event.eventDescription,
      eventGender: event.eventGender,
      eventSportsLevel: event.eventSportsLevel,
      eventMinAge: event.eventMinAge,
      eventMaxAge: event.eventMaxAge,
      eventLevelRestriction: event.eventLevelRestriction,
      eventMaxGuest: event.eventMaxGuest,
      eventPricePerGuest: event.eventPricePerGuest,
      IsPrivateEvent: event.IsPrivateEvent,
      eventOurGuestAllowed: event.eventOurGuestAllowed,
      eventApprovalReq: event.eventApprovalReq,
      eventDisallow: event.eventDisallow,
      eventApprovalRequired: event.eventApprovalRequired,
      policyJoind: event.policyJoind,
      eventRegistrationStartTime: event.eventRegistrationStartTime,
      eventRegistrationEndTime: event.eventRegistrationEndTime,
      eventStatus: event.eventStatus,
      eventCreatorName: event.eventCreatorName,
      eventCreatorEmail: event.eventCreatorEmail,
      eventCreatorProfilePic: event.eventCreatorProfilePic,
      eventTotalAttendNumber: event.eventTotalAttendNumber,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    };
  }

  /**
   * Find event by ID (MongoDB ObjectId)
   */
  static async findById(eventId) {
    const db = getDB();
    const eventsCollection = db.collection('events');

    let objectId;
    try {
      objectId = typeof eventId === 'string' ? new ObjectId(eventId) : eventId;
    } catch (error) {
      return null;
    }

    return await eventsCollection.findOne({ _id: objectId });
  }

  /**
   * Find event by sequential eventId (E1, E2, etc.)
   */
  static async findByEventId(eventId) {
    const db = getDB();
    const eventsCollection = db.collection('events');
    return await eventsCollection.findOne({ eventId: eventId });
  }

  /**
   * Find events by creator (organiser)
   */
  static async findByCreator(creatorId, limit = 50, skip = 0) {
    const db = getDB();
    const eventsCollection = db.collection('events');

    let objectId = null;
    try {
      objectId = typeof creatorId === 'string' ? new ObjectId(creatorId) : creatorId;
    } catch (error) {
      objectId = null;
    }

    const creatorQuery = objectId
      ? { $in: [objectId, creatorId] }
      : creatorId;

    return await eventsCollection
      .find({ creatorId: creatorQuery })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .toArray();
  }

  /**
   * Find events with filters
   * Supports filtering by: eventType, eventSports, eventCreatorName, IsPrivateEvent, eventStatus, and date range
   * Note: Draft events are excluded from public listings unless explicitly requested
   */
  static async findWithFilters(filters = {}, limit = 50, skip = 0, excludeDrafts = true) {
    const db = getDB();
    const eventsCollection = db.collection('events');
    const { buildEventQuery } = require('../utils/eventFields');

    // Use centralized query builder
    const queryFilters = { ...filters, excludeDrafts };
    const query = buildEventQuery(queryFilters);

    // Sort by event date (upcoming first) or by creation date
    const sortField = filters.sortBy === 'date' ? { eventDateTime: 1 } : { createdAt: -1 };

    return await eventsCollection
      .find(query)
      .sort(sortField)
      .limit(limit)
      .skip(skip)
      .toArray();
  }

  /**
   * Update event
   * Note: Authorization is verified in the controller before calling this method
   */
  static async updateById(eventId, updateData) {
    const db = getDB();
    const eventsCollection = db.collection('events');

    let eventObjectId;
    try {
      eventObjectId = typeof eventId === 'string' ? new ObjectId(eventId) : eventId;
    } catch (error) {
      console.error('Error converting eventId in updateById:', error);
      return false;
    }

    // Ensure updateData is not empty
    if (!updateData || Object.keys(updateData).length === 0) {
      console.error('updateData is empty in updateById');
      return false;
    }

    updateData.updatedAt = new Date();

    // Update without creatorId check since authorization is already verified in controller
    const result = await eventsCollection.updateOne(
      { _id: eventObjectId },
      { $set: updateData }
    );

    // Log for debugging
    if (result.matchedCount === 0) {
      const eventExists = await eventsCollection.findOne({ _id: eventObjectId });
      console.error('Event not found:', {
        eventId: eventObjectId.toString(),
        eventExists: !!eventExists,
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      });
    } else if (result.modifiedCount === 0) {
      console.warn('Event found but no changes made (values may be the same):', {
        eventId: eventObjectId.toString(),
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        updateDataKeys: Object.keys(updateData),
      });
    }

    return result.modifiedCount > 0;
  }

  /**
   * Delete event
   * Note: Authorization is verified in the controller before calling this method
   */
  static async deleteById(eventId, creatorId) {
    const db = getDB();
    const eventsCollection = db.collection('events');

    let eventObjectId;
    try {
      eventObjectId = typeof eventId === 'string' ? new ObjectId(eventId) : eventId;
    } catch (error) {
      console.error('Error converting eventId in deleteById:', error);
      return false;
    }

    // Delete without creatorId check since authorization is already verified in controller
    const result = await eventsCollection.deleteOne({
      _id: eventObjectId,
    });

    if (result.deletedCount > 0) {
      // Update organiser's events count (creatorId is passed as string from controller)
      await this.updateEventsCount(creatorId, -1);
    }

    return result.deletedCount > 0;
  }

  /**
   * Update attendee count
   */
  static async updateAttendeeCount(eventId, increment) {
    const db = getDB();
    const eventsCollection = db.collection('events');

    let objectId;
    try {
      objectId = typeof eventId === 'string' ? new ObjectId(eventId) : eventId;
    } catch (error) {
      return false;
    }

    const event = await eventsCollection.findOne({ _id: objectId });
    if (!event) return false;

    // Support both old and new field names for backward compatibility during migration
    const currentCount = event.eventTotalAttendNumber !== undefined ? event.eventTotalAttendNumber : (event.gameAttendNumbers || 0);
    const newCount = Math.max(0, currentCount + increment);

    await eventsCollection.updateOne(
      { _id: objectId },
      { $set: { eventTotalAttendNumber: newCount } }
    );

    // Update organiser's total attendees
    await this.updateTotalAttendees(event.creatorId, increment);

    return true;
  }

  /**
   * Update events count for organiser
   */
  static async updateEventsCount(organiserId, increment) {
    const db = getDB();
    const usersCollection = db.collection('users');

    let objectId;
    try {
      objectId = typeof organiserId === 'string' ? new ObjectId(organiserId) : organiserId;
    } catch (error) {
      return;
    }

    const user = await usersCollection.findOne({ _id: objectId });
    if (!user) return;

    const currentCount = user.eventsCreated || 0;
    const newCount = Math.max(0, currentCount + increment);

    await usersCollection.updateOne(
      { _id: objectId },
      { $set: { eventsCreated: newCount } }
    );
  }

  /**
   * Update total attendees for organiser
   */
  static async updateTotalAttendees(organiserId, increment) {
    await this.recalculateTotalAttendees(organiserId);
  }

  /**
   * Recalculate total attendees (distinct users) for organiser
   */
  static async recalculateTotalAttendees(organiserId) {
    const db = getDB();
    const usersCollection = db.collection('users');
    const eventsCollection = db.collection('events');
    const joinsCollection = db.collection('eventJoins');

    let objectId;
    try {
      objectId = typeof organiserId === 'string' ? new ObjectId(organiserId) : organiserId;
    } catch (error) {
      return;
    }

    const user = await usersCollection.findOne({ _id: objectId });
    if (!user) return;

    const organiserIdString = objectId.toString();
    const events = await eventsCollection
      .find({ $or: [{ creatorId: objectId }, { creatorId: organiserIdString }] })
      .project({ _id: 1 })
      .toArray();

    if (events.length === 0) {
      await usersCollection.updateOne(
        { _id: objectId },
        { $set: { totalAttendees: 0 } }
      );
      return;
    }

    const eventIds = events.map((event) => event._id);
    const distinctUserIds = await joinsCollection.distinct('userId', {
      eventId: { $in: eventIds },
    });
    const newTotal = distinctUserIds.length;

    await usersCollection.updateOne(
      { _id: objectId },
      { $set: { totalAttendees: newTotal } }
    );
  }

  /**
   * Get event count for organiser
   */
  static async getEventCount(creatorId) {
    const db = getDB();
    const eventsCollection = db.collection('events');

    let objectId = null;
    try {
      objectId = typeof creatorId === 'string' ? new ObjectId(creatorId) : creatorId;
    } catch (error) {
      objectId = null;
    }

    const creatorQuery = objectId
      ? { $in: [objectId, creatorId] }
      : creatorId;

    return await eventsCollection.countDocuments({ creatorId: creatorQuery });
  }
}

module.exports = Event;

