require('dotenv').config();
const { connectDB, getDB } = require('./src/config/database');
connectDB().then(async () => {
  const db = getDB();
  const org = await db.collection('users').findOne({ 
    communityName: { $regex: /rally socials/i }, 
    userType: 'organiser' 
  });
  if (org) {
    console.log('Rally Socials userId:', org.userId);
    console.log('Rally Socials _id:', org._id);
    console.log('Bio:', org.bio);
    console.log('Profile pic:', org.profilePic);
  } else {
    console.log('NOT FOUND - listing all organisers:');
    const orgs = await db.collection('users').find({ userType: 'organiser' }).project({ userId: 1, communityName: 1, fullName: 1 }).toArray();
    orgs.forEach(o => console.log(' -', o.userId, '|', o.communityName, '|', o.fullName));
  }
  process.exit(0);
});
