const { notifyUser } = require('./notification.service');
const { createOrGetContentTemplate } = require('./twilio.service');
const { sendPushNotification } = require('./push.service');
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
  waitlistSpotAvailable: {
    friendlyName: `${APP_NAME} Waitlist Spot Available`,
    body: `Hi {{1}}, a spot has opened up for {{2}} on {{3}}! Book now before it's gone: {{4}}`,
  },
  waitlistEventFull: {
    friendlyName: `${APP_NAME} Waitlist Event Full`,
    body: `Hi {{1}}, we're sorry but the last available spot for {{2}} has just been taken. You are still on the waitlist in case another spot opens.`,
  },
  waitlistJoinHost: {
    friendlyName: `${APP_NAME} New Waitlist Request`,
    body: `Hi {{1}}, {{2}} has joined the waitlist for your full event {{3}} on {{4}}.`,
  },
  organiserJoinRequest: {
    friendlyName: `${APP_NAME} New Community Join Request`,
    body: `Hi {{1}}, {{2}} has requested to join your community {{3}}.`,
  },
  eventRequestAccepted: {
    friendlyName: `${APP_NAME} Event Request Accepted`,
    body: `Hi {{1}}, your request to join {{2}} has been accepted! {{3}}`,
  },
  eventRequestRejected: {
    friendlyName: `${APP_NAME} Event Request Rejected`,
    body: `Hi {{1}}, we're sorry but your request to join {{2}} was not accepted.`,
  },
  organiserRequestAccepted: {
    friendlyName: `${APP_NAME} Community Request Accepted`,
    body: `Hi {{1}}, your request to join {{2}} has been accepted!`,
  },
  organiserRequestRejected: {
    friendlyName: `${APP_NAME} Community Request Rejected`,
    body: `Hi {{1}}, your request to join {{2}} was not accepted.`,
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
  const guestsCount = booking?.guestsCount || 1;
  // Human-readable party size suffix
  const partySuffix = guestsCount > 1 ? ` (${guestsCount} spots)` : '';

  const subject = `Booking confirmed for ${eventName}`;
  const text = `Hi ${userName}, your booking${partySuffix} is confirmed for ${eventName} on ${eventDate} at ${eventLocation}. Booking ID: ${bookingId}.`;
  const html = `
    <p>Hi ${userName},</p>
    <p>Your booking${partySuffix} is confirmed for <strong>${eventName}</strong>.</p>
    <p><strong>Date:</strong> ${eventDate}</p>
    <p><strong>Location:</strong> ${eventLocation}</p>
    <p><strong>Booking ID:</strong> ${bookingId}</p>
    ${guestsCount > 1 ? `<p><strong>Party size:</strong> ${guestsCount} (you + ${guestsCount - 1} guest${guestsCount - 1 === 1 ? '' : 's'})</p>` : ''}
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
      guestsCount > 1
        ? `Your booking for "${eventName}" is confirmed (${guestsCount} spots)!`
        : `Your booking for "${eventName}" is confirmed!`,
      {
        eventId: event._id ? event._id.toString() : null,
        bookingId: booking._id || booking.bookingId,
        eventName: eventName,
        occurrenceStart: booking.occurrenceStart || null,
        guestsCount,
      }
    );
  } catch (notifError) {
    console.error('In-app booking notification failed:', notifError.message);
  }

  // Push notification to player
  if (user.fcmToken) {
    sendPushNotification({
      token: user.fcmToken,
      title: 'Booking Confirmed 🎉',
      body: `Your booking for "${eventName}" is confirmed!`,
      data: {
        type: 'booking_confirmed',
        eventId: event._id ? event._id.toString() : '',
        eventSeqId: event.eventId ? String(event.eventId) : '',
        bookingId: String(booking._id || booking.bookingId || ''),
      },
    }).catch(err => console.error('[PUSH] booking_confirmed failed:', err.message));
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
  const guestsCount = booking?.guestsCount || 1;
  // Human-readable guest suffix for organiser
  const guestSuffix = guestsCount > 1
    ? ` (bringing ${guestsCount - 1} guest${guestsCount - 1 === 1 ? '' : 's'})`
    : '';

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
      guestsCount > 1
        ? `${playerName} joined your event "${eventName}"${guestSuffix}`
        : `${playerName} joined your event "${eventName}"`,
      {
        eventId: event._id ? event._id.toString() : null,
        bookingId: booking._id || booking.bookingId,
        playerName: playerName,
        playerId: player.userId || player.id,
        playerProfilePic: player.profilePic || null,
        eventName: eventName,
        occurrenceStart: booking.occurrenceStart || null,
        guestsCount,
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
      const text = `Hi ${hostName}, ${playerName} has joined your event "${eventName}"${guestSuffix} on ${eventDate} at ${eventLocation}.`;
      const html = `
        <p>Hi ${hostName},</p>
        <p><strong>${playerName}</strong> has joined your event <strong>${eventName}</strong>${guestSuffix}.</p>
        <p><strong>Date:</strong> ${eventDate}</p>
        <p><strong>Location:</strong> ${eventLocation}</p>
        ${guestsCount > 1 ? `<p><strong>Party size:</strong> ${guestsCount} (player + ${guestsCount - 1} guest${guestsCount - 1 === 1 ? '' : 's'})</p>` : ''}
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

      // Push notification to organiser
      if (host.fcmToken) {
        sendPushNotification({
          token: host.fcmToken,
          title: 'New Booking! 🎯',
          body: `${playerName} just booked "${eventName}"${guestSuffix}.`,
          data: {
            type: 'new_booking',
            eventId: event._id ? event._id.toString() : '',
            eventSeqId: event.eventId ? String(event.eventId) : '',
            playerId: String(player.userId || player.id || ''),
          },
        }).catch(err => console.error('[PUSH] new_booking (host) failed:', err.message));
      }
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

  // Push notification to player (cancellation)
  if (user.fcmToken) {
    sendPushNotification({
      token: user.fcmToken,
      title: 'Booking Cancelled',
      body: `Your booking for "${eventName}" has been cancelled.`,
      data: {
        type: 'booking_cancelled',
        eventId: event._id ? event._id.toString() : '',
        eventSeqId: event.eventId ? String(event.eventId) : '',
      },
    }).catch(err => console.error('[PUSH] booking_cancelled (player) failed:', err.message));
  }

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

      // Push notification to organiser
      if (host.fcmToken) {
        sendPushNotification({
          token: host.fcmToken,
          title: 'Booking Cancelled',
          body: `${playerName} cancelled their booking for "${eventName}".`,
          data: {
            type: 'booking_cancelled',
            eventId: event._id ? event._id.toString() : '',
            eventSeqId: event.eventId ? String(event.eventId) : '',
          },
        }).catch(err => console.error('[PUSH] host_booking_cancelled failed:', err.message));
      }
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

  // Push notification to player (event cancelled by organiser)
  if (user.fcmToken) {
    sendPushNotification({
      token: user.fcmToken,
      title: 'Session Cancelled',
      body: `"${eventName}" has been cancelled by the organiser.`,
      data: {
        type: 'event_cancelled',
        eventId: event._id ? event._id.toString() : '',
        eventSeqId: event.eventId ? String(event.eventId) : '',
      },
    }).catch(err => console.error('[PUSH] event_cancelled failed:', err.message));
  }

  return await notifyUser({ user, subject, text, html, whatsappMessage, whatsappTemplate });
};

