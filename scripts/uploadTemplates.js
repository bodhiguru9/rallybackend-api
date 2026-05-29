const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

if (!accountSid || !authToken) {
  console.error('❌ Error: TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN is missing in your .env file.');
  console.log('Please configure these variables in the .env file before running the script.');
  process.exit(1);
}

// Map templates with their bodies and friendly names, along with sample values for placeholders
const TEMPLATES = [
  {
    envKey: 'WHATSAPP_BOOKING_CONFIRMED_SID',
    friendlyName: 'Rally Booking Confirmed',
    body: 'Hi {{1}}, your booking is confirmed for {{2}} on {{3}} at {{4}}. Booking ID: {{5}}.',
    variables: {
      '1': 'John Doe',
      '2': 'Weekend Tennis Match',
      '3': 'May 30, 2026, 10:00 AM',
      '4': 'Center Court Dubai',
      '5': 'BK-12345'
    }
  },
  {
    envKey: 'WHATSAPP_NEW_BOOKING_SID',
    friendlyName: 'Rally New Booking',
    body: 'Hi {{1}}, {{2}} has joined your event {{3}} on {{4}} at {{5}}.',
    variables: {
      '1': 'Host Name',
      '2': 'John Doe',
      '3': 'Weekend Tennis Match',
      '4': 'May 30, 2026, 10:00 AM',
      '5': 'Center Court Dubai'
    }
  },
  {
    envKey: 'WHATSAPP_BOOKING_CANCELLED_SID',
    friendlyName: 'Rally Booking Cancelled',
    body: 'Hi {{1}}, your booking for {{2}} on {{3}} at {{4}} has been cancelled.',
    variables: {
      '1': 'John Doe',
      '2': 'Weekend Tennis Match',
      '3': 'May 30, 2026, 10:00 AM',
      '4': 'Center Court Dubai'
    }
  },
  {
    envKey: 'WHATSAPP_HOST_BOOKING_CANCELLED_SID',
    friendlyName: 'Rally Host Booking Cancelled',
    body: 'Hi {{1}}, {{2}} cancelled their booking for {{3}} on {{4}} at {{5}}.',
    variables: {
      '1': 'Host Name',
      '2': 'John Doe',
      '3': 'Weekend Tennis Match',
      '4': 'May 30, 2026, 10:00 AM',
      '5': 'Center Court Dubai'
    }
  },
  {
    envKey: 'WHATSAPP_EVENT_CANCELLED_SID',
    friendlyName: 'Rally Event Cancelled',
    body: "Hi {{1}}, we're sorry to inform you that {{2}}, scheduled for {{3}} at {{4}}, has been cancelled by the organiser. Any amount paid will be refunded to your account.",
    variables: {
      '1': 'John Doe',
      '2': 'Weekend Tennis Match',
      '3': 'May 30, 2026, 10:00 AM',
      '4': 'Center Court Dubai'
    }
  },
  {
    envKey: 'WHATSAPP_WAITLIST_AVAILABLE_SID',
    friendlyName: 'Rally Waitlist Spot Available',
    body: 'Hi {{1}}, a spot has opened up for {{2}} on {{3}}! Book now before it\'s gone.',
    variables: {
      '1': 'John Doe',
      '2': 'Weekend Tennis Match',
      '3': 'May 30, 2026, 10:00 AM'
    }
  },
  {
    envKey: 'WHATSAPP_WAITLIST_JOIN_HOST_SID',
    friendlyName: 'Rally New Waitlist Request',
    body: 'Hi {{1}}, {{2}} has joined the waitlist for your full event {{3}} on {{4}}.',
    variables: {
      '1': 'Host Name',
      '2': 'John Doe',
      '3': 'Weekend Tennis Match',
      '4': 'May 30, 2026, 10:00 AM'
    }
  },
  {
    envKey: 'WHATSAPP_ORG_JOIN_REQ_SID',
    friendlyName: 'Rally New Community Join Request',
    body: 'Hi {{1}}, {{2}} has requested to join your community {{3}}.',
    variables: {
      '1': 'Organiser Name',
      '2': 'John Doe',
      '3': 'Rally Tennis Community'
    }
  },
  {
    envKey: 'WHATSAPP_EVENT_REQ_ACCEPTED_SID',
    friendlyName: 'Rally Event Request Accepted',
    body: 'Hi {{1}}, your request to join {{2}} has been accepted! {{3}}',
    variables: {
      '1': 'John Doe',
      '2': 'Weekend Tennis Match',
      '3': 'Book your spot now!'
    }
  },
  {
    envKey: 'WHATSAPP_EVENT_REQ_REJECTED_SID',
    friendlyName: 'Rally Event Request Rejected',
    body: 'Hi {{1}}, we\'re sorry but your request to join {{2}} was not accepted.',
    variables: {
      '1': 'John Doe',
      '2': 'Weekend Tennis Match'
    }
  },
  {
    envKey: 'WHATSAPP_ORG_REQ_ACCEPTED_SID',
    friendlyName: 'Rally Community Request Accepted',
    body: 'Hi {{1}}, your request to join {{2}} has been accepted!',
    variables: {
      '1': 'John Doe',
      '2': 'Rally Tennis Community'
    }
  },
  {
    envKey: 'WHATSAPP_ORG_REQ_REJECTED_SID',
    friendlyName: 'Rally Community Request Rejected',
    body: 'Hi {{1}}, your request to join {{2}} was not accepted.',
    variables: {
      '1': 'John Doe',
      '2': 'Rally Tennis Community'
    }
  }
];

