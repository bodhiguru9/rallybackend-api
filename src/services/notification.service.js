const { getPreferredNotificationChannel } = require('../utils/notificationChannel');
const { createTransporter } = require('../utils/email');
const { sendWhatsAppMessage } = require('./twilio.service');

const sendEmailNotification = async ({ to, subject, text, html }) => {
  try {
    const transporter = createTransporter();
    const emailId = process.env.Email_ID || process.env.EMAIL_ID || process.env.EMAIL_USER;
    
    if (!emailId) {
      console.log('📧 Email not configured. Skipping send for:', to);
      return { success: false, channel: 'email', reason: 'Email not configured' };
    }

    const mailOptions = {
      from: `"${process.env.APP_NAME || 'Rally'}" <${emailId}>`,
      to,
      subject,
      text,
      html,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Email notification sent to ${to}: ${info.messageId}`);
    return { success: true, channel: 'email', messageId: info.messageId };
  } catch (error) {
    console.error('Error sending email notification:', error.message);
    return { success: false, channel: 'email', error: error.message };
  }
};

const sendWhatsAppNotification = async ({ to, message }) => {
  try {
    const result = await sendWhatsAppMessage(to, message);
    console.log(`✅ WhatsApp notification sent to ${to}`);
    return { success: true, channel: 'whatsapp', ...result };
  } catch (error) {
    console.error('Error sending WhatsApp notification:', error.message);
    return { success: false, channel: 'whatsapp', error: error.message };
  }
};

const notifyUser = async ({ user, subject, text, html, whatsappMessage }) => {
  const { channel, value } = getPreferredNotificationChannel(user);

  if (!channel || !value) {
    console.log('⚠️ No notification channel available for user:', user?._id || user?.id);
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