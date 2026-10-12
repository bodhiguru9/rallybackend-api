require('dotenv').config();
const { connectDB, getDB, closeDB } = require('./src/config/database');

const removeDob = async () => {
  try {
    await connectDB();
    const db = getDB();
    const usersCol = db.collection('users');

    const email = 'testmail200504@gmail.com';
    
    // Find the user
    const user = await usersCol.findOne({ email: email });

    if (user) {
      console.log(`User found: ${user.fullName} (${user._id})`);
      console.log(`Current DOB: ${user.dob || 'NOT SET'}`);
      
      // Unset dob
      const result = await usersCol.updateOne(
        { _id: user._id },
        { $unset: { dob: "" } }
      );
      
      if (result.modifiedCount > 0) {
        console.log(`Successfully removed dob for user ${email}`);
      } else {
        console.log(`No changes made (dob might already be removed)`);
      }
    } else {
      console.log(`User with email ${email} not found.`);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await closeDB();
  }
};

removeDob();
