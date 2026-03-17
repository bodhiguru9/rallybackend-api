const { notifyUser } = require('./notification.service');

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

  return await notifyUser({ user, subject, text, html, whatsappMessage });
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
  sendEventCancelledNotification,
};