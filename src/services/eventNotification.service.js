const { notifyUser } = require('./notification.service');
const { createOrGetContentTemplate } = require('./twilio.service');
const Notification = require('../models/Notification');
const User = require('../models/User');

const APP_NAME = process.env.APP_NAME || 'Rally';

// ─── Template definitions (mirrors createOrGetOTPTemplate pattern) ────────
// Each template has a friendlyName (for Twilio lookup/cache) and a body with
// numbered placeholders.  The first call creates the template in Twilio;
// subsequent calls use the in-memory cached SID.
const TEMPLATES = {
  bookingConfirmed: {
    friendlyName: `${APP_NAME} Booking Confirmed`,
    body: `Hi {{1}}, your booking is confirmed for {{2}} on {{3}} at {{4}}. Booking ID: {{5}}.`,
  },
  newBooking: {
    friendlyName: `${APP_NAME} New Booking`,
    body: `Hi {{1}}, {{2}} has joined your event {{3}} on {{4}} at {{5}}.`,
  },
  bookingCancelled: {
    friendlyName: `${APP_NAME} Booking Cancelled`,
    body: `Hi {{1}}, your booking for {{2}} on {{3}} at {{4}} has been cancelled.`,
  },
  hostBookingCancelled: {
    friendlyName: `${APP_NAME} Host Booking Cancelled`,
    body: `Hi {{1}}, {{2}} cancelled their booking for {{3}} on {{4}} at {{5}}.`,
  },
  eventCancelled: {
    friendlyName: `${APP_NAME} Event Cancelled`,
    body: `Hi {{1}}, we're sorry to inform you that {{2}}, scheduled for {{3}} at {{4}}, has been cancelled by the organiser. Any amount paid will be refunded to your account.`,
  },
};

/**
 * Resolve the content SID for a notification template.
 * Priority: env var override → dynamic create/find via Twilio Content API → null (freeform fallback)
 */
const resolveTemplateSid = async (envVarName, templateDef) => {
  // 1. Explicit env-var override always wins
  const envSid = process.env[envVarName];
  if (envSid) return envSid;

  // 2. Dynamic create-or-get (same approach as OTP)
  try {
    const sid = await createOrGetContentTemplate(templateDef.friendlyName, templateDef.body);
    return sid; // may be null if Twilio is not configured
  } catch (err) {
    console.error(`⚠️ resolveTemplateSid(${envVarName}) failed:`, err.message);
    return null;
  }
};

// ─── Helpers ──────────────────────────────────────────────────────────────

const resolveEventTimeZone = ({ booking, event, user }) => {
  return (
    booking?.timeZone ||
    event?.timeZone ||
    event?.eventTimeZone ||
    user?.timeZone ||
    user?.timezone ||
    'Asia/Dubai'
  );
};