// ─── Waitlist Spot Available → Waitlisted Players ──────────────────────────
const sendWaitlistSpotAvailableNotification = async ({ user, event }) => {
  const eventName = event?.eventName || 'Event';
  const timeZone = resolveEventTimeZone({ event, user });
  const eventDate = formatEventDate(
    event?.eventDateTime || event?.gameStartDate,
    event?.eventEndDateTime || event?.gameEndDate,
    timeZone
  );
  const userName = user?.fullName || 'User';

  const eventId = event?.eventId || (event?._id ? event._id.toString() : '');
  const appBaseUrl = (process.env.APP_BASE_URL || process.env.RALLY_WEB_BASE_URL || 'https://backend2.rallysports.ae').replace(/\/+$/, '');
  const eventLink = eventId ? `${appBaseUrl}/event/${eventId}` : '';

  const subject = `Spot available for ${eventName}!`;
  const text = eventLink
    ? `Hi ${userName}, a spot has just opened up for ${eventName} on ${eventDate}! Book now before it's gone: ${eventLink}`
    : `Hi ${userName}, a spot has just opened up for ${eventName} on ${eventDate}. Book now before it's gone!`;
  const html = `
    <p>Hi ${userName},</p>
    <p>Good news! A spot has just opened up for <strong>${eventName}</strong> on <strong>${eventDate}</strong>.</p>
    <p>Don't miss out - book your spot now!</p>
    ${eventLink ? `<p><a href="${eventLink}">View Event & Book Now</a></p>` : ''}
  `;
  const whatsappMessage = text;

  const contentSid = await resolveTemplateSid('WHATSAPP_WAITLIST_AVAILABLE_SID', TEMPLATES.waitlistSpotAvailable);
  const contentVariables = { '1': userName, '2': eventName, '3': eventDate };
  if (eventLink) {
    contentVariables['4'] = eventLink;
  }
  const whatsappTemplate = contentSid
    ? {
        contentSid,
        contentVariables,
      }
    : null;

  // In-app notification
  try {
    await Notification.create(
      user._id || user.id,
      'waitlist_spot_available',
      'Spot Available!',
      `A spot has opened up for "${eventName}". Book now!`,
      {
        eventId: event.eventId || (event._id ? event._id.toString() : null),
        eventName: eventName,
      }
    );
  } catch (notifError) {
    console.error('In-app waitlist notification failed:', notifError.message);
  }

  // Push notification to player (waitlist spot available)
  if (user.fcmToken) {
    sendPushNotification({
      token: user.fcmToken,
      title: 'Spot Available! 🎉',
      body: `A spot just opened up for "${eventName}". Book now before it's gone!`,
      data: {
        type: 'waitlist_spot_available',
        eventId: event.eventId ? String(event.eventId) : (event._id ? event._id.toString() : ''),
        eventName,
      },
    }).catch(err => console.error('[PUSH] waitlist_spot_available failed:', err.message));
  }

  return await notifyUser({ user, subject, text, html, whatsappMessage, whatsappTemplate });
};

