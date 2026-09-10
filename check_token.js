require('dotenv').config();
const { connectDB, getDB, closeDB } = require('./src/config/database');
const { ObjectId } = require('mongodb');

const checkToken = async () => {
  try {
    await connectDB();
    const db = getDB();
    const usersCol = db.collection('users');

    const userId = '6a81999480c70cbc294cb7ba';
    
    let user = null;
    try {
        user = await usersCol.findOne({ _id: new ObjectId(userId) });
    } catch(err) {
        // Not a valid ObjectId
    }

    if (!user) {
        user = await usersCol.findOne({ fullName: /Rally Socials/i });
    }

    if (user) {
      console.log(`User found: ${user.fullName} (${user._id})`);
      console.log(`FCM Token: ${user.fcmToken || 'NOT SET'}`);
    } else {
      console.log(`User not found.`);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await closeDB();
  }
};

checkToken();
