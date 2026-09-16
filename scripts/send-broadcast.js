require('dotenv').config();
const { connectDB, closeDB } = require('../src/config/database');
const { createTransporter } = require('../src/utils/email');
const { sendWhatsAppMessage } = require('../src/services/twilio.service');

// ============================================================================
// BROADCAST CONFIGURATION
// ============================================================================
const BROADCAST_TITLE = "New features just dropped! 🎾";
const BROADCAST_BODY = "Update your Rally app now to enjoy the latest features → linktr.ee/rallysports.ae";
const AUDIENCE = "all"; // Options: 'all', 'players', 'organisers', or an array of specific emails/numbers
const WHATSAPP_TEMPLATE_SID = "HX7e5191f1b61cf55cd079de522a135a67"; // Optional: If you got a Content SID from Twilio after creating a template, put it here
// ============================================================================

async function sendBroadcastEmail(transporter, email, title, body) {
  const emailId = process.env.Email_ID || process.env.EMAIL_ID || process.env.EMAIL_USER;
  const appName = process.env.APP_NAME || 'Rally';

  const mailOptions = {
    from: `"${appName}" <${emailId}>`,
    to: email,
    subject: title,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .content { background-color: #f9f9f9; padding: 20px; border-radius: 5px; margin: 20px 0; }
          .footer { margin-top: 30px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>${title}</h2>
          <div class="content">
            <p>${body.replace(/\n/g, '<br>')}</p>
          </div>
          <div class="footer">
            <p>This is an automated message, please do not reply.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `${title}\n\n${body}`,
  };

  await transporter.sendMail(mailOptions);
}

async function run() {
  console.log('🚀 Starting broadcast script...');
  
  try {
    const { db } = await connectDB();
    const usersCollection = db.collection('users');

    // 1. Resolve Audience
    let query = {};
    if (AUDIENCE === 'players') query = { userType: 'player' };
    else if (AUDIENCE === 'organisers') query = { userType: 'organiser' };
    else if (Array.isArray(AUDIENCE)) {
      query = { 
        $or: [
          { email: { $in: AUDIENCE } },
          { mobileNumber: { $in: AUDIENCE } },
          { whatsappNumber: { $in: AUDIENCE } }
        ]
      };
    }

    const users = await usersCollection.find(query, {
      projection: { _id: 1, email: 1, mobileNumber: 1, whatsappNumber: 1, userType: 1 }
    }).toArray();

    console.log(`👥 Found ${users.length} users for audience: ${AUDIENCE}`);
    
    const transporter = createTransporter();
    
    let emailsSent = 0;
    let whatsappSent = 0;

    for (const user of users) {
      // Send Email
      if (user.email && user.email.includes('@')) {
        try {
          await sendBroadcastEmail(transporter, user.email, BROADCAST_TITLE, BROADCAST_BODY);
          emailsSent++;
          console.log(`✅ Email sent to ${user.email}`);
        } catch (err) {
          console.error(`❌ Failed to send email to ${user.email}:`, err.message);
        }
      }

      // Send WhatsApp
      const whatsappTarget = user.whatsappNumber || user.mobileNumber;
      if (whatsappTarget) {
        try {
          // Note: Sending free-form text outside 24h window might fail unless a template is used.
          let templateOptions = null;
          if (WHATSAPP_TEMPLATE_SID) {
            templateOptions = { contentSid: WHATSAPP_TEMPLATE_SID };
          }
          await sendWhatsAppMessage(whatsappTarget, `${BROADCAST_TITLE}\n\n${BROADCAST_BODY}`, templateOptions);
          whatsappSent++;
          console.log(`✅ WhatsApp sent to ${whatsappTarget}`);
        } catch (err) {
          console.error(`❌ Failed to send WhatsApp to ${whatsappTarget}:`, err.message);
        }
      }

      // Small delay to prevent hitting rate limits (e.g. 100ms)
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('----------------------------------------------------');
    console.log(`🎉 Broadcast complete!`);
    console.log(`📧 Emails sent: ${emailsSent}`);
    console.log(`📱 WhatsApp messages sent: ${whatsappSent}`);
    console.log('----------------------------------------------------');

  } catch (error) {
    console.error('❌ Script failed:', error);
  } finally {
    await closeDB();
    process.exit(0);
  }
}

run();