const formatEventDate = (startDateValue, endDateValue, timeZone = 'Asia/Dubai') => {
  if (!startDateValue) return 'TBD';
  const d = new Date(startDateValue);
  if (Number.isNaN(d.getTime())) return 'TBD';

  let formattedStart = d.toLocaleString('en-US', {
    timeZone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  if (endDateValue) {
    const endDates = new Date(endDateValue);
    if (!Number.isNaN(endDates.getTime())) {
      const formattedEnd = endDates.toLocaleString('en-US', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
      });
      return `${formattedStart} - ${formattedEnd}`;
    }
  }

  return formattedStart;
};

// ─── Booking Confirmed → Player ───────────────────────────────────────────
const sendBookingConfirmedNotification = async ({ user, event, booking }) => {
  console.log('📣 [BOOKING-CONFIRMED] Called for player:', user?.fullName, '| email:', user?.email, '| mobile:', user?.mobileNumber, '| whatsapp:', user?.whatsappNumber, '| event:', event?.eventName);
  const eventName = event?.eventName || 'Event';
  const timeZone = resolveEventTimeZone({ booking, event, user });
  const eventDate = formatEventDate(
    booking?.occurrenceStart || event?.eventDateTime || event?.gameStartDate,
    booking?.occurrenceEnd || event?.eventEndDateTime || event?.gameEndDate,
    timeZone
  );
  const eventLocation = event?.eventLocation || 'Location will be shared soon';
  const userName = user?.fullName || 'User';
  const bookingId = booking?.bookingId || 'N/A';

  const subject = `Booking confirmed for ${eventName}`;
  const text = `Hi ${userName}, your booking is confirmed for ${eventName} on ${eventDate} at ${eventLocation}. Booking ID: ${bookingId}.`;
  const html = `
    <p>Hi ${userName},</p>
    <p>Your booking is confirmed for <strong>${eventName}</strong>.</p>
    <p><strong>Date:</strong> ${eventDate}</p>
    <p><strong>Location:</strong> ${eventLocation}</p>
    <p><strong>Booking ID:</strong> ${bookingId}</p>
  `;
  const whatsappMessage = text;

  // Resolve template SID (env var → dynamic creation → null/freeform)
  const contentSid = await resolveTemplateSid('WHATSAPP_BOOKING_CONFIRMED_SID', TEMPLATES.bookingConfirmed);
  const whatsappTemplate = contentSid
    ? {
        contentSid,
        contentVariables: { '1': userName, '2': eventName, '3': eventDate, '4': eventLocation, '5': bookingId },
      }
    : null;

  // In-app notification to Player
  try {
    await Notification.create(
      user._id || user.id,
      'booking_confirmed',
      'Booking Confirmed',
      `Your booking for "${eventName}" is confirmed!`,
      {
        eventId: event._id ? event._id.toString() : null,
        bookingId: booking._id || booking.bookingId,
        eventName: eventName,
        occurrenceStart: booking.occurrenceStart || null,
      }
    );
  } catch (notifError) {
    console.error('In-app booking notification failed:', notifError.message);
  }

  return await notifyUser({ user, subject, text, html, whatsappMessage, whatsappTemplate });
};

// ─── New Booking → Organiser ──────────────────────────────────────────────
const sendHostBookingNotification = async ({ player, event, booking }) => {
  console.log('📣 [HOST-BOOKING] Called for organiser. player:', player?.fullName, '| event:', event?.eventName, '| creatorId:', event?.creatorId, '| userId:', event?.userId);
  const eventName = event?.eventName || 'Event';
  const playerName = player?.fullName || 'A player';
  const hostId = event?.creatorId || event?.userId;
  const timeZone = resolveEventTimeZone({ booking, event, user: player });
  const eventDate = formatEventDate(
    booking?.occurrenceStart || event?.eventDateTime || event?.gameStartDate,
    booking?.occurrenceEnd || event?.eventEndDateTime || event?.gameEndDate,
    timeZone
  );
  const eventLocation = event?.eventLocation || 'Location will be shared soon';

  if (!hostId) {
    console.error('No host ID found to send booking notification');
    return null;
  }

  // In-app notification for host
  try {
    await Notification.create(
      hostId,
      'new_booking',
      'New Booking',
      `${playerName} joined your event "${eventName}"`,
      {
        eventId: event._id ? event._id.toString() : null,
        bookingId: booking._id || booking.bookingId,
        playerName: playerName,
        playerId: player.userId || player.id,
        playerProfilePic: player.profilePic || null,
        eventName: eventName,
        occurrenceStart: booking.occurrenceStart || null,
      }
    );
  } catch (notifError) {
    console.error('In-app host booking notification failed:', notifError.message);
  }

  // Email/WhatsApp to host
  try {
    const host = await User.findById(hostId);
    if (host) {
      const hostName = host.fullName || 'Organiser';
      const subject = `New booking for ${eventName}`;
      const text = `Hi ${hostName}, ${playerName} has joined your event "${eventName}" on ${eventDate} at ${eventLocation}.`;
      const html = `
        <p>Hi ${hostName},</p>
        <p><strong>${playerName}</strong> has joined your event <strong>${eventName}</strong>.</p>
        <p><strong>Date:</strong> ${eventDate}</p>
        <p><strong>Location:</strong> ${eventLocation}</p>
      `;
      const whatsappMessage = text;

      const contentSid = await resolveTemplateSid('WHATSAPP_NEW_BOOKING_SID', TEMPLATES.newBooking);
      const whatsappTemplate = contentSid
        ? {
            contentSid,
            contentVariables: { '1': hostName, '2': playerName, '3': eventName, '4': eventDate, '5': eventLocation },
          }
        : null;

      await notifyUser({ user: host, subject, text, html, whatsappMessage, whatsappTemplate });
    }
  } catch (hostNotifyError) {
    console.error('Host email/WhatsApp notification failed:', hostNotifyError.message);
  }

  return true;
};

// ─── Booking Cancelled → Player ───────────────────────────────────────────
const sendPlayerCancelledBookingNotification = async ({ user, event, booking, refundMessage }) => {
  const eventName = event?.eventName || 'Event';
  const timeZone = resolveEventTimeZone({ booking, event, user });
  const eventDate = formatEventDate(
    booking?.occurrenceStart || event?.eventDateTime || event?.gameStartDate,
    booking?.occurrenceEnd || event?.eventEndDateTime || event?.gameEndDate,
    timeZone
  );
  const eventLocation = event?.eventLocation || 'Location will be shared soon';
  const userName = user?.fullName || 'User';
  const refundLine = refundMessage ? `\n${refundMessage}` : '';

  const subject = `Booking cancelled for ${eventName}`;
  const text = `Hi ${userName}, your booking for "${eventName}" on ${eventDate} at ${eventLocation} has been cancelled.${refundLine}`;
  const html = `
    <p>Hi ${userName},</p>
    <p>Your booking for <strong>${eventName}</strong> has been cancelled.</p>
    <p><strong>Date:</strong> ${eventDate}</p>
    <p><strong>Location:</strong> ${eventLocation}</p>
    ${refundMessage ? `<p>${refundMessage}</p>` : ''}
  `;
  const whatsappMessage = text;

  const contentSid = await resolveTemplateSid('WHATSAPP_BOOKING_CANCELLED_SID', TEMPLATES.bookingCancelled);
  const whatsappTemplate = contentSid
    ? {
        contentSid,
        contentVariables: { '1': userName, '2': eventName, '3': eventDate, '4': eventLocation },
      }
    : null;

  return await notifyUser({ user, subject, text, html, whatsappMessage, whatsappTemplate });
};

// ─── Booking Cancelled → Organiser ────────────────────────────────────────
const sendHostCancelledBookingNotification = async ({ player, event, booking }) => {
  const eventName = event?.eventName || 'Event';
  const playerName = player?.fullName || 'A player';
  const hostId = event?.creatorId || event?.userId;
  const timeZone = resolveEventTimeZone({ booking, event, user: player });
  const eventDate = formatEventDate(
    booking?.occurrenceStart || event?.eventDateTime || event?.gameStartDate,
    booking?.occurrenceEnd || event?.eventEndDateTime || event?.gameEndDate,
    timeZone
  );
  const eventLocation = event?.eventLocation || 'Location will be shared soon';

  if (!hostId) return null;

  try {
    const host = await User.findById(hostId);
    if (host) {
      const hostName = host.fullName || 'Organiser';
      const subject = `Booking cancelled for ${eventName}`;
      const text = `Hi ${hostName}, ${playerName} cancelled their booking for "${eventName}" on ${eventDate} at ${eventLocation}.`;
      const html = `
        <p>Hi ${hostName},</p>
        <p><strong>${playerName}</strong> cancelled their booking for <strong>${eventName}</strong>.</p>
        <p><strong>Date:</strong> ${eventDate}</p>
        <p><strong>Location:</strong> ${eventLocation}</p>
      `;
      const whatsappMessage = text;

      const contentSid = await resolveTemplateSid('WHATSAPP_HOST_BOOKING_CANCELLED_SID', TEMPLATES.hostBookingCancelled);
      const whatsappTemplate = contentSid
        ? {
            contentSid,
            contentVariables: { '1': hostName, '2': playerName, '3': eventName, '4': eventDate, '5': eventLocation },
          }
        : null;

      await notifyUser({ user: host, subject, text, html, whatsappMessage, whatsappTemplate });
    }
  } catch (err) {
    console.error('Host cancellation email/WhatsApp failed:', err.message);
  }

  return true;
};

// ─── Event Cancelled (by Organiser) → Player ─────────────────────────────
const sendEventCancelledNotification = async ({ user, event }) => {
  const eventName = event?.eventName || 'Event';
  const timeZone = resolveEventTimeZone({ event, user });
  const eventDate = formatEventDate(
    event?.eventDateTime || event?.gameStartDate,
    event?.eventEndDateTime || event?.gameEndDate,
    timeZone
  );
  const eventLocation = event?.eventLocation || 'Location will be shared soon';
  const userName = user?.fullName || 'User';

  const subject = `Event cancelled: ${eventName}`;
  const text = `Hi ${userName}, we're sorry to inform you that ${eventName}, scheduled for ${eventDate} at ${eventLocation}, has been cancelled by the organiser. Any amount paid will be refunded to your account`;
  const html = `
    <p>Hi ${userName},</p>
    <p>We're sorry to inform you that <strong>${eventName}</strong>, scheduled for <strong>${eventDate}</strong> at <strong>${eventLocation}</strong>, has been cancelled by the organiser. Any amount paid will be refunded to your account</p>
  `;
  const whatsappMessage = text;

  const contentSid = await resolveTemplateSid('WHATSAPP_EVENT_CANCELLED_SID', TEMPLATES.eventCancelled);
  const whatsappTemplate = contentSid
    ? {
        contentSid,
        contentVariables: { '1': userName, '2': eventName, '3': eventDate, '4': eventLocation },
      }
    : null;

  return await notifyUser({ user, subject, text, html, whatsappMessage, whatsappTemplate });
};

module.exports = {
  sendBookingConfirmedNotification,
  sendHostBookingNotification,
  sendPlayerCancelledBookingNotification,
  sendHostCancelledBookingNotification,
  sendEventCancelledNotification,
};