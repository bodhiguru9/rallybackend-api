require('dotenv').config();
const { connectDB } = require('../src/config/database');
const { initializePushService } = require('../src/services/push.service');
const { createBroadcast } = require('../src/controllers/admin/broadcast.controller');

async function runTest() {
  try {
    // 1. Connect to DB
    console.log('Connecting to database...');
    await connectDB();

    // 2. Initialize FCM
    console.log('Initializing push service...');
    initializePushService();

    // 3. Mock Express req/res
    const req = {
      user: { id: 'test-admin-id', userType: 'superadmin' },
      body: {
        audience: { type: 'all' },
        message: {
          title: `Test Notification 🚀 (${new Date().toLocaleTimeString()})`,
          body: 'This is a test broadcast from the script! If you see this, push notifications are working.',
          action: { type: 'deep_link', url: '/status' }
        },
        metadata: { category: 'announcement' },
        notification: { channel: 'push', priority: 'high' }
      }
    };

    const res = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        console.log(`\nResponse [${this.statusCode}]:`, JSON.stringify(data, null, 2));
        if (this.statusCode >= 400) {
          process.exit(1);
        }
      }
    };

    const next = (err) => {
      console.error('\nError in controller:', err);
      process.exit(1);
    };

    // 4. Call the controller
    console.log('\nSending broadcast request...');
    await createBroadcast(req, res, next);

    // Wait a few seconds to let fire-and-forget push promises complete
    console.log('Waiting 5 seconds for push dispatch to complete...');
    setTimeout(() => {
      console.log('Done! Check your device.');
      process.exit(0);
    }, 5000);

  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

runTest();
