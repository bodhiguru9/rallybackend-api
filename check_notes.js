const { getDB, connectDB } = require('./src/config/database');
const { ObjectId } = require('mongodb');

async function checkNotifications() {
  try {
    await connectDB();
    const db = getDB();
    const collection = db.collection('notifications');
    console.log('--- Searching for New Booking Notifications ---');
    const notes = await collection.find({
      type: { $in: ['new_booking', 'event_booking_cancelled', 'organiser_join_request', 'event_join_request', 'event_booked'] }
    }).sort({ createdAt: -1 }).toArray();
    console.log(`Found ${notes.length} notifications`);
    console.log(JSON.stringify(notes, null, 2));
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkNotifications();