// ─── Waitlist Event Full → Remaining Waitlisted Players ────────────────────
const sendWaitlistEventFullNotification = async ({ users, event }) => {
  const eventName = event?.eventName || 'Event';
  
  if (!users || !Array.isArray(users) || users.length === 0) return true;

  try {
    for (const user of users) {
      if (!user) continue;
      const userName = user?.fullName || 'User';

      const subject = `Event is now full: ${eventName}`;
      const text = `Hi ${userName}, we're sorry but the last available spot for ${eventName} has just been taken. You are still on the waitlist in case another spot opens.`;
      const html = `
        <p>Hi ${userName},</p>
        <p>We're sorry but the last available spot for <strong>${eventName}</strong> has just been taken.</p>
        <p>You are still on the waitlist in case another spot opens up!</p>
      `;
      const whatsappMessage = text;

      const contentSid = await resolveTemplateSid('WHATSAPP_WAITLIST_EVENT_FULL_SID', TEMPLATES.waitlistEventFull);
      const whatsappTemplate = contentSid
        ? {
            contentSid,
            contentVariables: { '1': userName, '2': eventName },
          }
        : null;

      // In-app notification
      try {
        await Notification.create(
          user._id || user.id,
          'waitlist_event_full',
          'Event is full',
          `The last spot for "${eventName}" has been taken. You are still on the waitlist.`,
          {
            eventId: event.eventId || (event._id ? event._id.toString() : null),
            eventName: eventName,
          }
        );
      } catch (notifError) {
        console.error('In-app waitlist event full notification failed:', notifError.message);
      }

      await notifyUser({ user, subject, text, html, whatsappMessage, whatsappTemplate });
    }
  } catch (err) {
    console.error('Waitlist event full broadcast failed:', err.message);
  }

  return true;
};

