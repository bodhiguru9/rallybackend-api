const EventReminder = require('../../models/EventReminder');
const Event = require('../../models/Event');
const User = require('../../models/User');
const { findEventById, validateEventId } = require('../../utils/eventHelper');
const { getPaginationParams, createPaginationResponse } = require('../../utils/pagination');

/**
 * @desc    Add reminder for an event
 * @route   POST /api/event-reminders/:eventId/add
 * @access  Private
 * 
 * Adds a reminder for a future event. User will receive WhatsApp notification 2 hours before event starts.
 */
const addEventReminder = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.id;

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

    // Check if event is in the future
    const eventDateTime = event.eventDateTime || event.gameStartDate;
    if (!eventDateTime) {
      return res.status(400).json({
        success: false,
        error: 'Event does not have a start date/time',
      });
    }

    const eventDate = new Date(eventDateTime);
    const now = new Date();

    if (eventDate <= now) {
      return res.status(400).json({
        success: false,
        error: 'Cannot set reminder for past or ongoing events. Only future events can have reminders.',
        eventStatus: eventDate < now ? 'past' : 'ongoing',
      });
    }

    // Add reminders (both event start and registration start if applicable)
    const reminders = await EventReminder.add(userId, eventId);

    // Separate reminders by type
    const eventStartReminder = reminders.find(r => r.reminderType === 'event_start');
    const registrationStartReminder = reminders.find(r => r.reminderType === 'registration_start');

    // Build response message
    let message = 'Event reminders added successfully.';
    const notificationTimes = [];
    
    if (eventStartReminder) {
      notificationTimes.push(`Event start: 2 hours before event (${eventStartReminder.reminderTime.toISOString()})`);
    }
    
    if (registrationStartReminder) {
      notificationTimes.push(`Registration start: at registration time (${registrationStartReminder.reminderTime.toISOString()})`);
    }

    res.status(200).json({
      success: true,
      message: message + ' You will receive WhatsApp notifications for: ' + notificationTimes.join(' and ') + '.',
      data: {
        reminders: reminders.map(r => ({
          reminderId: r._id.toString(),
          reminderType: r.reminderType,
          reminderTime: r.reminderTime,
          notificationTime: r.reminderType === 'event_start' 
            ? `2 hours before event (${r.reminderTime.toISOString()})`
            : `At registration start time (${r.reminderTime.toISOString()})`,
        })),
        event: {
          eventId: event.eventId,
          eventName: event.eventName || event.gameTitle,
          eventDateTime: eventDateTime,
          eventRegistrationStartTime: event.eventRegistrationStartTime || null,
          eventLocation: event.eventLocation || event.gameLocationArena,
        },
        totalReminders: reminders.length,
      },
    });
  } catch (error) {
    if (error.message === 'Event not found') {
      return res.status(404).json({
        success: false,
        error: 'Event not found',
      });
    }
    if (error.message === 'Reminder already set for this event') {
      return res.status(400).json({
        success: false,
        error: 'Reminder already set for this event',
      });
    }
    if (error.message === 'Cannot set reminder for past or ongoing events') {
      return res.status(400).json({
        success: false,
        error: 'Cannot set reminder for past or ongoing events',
      });
    }
    next(error);
  }
};

/**
 * @desc    Remove reminder for an event
 * @route   DELETE /api/event-reminders/:eventId/remove
 * @access  Private
 * 
 * Removes a reminder for an event.
 */
const removeEventReminder = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.id;

    // Validate eventId format
    const validation = validateEventId(eventId);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: validation.error,
        eventId: eventId,
      });
    }

    // Remove reminder
    const removed = await EventReminder.remove(userId, eventId);

    if (!removed) {
      return res.status(404).json({
        success: false,
        error: 'Reminder not found for this event',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Event reminder removed successfully',
      data: {
        eventId: eventId,
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
 * @desc    Get all reminders for logged-in user
 * @route   GET /api/event-reminders?page=1
 * @access  Private
 * 
 * Returns all event reminders set by the user.
 */
const getMyReminders = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { page, perPage, skip } = getPaginationParams(req.query.page, 20);

    // Get reminders
    const reminders = await EventReminder.getUserReminders(userId, perPage, skip);
    const totalCount = await EventReminder.getReminderCount(userId);
    const pagination = createPaginationResponse(totalCount, page, perPage);

    res.status(200).json({
      success: true,
      message: 'Event reminders retrieved successfully',
      data: {
        reminders: reminders,
        totalReminders: totalCount,
        pagination,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Check if user has reminder for an event
 * @route   GET /api/event-reminders/:eventId/check
 * @access  Private
 * 
 * Checks if the user has set a reminder for the specified event.
 */
const checkReminder = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.id;

    // Validate eventId format
    const validation = validateEventId(eventId);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: validation.error,
        eventId: eventId,
      });
    }

    // Check if reminder exists
    const hasReminder = await EventReminder.hasReminder(userId, eventId);

    res.status(200).json({
      success: true,
      data: {
        hasReminder: hasReminder,
        eventId: eventId,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  addEventReminder,
  removeEventReminder,
  getMyReminders,
  checkReminder,
};
