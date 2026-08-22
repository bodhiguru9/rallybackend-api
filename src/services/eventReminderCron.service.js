const EventReminder = require('../models/EventReminder');
const Event = require('../models/Event');
const User = require('../models/User');
const { getTwilioClient, normalizeMobileNumberForWhatsApp } = require('./twilio.service');
const { sendPushNotification, sendPushToMany } = require('./push.service');
const { getDB } = require('../config/database');
const { ObjectId } = require('mongodb');

/**
 * Send WhatsApp reminder notification
 * @param {Object} reminder - Reminder object from database
 * @param {Object} event - Event object
 * @param {Object} user - User object
 */
const sendWhatsAppReminder = async (reminder, event, user) => {
  const client = getTwilioClient();
  
  if (!client) {
    console.log('Twilio not configured, skipping WhatsApp reminder');
    return { success: false, message: 'Twilio not configured' };
  }

  // Get Twilio WhatsApp number from env
  let twilioWhatsAppNumber = process.env.TWILIO_WHATSAPP_NUMBER;
  
  if (!twilioWhatsAppNumber) {
    twilioWhatsAppNumber = 'whatsapp:+97142589790'; // Default UAE WhatsApp number
  } else {
    if (!twilioWhatsAppNumber.startsWith('whatsapp:')) {
      twilioWhatsAppNumber = `whatsapp:${twilioWhatsAppNumber}`;
    }
  }

  try {
    // Get user's mobile number
    if (!user.mobileNumber) {
      console.log(`User ${user.userId} does not have a mobile number, skipping reminder`);
      return { success: false, message: 'User does not have mobile number' };
    }

    // Normalize mobile number
    const normalizedNumber = normalizeMobileNumberForWhatsApp(user.mobileNumber);
    const whatsappNumber = `whatsapp:${normalizedNumber}`;

    // Determine reminder type
    const reminderType = reminder.reminderType || 'event_start';
    
    // Format event date/time
    const eventDate = new Date(event.eventDateTime || event.gameStartDate);
    const eventDateStr = eventDate.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    // Create reminder message based on type
    const eventName = event.eventName || event.gameTitle || 'Event';
    const eventLocation = event.eventLocation || event.gameLocationArena || 'Location TBD';
    const appName = process.env.APP_NAME || 'Rally';

    let messageBody = '';
    
    if (reminderType === 'registration_start') {
      // Registration start reminder
      const registrationDate = new Date(reminder.registrationStartTime || reminder.reminderTime);
      const registrationDateStr = registrationDate.toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      messageBody = `🔔 ${appName} Registration Reminder

Registration for "${eventName}" is now open!

📅 Registration Started: ${registrationDateStr}
📅 Event Date & Time: ${eventDateStr}
📍 Location: ${eventLocation}

Register now to secure your spot! 🎉`;
    } else {
      // Event start reminder (2 hours before)
      messageBody = `🔔 ${appName} Event Reminder

Your event "${eventName}" is starting in 2 hours!

📅 Date & Time: ${eventDateStr}
📍 Location: ${eventLocation}

See you there! 🎉`;
    }

    // Send WhatsApp message
    const message = await client.messages.create({
      from: twilioWhatsAppNumber,
      to: whatsappNumber,
      body: messageBody,
    });

    console.log(`WhatsApp reminder sent to ${user.mobileNumber} for event ${event.eventId}`);
    
    return {
      success: true,
      messageSid: message.sid,
      status: message.status,
    };
  } catch (error) {
    console.error(`Error sending WhatsApp reminder to ${user.mobileNumber}:`, error);
    throw error;
  }
};

/**
 * Process and send reminders that are due
 * This function is called by the cron job
 */
const processReminders = async () => {
  try {
    const db = getDB();
    const remindersCollection = db.collection('eventReminders');
    const eventsCollection = db.collection('events');
    const usersCollection = db.collection('users');

    const now = new Date();
    
    // Get reminders that need to be sent
    const reminders = await EventReminder.getRemindersToSend(now);

    if (reminders.length === 0) {
      return { processed: 0, sent: 0, failed: 0 };
    }

    console.log(`Processing ${reminders.length} event reminders...`);

    let sentCount = 0;
    let failedCount = 0;

    // Process each reminder
    for (const reminder of reminders) {
      try {
        // Get event details
        const event = await eventsCollection.findOne({ _id: reminder.eventId });
        if (!event) {
          console.log(`Event not found for reminder ${reminder._id}`);
          await EventReminder.markAsSent(reminder._id); // Mark as sent to avoid retrying
          continue;
        }

        // Check if reminder is still valid based on type
        const reminderType = reminder.reminderType || 'event_start';
        
        if (reminderType === 'registration_start') {
          // For registration start, check if registration time has passed
          const registrationTime = reminder.registrationStartTime || reminder.reminderTime;
          const registrationDate = new Date(registrationTime);
          if (registrationDate < now) {
            // Registration time has passed, mark reminder as sent and skip
            await EventReminder.markAsSent(reminder._id);
            continue;
          }
        } else {
          // For event start, check if event date has passed
          const eventDate = new Date(event.eventDateTime || event.gameStartDate);
          if (eventDate <= now) {
            // Event has passed, mark reminder as sent and skip
            await EventReminder.markAsSent(reminder._id);
            continue;
          }
        }

        // Get user details
        const user = await usersCollection.findOne({ _id: reminder.userId });
        if (!user) {
          console.log(`User not found for reminder ${reminder._id}`);
          await EventReminder.markAsSent(reminder._id);
          continue;
        }

        // Send WhatsApp notification
        const result = await sendWhatsAppReminder(reminder, event, user);

        if (result.success) {
          // Mark reminder as sent
          await EventReminder.markAsSent(reminder._id);
          sentCount++;
          console.log(`✅ Reminder sent to user ${user.userId} for event ${event.eventId}`);
        } else {
          failedCount++;
          console.log(`❌ Failed to send reminder to user ${user.userId} for event ${event.eventId}`);
        }
      } catch (error) {
        console.error(`Error processing reminder ${reminder._id}:`, error);
        failedCount++;
        // Don't mark as sent if there was an error, so it can be retried
      }
    }

    return {
      processed: reminders.length,
      sent: sentCount,
      failed: failedCount,
    };
  } catch (error) {
    console.error('Error in processReminders:', error);
    return {
      processed: 0,
      sent: 0,
      failed: 0,
      error: error.message,
    };
  }
};