// ─── Waitlist Join → Organiser ───────────────────────────────────────────
const sendWaitlistJoinNotificationToHost = async ({ player, event }) => {
  const eventName = event?.eventName || 'Event';
  const playerName = player?.fullName || 'A player';
  const hostId = event?.creatorId || event?.userId;
  const timeZone = resolveEventTimeZone({ event, user: player });
  const eventDate = formatEventDate(
    event?.eventDateTime || event?.gameStartDate,
    event?.eventEndDateTime || event?.gameEndDate,
    timeZone
  );

  if (!hostId) return null;

  try {
    const host = await User.findById(hostId);
    if (host) {
      const hostName = host.fullName || 'Organiser';
      const subject = `New waitlist request for ${eventName}`;
      const text = `Hi ${hostName}, ${playerName} has joined the waitlist for your full event "${eventName}" on ${eventDate}.`;
      const html = `
        <p>Hi ${hostName},</p>
        <p><strong>${playerName}</strong> has joined the waitlist for your full event <strong>${eventName}</strong>.</p>
        <p><strong>Date:</strong> ${eventDate}</p>
      `;
      const whatsappMessage = text;

      const contentSid = await resolveTemplateSid('WHATSAPP_WAITLIST_JOIN_HOST_SID', TEMPLATES.waitlistJoinHost);
      const whatsappTemplate = contentSid
        ? {
            contentSid,
            contentVariables: { '1': hostName, '2': playerName, '3': eventName, '4': eventDate },
          }
        : null;

      await notifyUser({ user: host, subject, text, html, whatsappMessage, whatsappTemplate });
    }
  } catch (err) {
    console.error('Waitlist join host notification failed:', err.message);
  }

  return true;
};

// ─── Community Join Request → Organiser ──────────────────────────────────
const sendOrganiserJoinRequestNotification = async ({ user, organiser }) => {
  const userName = user?.fullName || 'A user';
  const organiserName = organiser?.fullName || 'Organiser';
  const communityName = organiser?.communityName || 'your community';

  const subject = `New request to join ${communityName}`;
  const text = `Hi ${organiserName}, ${userName} has requested to join your community "${communityName}".`;
  const html = `
    <p>Hi ${organiserName},</p>
    <p><strong>${userName}</strong> has requested to join your community <strong>${communityName}</strong>.</p>
  `;
  const whatsappMessage = text;

  const contentSid = await resolveTemplateSid('WHATSAPP_ORG_JOIN_REQ_SID', TEMPLATES.organiserJoinRequest);
  const whatsappTemplate = contentSid
    ? {
        contentSid,
        contentVariables: { '1': organiserName, '2': userName, '3': communityName },
      }
    : null;

  return await notifyUser({ user: organiser, subject, text, html, whatsappMessage, whatsappTemplate });
};

