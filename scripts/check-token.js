require('dotenv').config();
const { connectDB, getDB } = require('../src/config/database');

async function check() {
  await connectDB();
  const db = getDB();
  const usersWithToken = await db.collection('users').countDocuments({ fcmToken: { $ne: null } });
  console.log(`Users with FCM token: ${usersWithToken}`);
  process.exit(0);
}

check().catch(console.error);
