const { notifyUser } = require('./notification.service');
const Notification = require('../models/Notification');

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

const sendBookingConfirmedNotification = async ({ user, event, booking }) => {
  const eventName = event?.eventName || 'Event';
  const eventDate = formatEventDate(event?.eventDateTime || event?.gameStartDate);
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

  // Add in-app notification to Player
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

/**
 * Notify organiser of a new booking
 */
const sendHostBookingNotification = async ({ player, event, booking }) => {
  const eventName = event?.eventName || 'Event';
  const playerName = player?.fullName || 'A player';
  const hostId = event?.creatorId || event?.userId;

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
        eventName: eventName,
        occurrenceStart: booking.occurrenceStart || null,
      }
    );
  } catch (notifError) {
    console.error('In-app host booking notification failed:', notifError.message);
  }

  // We could also send email/whatsapp to host here if needed,
  // but for now we focus on the in-app notification count.
  return true;
};

const sendEventCancelledNotification = async ({ user, event }) => {
  const eventName = event?.eventName || 'Event';
  const eventDate = formatEventDate(event?.eventDateTime || event?.gameStartDate);

  const subject = `Event cancelled: ${eventName}`;
  const text = `Hi ${user?.fullName || 'User'}, we’re sorry to inform you that ${eventName}, scheduled for ${eventDate}, has been cancelled by the organiser.`;
  const html = `
    <p>Hi ${user?.fullName || 'User'},</p>
    <p>We’re sorry to inform you that <strong>${eventName}</strong>, scheduled for <strong>${eventDate}</strong>, has been cancelled by the organiser.</p>
  `;
  const whatsappMessage = `Hi ${user?.fullName || 'User'}, ${eventName}, scheduled for ${eventDate}, has been cancelled by the organiser.`;

  return await notifyUser({ user, subject, text, html, whatsappMessage });
};

module.exports = {
  sendBookingConfirmedNotification,
  sendHostBookingNotification,
  sendEventCancelledNotification,
};