const { getPreferredNotificationChannel } = require('../utils/notificationChannel');

const sendEmailNotification = async ({ to, subject, text, html }) => {
  // plug in nodemailer / your email provider here
  console.log('EMAIL =>', { to, subject, text });
  return { success: true, channel: 'email' };
};

const sendWhatsAppNotification = async ({ to, message }) => {
  // plug in Twilio WhatsApp / your provider here
  console.log('WHATSAPP =>', { to, message });
  return { success: true, channel: 'whatsapp' };
};

const notifyUser = async ({ user, subject, text, html, whatsappMessage }) => {
  const { channel, value } = getPreferredNotificationChannel(user);

  if (!channel || !value) {
    return {
      success: false,
      skipped: true,
      reason: 'No email or whatsapp/mobile available',
    };
  }

  if (channel === 'email') {
    return await sendEmailNotification({
      to: value,
      subject,
      text,
      html,
    });
  }

  return await sendWhatsAppNotification({
    to: value,
    message: whatsappMessage || text,
  });
};

module.exports = {
  notifyUser,
  sendEmailNotification,
  sendWhatsAppNotification,
};