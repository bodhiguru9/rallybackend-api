require('dotenv').config();
const { connectDB, getDB, closeDB } = require('./src/config/database');

async function run() {
  await connectDB();
  const db = getDB();
  const org = await db.collection('users').findOne({ userType: 'organiser' });
  const pubEvent = await db.collection('events').findOne({ isPrivateEvent: false });
  const privEvent = await db.collection('events').findOne({ isPrivateEvent: true });
  
  console.log('\n--- TEST IDs ---');
  console.log('Organiser ID:', org ? String(org.userId || org._id) : 'None');
  console.log('Public Event ID:', pubEvent ? String(pubEvent.eventId || pubEvent._id) : 'None');
  console.log('Private Event ID:', privEvent ? String(privEvent.eventId || privEvent._id) : 'None');
  console.log('----------------\n');
  
  process.exit(0);
}

run().catch(console.error);
