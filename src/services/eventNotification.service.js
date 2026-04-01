const { notifyUser } = require('./notification.service');
const Notification = require('../models/Notification');
const User = require('../models/User');

const formatEventDate = (dateValue) => {
  if (!dateValue) return 'TBD';
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return 'TBD';
  return d.toLocaleString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// ─── Booking Confirmed → Player ───────────────────────────────────────────
const sendBookingConfirmedNotification = async ({ user, event, booking }) => {
  const eventName = event?.eventName || 'Event';
  const eventDate = formatEventDate(booking?.occurrenceStart || event?.eventDateTime || event?.gameStartDate);
  const eventLocation = event?.eventLocation || 'Location will be shared soon';

  const subject = `Booking confirmed for ${eventName}`;
  const text = `Hi ${user?.fullName || 'User'}, your booking is confirmed for ${eventName} on ${eventDate} at ${eventLocation}. Booking ID: ${booking?.bookingId || 'N/A'}.`;
  const html = `
    <p>Hi ${user?.fullName || 'User'},</p>
    <p>Your booking is confirmed for <strong>${eventName}</strong>.</p>
    <p><strong>Date:</strong> ${eventDate}</p>
    <p><strong>Location:</strong> ${eventLocation}</p>
    <p><strong>Booking ID:</strong> ${booking?.bookingId || 'N/A'}</p>
  `;
  const whatsappMessage = `Hi ${user?.fullName || 'User'}, your booking is confirmed for ${eventName} on ${eventDate} at ${eventLocation}. Booking ID: ${booking?.bookingId || 'N/A'}.`;

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

  return await notifyUser({ user, subject, text, html, whatsappMessage });
};

// ─── New Booking → Organiser ──────────────────────────────────────────────
const sendHostBookingNotification = async ({ player, event, booking }) => {
  const eventName = event?.eventName || 'Event';
  const playerName = player?.fullName || 'A player';
  const hostId = event?.creatorId || event?.userId;
  const eventDate = formatEventDate(booking?.occurrenceStart || event?.eventDateTime || event?.gameStartDate);
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
  // try {
  //   const host = await User.findById(hostId);
  //   if (host) {
  //     const subject = `New booking for ${eventName}`;
  //     const text = `Hi ${host.fullName || 'Organiser'}, ${playerName} has joined your event "${eventName}" on ${eventDate} at ${eventLocation}.`;
  //     const html = `
  //       <p>Hi ${host.fullName || 'Organiser'},</p>
  //       <p><strong>${playerName}</strong> has joined your event <strong>${eventName}</strong>.</p>
  //       <p><strong>Date:</strong> ${eventDate}</p>
  //       <p><strong>Location:</strong> ${eventLocation}</p>
  //     `;
  //     const whatsappMessage = text;
  //     await notifyUser({ user: host, subject, text, html, whatsappMessage });
  //   }
  // } catch (hostNotifyError) {
  //   console.error('Host email/WhatsApp notification failed:', hostNotifyError.message);
  // }

  return true;
};

// ─── Booking Cancelled → Player ───────────────────────────────────────────
const sendPlayerCancelledBookingNotification = async ({ user, event, booking, refundMessage }) => {
  const eventName = event?.eventName || 'Event';
  const eventDate = formatEventDate(booking?.occurrenceStart || event?.eventDateTime || event?.gameStartDate);
  const eventLocation = event?.eventLocation || 'Location will be shared soon';
  const refundLine = refundMessage ? `\n${refundMessage}` : '';

  const subject = `Booking cancelled for ${eventName}`;
  const text = `Hi ${user?.fullName || 'User'}, your booking for "${eventName}" on ${eventDate} at ${eventLocation} has been cancelled.${refundLine}`;
  const html = `
    <p>Hi ${user?.fullName || 'User'},</p>
    <p>Your booking for <strong>${eventName}</strong> has been cancelled.</p>
    <p><strong>Date:</strong> ${eventDate}</p>
    <p><strong>Location:</strong> ${eventLocation}</p>
    ${refundMessage ? `<p>${refundMessage}</p>` : ''}
  `;
  const whatsappMessage = text;

  return await notifyUser({ user, subject, text, html, whatsappMessage });
};

// ─── Booking Cancelled → Organiser ────────────────────────────────────────
const sendHostCancelledBookingNotification = async ({ player, event, booking }) => {
  const eventName = event?.eventName || 'Event';
  const playerName = player?.fullName || 'A player';
  const hostId = event?.creatorId || event?.userId;
  const eventDate = formatEventDate(booking?.occurrenceStart || event?.eventDateTime || event?.gameStartDate);
  const eventLocation = event?.eventLocation || 'Location will be shared soon';

  if (!hostId) return null;

  try {
    const host = await User.findById(hostId);
    if (host) {
      const subject = `Booking cancelled for ${eventName}`;
      const text = `Hi ${host.fullName || 'Organiser'}, ${playerName} cancelled their booking for "${eventName}" on ${eventDate} at ${eventLocation}.`;
      const html = `
        <p>Hi ${host.fullName || 'Organiser'},</p>
        <p><strong>${playerName}</strong> cancelled their booking for <strong>${eventName}</strong>.</p>
        <p><strong>Date:</strong> ${eventDate}</p>
        <p><strong>Location:</strong> ${eventLocation}</p>
      `;
      const whatsappMessage = text;
      await notifyUser({ user: host, subject, text, html, whatsappMessage });
    }
  } catch (err) {
    console.error('Host cancellation email/WhatsApp failed:', err.message);
  }

  return true;
};

// ─── Event Cancelled (by Organiser) → Player ─────────────────────────────
const sendEventCancelledNotification = async ({ user, event }) => {
  const eventName = event?.eventName || 'Event';
  const eventDate = formatEventDate(event?.eventDateTime || event?.gameStartDate);
  const eventLocation = event?.eventLocation || 'Location will be shared soon';

  const subject = `Event cancelled: ${eventName}`;
  const text = `Hi ${user?.fullName || 'User'}, we're sorry to inform you that ${eventName}, scheduled for ${eventDate} at ${eventLocation}, has been cancelled by the organiser.`;
  const html = `
    <p>Hi ${user?.fullName || 'User'},</p>
    <p>We're sorry to inform you that <strong>${eventName}</strong>, scheduled for <strong>${eventDate}</strong> at <strong>${eventLocation}</strong>, has been cancelled by the organiser.</p>
  `;
  const whatsappMessage = text;

  return await notifyUser({ user, subject, text, html, whatsappMessage });
};

module.exports = {
  sendBookingConfirmedNotification,
  sendHostBookingNotification,
  sendPlayerCancelledBookingNotification,
  sendHostCancelledBookingNotification,
  sendEventCancelledNotification,
};