// ─── Event Request Accepted → Player ──────────────────────────────────────
const sendEventRequestAcceptedNotification = async ({ user, event, message }) => {
  const eventName = event?.eventName || 'Event';
  const userName = user?.fullName || 'User';
  const additionalMessage = message || 'Book your spot now!';

  const subject = `Request accepted for ${eventName}`;
  const text = `Hi ${userName}, your request to join "${eventName}" has been accepted! ${additionalMessage}`;
  const html = `
    <p>Hi ${userName},</p>
    <p>Good news! Your request to join <strong>${eventName}</strong> has been accepted.</p>
    <p>${additionalMessage}</p>
  `;
  const whatsappMessage = text;

  const contentSid = await resolveTemplateSid('WHATSAPP_EVENT_REQ_ACCEPTED_SID', TEMPLATES.eventRequestAccepted);
  const whatsappTemplate = contentSid
    ? {
        contentSid,
        contentVariables: { '1': userName, '2': eventName, '3': additionalMessage },
      }
    : null;

  return await notifyUser({ user, subject, text, html, whatsappMessage, whatsappTemplate });
};

// ─── Event Request Rejected → Player ──────────────────────────────────────
const sendEventRequestRejectedNotification = async ({ user, event }) => {
  const eventName = event?.eventName || 'Event';
  const userName = user?.fullName || 'User';

  const subject = `Request for ${eventName}`;
  const text = `Hi ${userName}, we're sorry but your request to join "${eventName}" was not accepted at this time.`;
  const html = `
    <p>Hi ${userName},</p>
    <p>We're sorry but your request to join <strong>${eventName}</strong> was not accepted at this time.</p>
  `;
  const whatsappMessage = text;

  const contentSid = await resolveTemplateSid('WHATSAPP_EVENT_REQ_REJECTED_SID', TEMPLATES.eventRequestRejected);
  const whatsappTemplate = contentSid
    ? {
        contentSid,
        contentVariables: { '1': userName, '2': eventName },
      }
    : null;

  return await notifyUser({ user, subject, text, html, whatsappMessage, whatsappTemplate });
};

// ─── Community Request Accepted → Player ──────────────────────────────────
const sendOrganiserRequestAcceptedNotification = async ({ user, organiser }) => {
  const organiserName = organiser?.fullName || 'Organiser';
  const communityName = organiser?.communityName || 'the community';
  const userName = user?.fullName || 'User';

  const subject = `Request accepted for ${communityName}`;
  const text = `Hi ${userName}, your request to join "${communityName}" has been accepted!`;
  const html = `
    <p>Hi ${userName},</p>
    <p>Your request to join <strong>${communityName}</strong> has been accepted by ${organiserName}.</p>
  `;
  const whatsappMessage = text;

  const contentSid = await resolveTemplateSid('WHATSAPP_ORG_REQ_ACCEPTED_SID', TEMPLATES.organiserRequestAccepted);
  const whatsappTemplate = contentSid
    ? {
        contentSid,
        contentVariables: { '1': userName, '2': communityName },
      }
    : null;

  return await notifyUser({ user, subject, text, html, whatsappMessage, whatsappTemplate });
};

// ─── Community Request Rejected → Player ──────────────────────────────────
const sendOrganiserRequestRejectedNotification = async ({ user, organiser }) => {
  const communityName = organiser?.communityName || 'the community';
  const userName = user?.fullName || 'User';

  const subject = `Request for ${communityName}`;
  const text = `Hi ${userName}, your request to join "${communityName}" was not accepted.`;
  const html = `
    <p>Hi ${userName},</p>
    <p>We're sorry but your request to join <strong>${communityName}</strong> was not accepted.</p>
  `;
  const whatsappMessage = text;

  const contentSid = await resolveTemplateSid('WHATSAPP_ORG_REQ_REJECTED_SID', TEMPLATES.organiserRequestRejected);
  const whatsappTemplate = contentSid
    ? {
        contentSid,
        contentVariables: { '1': userName, '2': communityName },
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
  sendWaitlistSpotAvailableNotification,
  sendWaitlistEventFullNotification,
  sendWaitlistJoinNotificationToHost,
  sendOrganiserJoinRequestNotification,
  sendEventRequestAcceptedNotification,
  sendEventRequestRejectedNotification,
  sendOrganiserRequestAcceptedNotification,
  sendOrganiserRequestRejectedNotification,
};