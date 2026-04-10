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

const sendWhatsAppNotification = async ({ to, message, templateOptions }) => {
  try {
    console.log(`📱 [WA-NOTIFY] Attempting WhatsApp to: "${to}", hasTemplate: ${!!templateOptions}`);
    const result = await sendWhatsAppMessage(to, message, templateOptions || null);
    if (result.skipped) {
      console.warn(`⚠️ WhatsApp notification skipped for ${to}: ${result.message}`);
      return { success: false, channel: 'whatsapp', skipped: true, reason: result.message };
    }
    console.log(`✅ WhatsApp notification sent to ${to}`, result);
    return { success: true, channel: 'whatsapp', ...result };
  } catch (error) {
    console.error('❌ [WA-NOTIFY] Error sending WhatsApp notification:', error.message, error.code ? `(code: ${error.code})` : '');
    return { success: false, channel: 'whatsapp', error: error.message };
  }
};

const notifyUser = async ({ user, subject, text, html, whatsappMessage, whatsappTemplate }) => {
  const email = user?.email && String(user.email).trim() ? String(user.email).trim() : null;
  const whatsapp = user?.whatsappNumber || user?.mobileNumber;
  const mobile = whatsapp && String(whatsapp).trim() ? String(whatsapp).trim() : null;

  console.log(`📣 [NOTIFY-USER] userId: ${user?._id || user?.id}, email: ${email || 'NONE'}, mobile: ${mobile || 'NONE'}, whatsappNumber: ${user?.whatsappNumber || 'NONE'}, mobileNumber: ${user?.mobileNumber || 'NONE'}`);

  if (!email && !mobile) {
    console.log('⚠️ No notification channel available for user:', user?._id || user?.id);
    return {
      success: false,
      skipped: true,
      reason: 'No email or whatsapp/mobile available',
    };
  }

  const results = [];

  // Send email if available
  if (email) {
    try {
      const emailResult = await sendEmailNotification({ to: email, subject, text, html });
      results.push(emailResult);
    } catch (err) {
      console.error('Email notification failed:', err.message);
      results.push({ success: false, channel: 'email', error: err.message });
    }
  }

  // Send WhatsApp if available
  if (mobile) {
    try {
      console.log(`📱 [NOTIFY-USER] Sending WhatsApp to mobile: "${mobile}", hasTemplate: ${!!whatsappTemplate}, templateSid: ${whatsappTemplate?.contentSid || 'NONE'}`);
      const waResult = await sendWhatsAppNotification({
        to: mobile,
        message: whatsappMessage || text,
        templateOptions: whatsappTemplate || null,
      });
      results.push(waResult);
      console.log(`📱 [NOTIFY-USER] WhatsApp result:`, JSON.stringify(waResult));
    } catch (err) {
      console.error('WhatsApp notification failed:', err.message);
      results.push({ success: false, channel: 'whatsapp', error: err.message });
    }
  }

  return {
    success: results.some(r => r.success),
    channels: results,
  };
};

module.exports = {
  notifyUser,
  sendEmailNotification,
  sendWhatsAppNotification,
};