/**
 * Process events starting in ~6 hours and send push reminders.
 * Runs every 5 min. Uses a 'push_6h' field on eventReminders to avoid duplicate sends.
 */
const process6hPushReminders = async () => {
  try {
    const db = getDB();
    const eventsCollection = db.collection('events');
    const eventJoinsCollection = db.collection('eventJoins');
    const sentCollection = db.collection('push6hReminders'); // dedup store

    const now = new Date();
    // Window: 6h from now ±5 min
    const windowStart = new Date(now.getTime() + (6 * 60 - 5) * 60 * 1000);
    const windowEnd   = new Date(now.getTime() + (6 * 60 + 5) * 60 * 1000);

    const events = await eventsCollection.find({
      $or: [
        { eventDateTime: { $gte: windowStart, $lte: windowEnd } },
        { gameStartDate: { $gte: windowStart, $lte: windowEnd } },
      ],
      eventStatus: { $nin: ['cancelled', 'draft'] },
    }).toArray();

    if (events.length === 0) return { processed: 0, sent: 0 };

    let sentCount = 0;

    for (const event of events) {
      const eventKey = event._id.toString();

      // Dedup: skip if already sent for this event
      const alreadySent = await sentCollection.findOne({ eventId: eventKey });
      if (alreadySent) continue;

      const eventName = event.eventName || event.gameTitle || 'your event';
      const pushTitle = '⏰ Event in 6 Hours!';
      const pushBody  = `"${eventName}" starts in 6 hours. Get ready!`;
      const pushData  = {
        type: 'event_reminder',
        eventId: eventKey,
        eventSeqId: event.eventId ? String(event.eventId) : '',
      };

      // Fetch all participants
      const joins = await eventJoinsCollection
        .find({ eventId: event._id })
        .project({ userId: 1 })
        .toArray();

      const participantIds = [...new Set(joins.map(j => j.userId?.toString()).filter(Boolean))];

      // Collect tokens for participants
      const participantTokens = [];
      for (const uid of participantIds) {
        try {
          const u = await User.findById(uid);
          if (u && u.fcmToken) participantTokens.push(u.fcmToken);
        } catch (_) { /* non-fatal */ }
      }

      if (participantTokens.length > 0) {
        await sendPushToMany({ tokens: participantTokens, title: pushTitle, body: pushBody, data: pushData });
        sentCount += participantTokens.length;
      }

      // Also notify the organiser
      try {
        const organiser = await User.findById(event.creatorId?.toString());
        if (organiser && organiser.fcmToken) {
          await sendPushNotification({
            token: organiser.fcmToken,
            title: '⏰ Your Event in 6 Hours!',
            body: `"${eventName}" starts in 6 hours. ${participantIds.length} player(s) are coming!`,
            data: { ...pushData, role: 'organiser' },
          });
          sentCount++;
        }
      } catch (_) { /* non-fatal */ }

      // Mark as sent for this event
      await sentCollection.insertOne({ eventId: eventKey, sentAt: now });
      console.log(`🔔 [6H-PUSH] Sent reminder for "${eventName}" to ${participantTokens.length} participants + organiser`);
    }

    return { processed: events.length, sent: sentCount };
  } catch (err) {
    console.error('❌ [6H-PUSH] Error in process6hPushReminders:', err.message);
    return { processed: 0, sent: 0, error: err.message };
  }
};

/**
 * Start the cron job for processing reminders
 * Runs every 5 minutes to check for reminders that need to be sent
 */
const startReminderCronJob = () => {
  // Check every 5 minutes
  const interval = 5 * 60 * 1000; // 5 minutes in milliseconds

  console.log('🕐 Event reminder cron job started (checking every 5 minutes)');

  // Run immediately on start
  processReminders().then(result => {
    console.log('Initial reminder check:', result);
  });

  process6hPushReminders().then(result => {
    if (result.sent > 0) console.log('Initial 6h push reminder check:', result);
  });

  // Then run every 5 minutes
  setInterval(async () => {
    const result = await processReminders();
    if (result.sent > 0 || result.failed > 0) {
      console.log('Reminder cron job result:', result);
    }
  }, interval);

  // 6h push reminder — also every 5 minutes
  setInterval(async () => {
    const result = await process6hPushReminders();
    if (result.sent > 0) {
      console.log('[6H-PUSH] cron result:', result);
    }
  }, interval);
};

module.exports = {
  processReminders,
  process6hPushReminders,
  startReminderCronJob,
  sendWhatsAppReminder,
};
