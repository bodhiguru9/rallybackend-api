const mongoose = require('mongoose');

async function run() {
  await mongoose.connect('mongodb+srv://admin:LdO3R7n6hJqf2rR7@rallyas2.5g4g0g2.mongodb.net/rallyas2?retryWrites=true&w=majority');
  const db = mongoose.connection;
  
  const org = await db.collection('users').findOne({ userType: 'organiser' });
  const pubEvent = await db.collection('events').findOne({ isPrivateEvent: false });
  const privEvent = await db.collection('events').findOne({ isPrivateEvent: true });
  
  console.log('Org:', org ? org._id : 'None');
  console.log('PublicEvent:', pubEvent ? pubEvent._id : 'None');
  console.log('PrivateEvent:', privEvent ? privEvent._id : 'None');
  
  process.exit(0);
}

run().catch(console.error);
