require('dotenv').config();
const { getTwilioClient } = require('../src/services/twilio.service');

async function setupTemplate() {
  const client = getTwilioClient();
  if (!client) {
    console.error('❌ Twilio client not configured. Check your .env file for TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.');
    process.exit(1);
  }

  const friendlyName = 'New Features Update';
  // Note: WhatsApp templates combine title and body. You can use formatting like *bold* for the title.
  const bodyText = `*New features just dropped! 🎾*\n\nUpdate your Rally app now to enjoy the latest features → linktr.ee/rallysports.ae`;

  console.log(`Creating WhatsApp Content Template: "${friendlyName}"...`);
  console.log(`Body:\n${bodyText}\n`);

  try {
    const content = await client.content.v1.contents.create({
      friendlyName,
      variables: {},
      language: 'en',
      types: {
        'twilio/text': {
          body: bodyText
        }
      }
    });

    console.log(`✅ Template created successfully!`);
    console.log(`📄 Content SID: ${content.sid}`);
    console.log(`\n⚠️  IMPORTANT:`);
    console.log(`1. Go to your Twilio Console -> Content Template Builder.`);
    console.log(`2. Find the template "${friendlyName}" and submit it for WhatsApp approval if it hasn't been submitted automatically.`);
    console.log(`3. Approval usually takes a few minutes to a few hours.`);
    console.log(`\nYou can now use this Content SID in the broadcast script.`);

  } catch (error) {
    console.error('❌ Failed to create template:', error);
  }
}

setupTemplate();
