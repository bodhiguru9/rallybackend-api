const { getDB } = require('../config/database');
const { ObjectId } = require('mongodb');
const { findEventById } = require('../utils/eventHelper');

/**
 * Event Reminder Model
 * Handles event reminders for users
 */
class EventReminder {
  /**
   * Add event reminder for a user
   * Creates reminders for both event start (2 hours before) and registration start (if exists)
   * @param {string|ObjectId} userId - User ID (MongoDB ObjectId)
   * @param {string} eventId - Event ID (sequential eventId like "E1" or MongoDB ObjectId)
   * @returns {Promise<Array>} Array of created reminders
   */
  static async add(userId, eventId) {
    const db = getDB();
    const remindersCollection = db.collection('eventReminders');

    // Find event by sequential eventId or MongoDB ObjectId
    const event = await findEventById(eventId);
    if (!event) {
      throw new Error('Event not found');
    }

    // Use MongoDB ObjectId from found event
    const eventObjectId = event._id;
    const eventDateTime = event.eventDateTime || event.gameStartDate;
    const registrationStartTime = event.eventRegistrationStartTime || null;

    // Check if event is in the future
    if (!eventDateTime) {
      throw new Error('Event does not have a start date/time');
    }

    const eventDate = new Date(eventDateTime);
    const now = new Date();
    
    if (eventDate <= now) {
      throw new Error('Cannot set reminder for past or ongoing events');
    }

    const userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;

    // Check if any reminder already exists for this event
    const existing = await remindersCollection.findOne({
      userId: userObjectId,
      eventId: eventObjectId,
    });

    if (existing) {
      throw new Error('Reminder already set for this event');
    }

    const createdReminders = [];

    // 1. Create event start reminder (2 hours before event)
    const eventReminderTime = new Date(eventDate.getTime() - 2 * 60 * 60 * 1000); // 2 hours before
    
    const eventReminderData = {
      userId: userObjectId,
      eventId: eventObjectId,
      reminderType: 'event_start',
      eventDateTime: eventDate,
      reminderTime: eventReminderTime,
      notificationSent: false,
      createdAt: now,
      updatedAt: now,
    };

    const eventReminderResult = await remindersCollection.insertOne(eventReminderData);
    createdReminders.push({
      _id: eventReminderResult.insertedId,
      ...eventReminderData,
    });

    // 2. Create registration start reminder (if registration start time exists and is in the future)
    if (registrationStartTime) {
      const registrationDate = new Date(registrationStartTime);
      
      // Only create registration reminder if registration start is in the future
      if (registrationDate > now) {
        const registrationReminderData = {
          userId: userObjectId,
          eventId: eventObjectId,
          reminderType: 'registration_start',
          eventDateTime: eventDate,
          registrationStartTime: registrationDate,
          reminderTime: registrationDate, // Remind at exact registration start time
          notificationSent: false,
          createdAt: now,
          updatedAt: now,
        };

        const registrationReminderResult = await remindersCollection.insertOne(registrationReminderData);
        createdReminders.push({
          _id: registrationReminderResult.insertedId,
          ...registrationReminderData,
        });
      }
    }

    return createdReminders;
  }

  /**
   * Remove event reminder for a user
   * Removes all reminders (both event start and registration start) for the event
   * @param {string|ObjectId} userId - User ID (MongoDB ObjectId)
   * @param {string} eventId - Event ID (sequential eventId like "E1" or MongoDB ObjectId)
   * @returns {Promise<boolean>} Success status
   */
  static async remove(userId, eventId) {
    const db = getDB();
    const remindersCollection = db.collection('eventReminders');

    // Find event by sequential eventId or MongoDB ObjectId
    const event = await findEventById(eventId);
    if (!event) {
      throw new Error('Event not found');
    }

    // Use MongoDB ObjectId from found event
    const eventObjectId = event._id;
    const userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;

    // Remove all reminders for this event (both event_start and registration_start)
    const result = await remindersCollection.deleteMany({
      userId: userObjectId,
      eventId: eventObjectId,
    });

    return result.deletedCount > 0;
  }

