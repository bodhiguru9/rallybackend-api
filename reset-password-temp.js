require('dotenv').config();
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

async function resetPasswordByEmail() {
  const uri = process.env.MONGODB_URL;
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db(process.env.DB_NAME || 'rally'); 
    
    const targetEmail = 'jovianr2710@gmail.com';
    // Use regex for case-insensitive match just in case
    const user = await db.collection('users').findOne({ email: { $regex: new RegExp('^' + targetEmail + '$', 'i') } });
    
    if (!user) {
      console.log(`User with email ${targetEmail} not found in DB: ${db.databaseName}`);
    } else {
      const newPassword = 'Password123!';
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(newPassword, salt);
      
      await db.collection('users').updateOne(
        { _id: user._id },
        { $set: { password: hashedPassword, updatedAt: new Date() } }
      );
      
      console.log(`Successfully reset password for user ${user.email} (ID: ${user.userId || user._id})`);
      console.log(`Mobile Number on record: ${user.mobileNumber || 'N/A'}`);
      console.log(`New password is: ${newPassword}`);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}

resetPasswordByEmail();