async function createAndSubmitTemplate(template) {
  const auth = {
    username: accountSid,
    password: authToken
  };

  try {
    console.log(`\n⏳ Processing template: "${template.friendlyName}"...`);

    // Step 1: Create the Content Template
    const createResponse = await axios.post(
      'https://content.twilio.com/v1/Content',
      {
        friendly_name: template.friendlyName,
        language: 'en',
        variables: template.variables,
        types: {
          'twilio/text': {
            body: template.body
          }
        }
      },
      { auth }
    );

    const contentSid = createResponse.data.sid;
    console.log(`✅ Created Content SID: ${contentSid}`);

    // Step 2: Submit for WhatsApp Approval
    // Note: WhatsApp template name rules require lowercase, numbers, and underscores only
    const cleanName = template.friendlyName
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_');

    console.log(`⏳ Submitting for WhatsApp approval with name: "${cleanName}"...`);
    const submitResponse = await axios.post(
      `https://content.twilio.com/v1/Content/${contentSid}/ApprovalRequests/WhatsApp`,
      {
        name: cleanName,
        category: 'UTILITY'
      },
      { auth }
    );

    console.log(`🚀 Approval request submitted successfully! Status: ${submitResponse.data.whatsapp?.status || 'Submitted'}`);
    return { success: true, key: template.envKey, sid: contentSid };
  } catch (error) {
    const errorMsg = error.response?.data ? JSON.stringify(error.response.data) : error.message;
    console.error(`❌ Failed template "${template.friendlyName}":`, errorMsg);
    return { success: false, key: template.envKey, error: errorMsg };
  }
}

function updateEnvFile(successfulResults) {
  const envPath = path.join(__dirname, '../.env');
  let envContent = '';

  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  }

  let lines = envContent.split(/\r?\n/);

  successfulResults.forEach(r => {
    const varPattern = new RegExp(`^${r.key}=`);
    const existingIndex = lines.findIndex(line => varPattern.test(line));

    if (existingIndex !== -1) {
      lines[existingIndex] = `${r.key}="${r.sid}"`;
    } else {
      lines.push(`${r.key}="${r.sid}"`);
    }
  });

  // Write back to .env
  fs.writeFileSync(envPath, lines.join('\n'), 'utf8');
  console.log(`\n💾 Successfully updated/appended ${successfulResults.length} variables directly in .env!`);
}

async function main() {
  console.log('🏁 Starting WhatsApp Content Template upload process...');
  const results = [];
  
  for (const template of TEMPLATES) {
    const res = await createAndSubmitTemplate(template);
    results.push(res);
    // Add a small delay between requests to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n==================================================');
  console.log('📊 UPLOAD PROCESS SUMMARY');
  console.log('==================================================');
  
  const successful = results.filter(r => r.success);
  if (successful.length > 0) {
    updateEnvFile(successful);
    console.log('\nAdded/Updated in your .env:');
    successful.forEach(r => {
      console.log(`${r.key}="${r.sid}"`);
    });
  }

  const failed = results.filter(r => !r.success);
  if (failed.length > 0) {
    console.log('\nThe following templates failed to upload:');
    failed.forEach(r => {
      console.log(`- ${r.key}: ${r.error}`);
    });
  }
}

main();