  /**
   * Check if user has reminder for event
   * @param {string|ObjectId} userId - User ID (MongoDB ObjectId)
   * @param {string} eventId - Event ID (sequential eventId like "E1" or MongoDB ObjectId)
   * @returns {Promise<boolean>} True if reminder exists
   */
  static async hasReminder(userId, eventId) {
    const db = getDB();
    const remindersCollection = db.collection('eventReminders');

    // Find event by sequential eventId or MongoDB ObjectId
    const event = await findEventById(eventId);
    if (!event) {
      return false;
    }

    // Use MongoDB ObjectId from found event
    const eventObjectId = event._id;

    const reminder = await remindersCollection.findOne({
      userId: typeof userId === 'string' ? new ObjectId(userId) : userId,
      eventId: eventObjectId,
    });

    return !!reminder;
  }

  /**
   * Get all reminders for a user
   * @param {string|ObjectId} userId - User ID (MongoDB ObjectId)
   * @param {number} limit - Maximum number of results
   * @param {number} skip - Number of results to skip
   * @returns {Promise<Array>} Array of reminders with event details
   */
  static async getUserReminders(userId, limit = 100, skip = 0) {
    const db = getDB();
    const remindersCollection = db.collection('eventReminders');
    const eventsCollection = db.collection('events');

    const userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;

    const reminders = await remindersCollection
      .find({
        userId: userObjectId,
      })
      .sort({ reminderTime: 1 }) // Sort by reminder time (upcoming first)
      .limit(limit)
      .skip(skip)
      .toArray();

    if (reminders.length === 0) {
      return [];
    }

    // Get event details for each reminder
    const eventIds = reminders.map(r => r.eventId);
    const events = await eventsCollection.find({ _id: { $in: eventIds } }).toArray();

    return reminders.map(reminder => {
      const event = events.find(e => e._id.toString() === reminder.eventId.toString());
      
      return {
        reminderId: reminder._id.toString(),
        reminderType: reminder.reminderType || 'event_start', // 'event_start' or 'registration_start'
        event: event ? {
          eventId: event.eventId,
          eventName: event.eventName || event.gameTitle,
          eventDateTime: event.eventDateTime || event.gameStartDate,
          eventLocation: event.eventLocation || event.gameLocationArena,
          eventRegistrationStartTime: event.eventRegistrationStartTime || null,
        } : null,
        reminderTime: reminder.reminderTime,
        eventDateTime: reminder.eventDateTime,
        registrationStartTime: reminder.registrationStartTime || null,
        notificationSent: reminder.notificationSent,
        createdAt: reminder.createdAt,
      };
    });
  }

  /**
   * Get reminders that need to be sent (for cron job)
   * @param {Date} currentTime - Current time
   * @returns {Promise<Array>} Array of reminders to send
   */
  static async getRemindersToSend(currentTime = new Date()) {
    const db = getDB();
    const remindersCollection = db.collection('eventReminders');

    // Find reminders where:
    // 1. reminderTime is within the next 5 minutes (to account for cron job interval)
    // 2. notificationSent is false
    const fiveMinutesFromNow = new Date(currentTime.getTime() + 5 * 60 * 1000);

    const reminders = await remindersCollection
      .find({
        reminderTime: {
          $lte: fiveMinutesFromNow,
          $gte: currentTime,
        },
        notificationSent: false,
      })
      .toArray();

    return reminders;
  }

  /**
   * Mark reminder as sent
   * @param {string|ObjectId} reminderId - Reminder ID (MongoDB ObjectId)
   * @returns {Promise<boolean>} Success status
   */
  static async markAsSent(reminderId) {
    const db = getDB();
    const remindersCollection = db.collection('eventReminders');

    const reminderObjectId = typeof reminderId === 'string' ? new ObjectId(reminderId) : reminderId;

    const result = await remindersCollection.updateOne(
      { _id: reminderObjectId },
      {
        $set: {
          notificationSent: true,
          notificationSentAt: new Date(),
          updatedAt: new Date(),
        },
      }
    );

    return result.modifiedCount > 0;
  }

  /**
   * Get reminder count for a user
   * @param {string|ObjectId} userId - User ID (MongoDB ObjectId)
   * @returns {Promise<number>} Count of reminders
   */
  static async getReminderCount(userId) {
    const db = getDB();
    const remindersCollection = db.collection('eventReminders');

    const userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;

    return await remindersCollection.countDocuments({
      userId: userObjectId,
    });
  }
}

module.exports = EventReminder;
