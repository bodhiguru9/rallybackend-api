require('dotenv').config();
const { MongoClient } = require('mongodb');

async function attachPhoneNumber() {
  const uri = process.env.MONGODB_URL;
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db(process.env.DB_NAME || 'rally'); 
    
    const targetEmail = 'jovianr2710@gmail.com';
    const newPhoneNumber = '+971545627010'; 
    
    const result = await db.collection('users').updateOne(
      { email: { $regex: new RegExp('^' + targetEmail + '$', 'i') } },
      { $set: { mobileNumber: newPhoneNumber, updatedAt: new Date() } }
    );
    
    if (result.matchedCount === 0) {
      console.log(`User with email ${targetEmail} not found.`);
    } else {
      console.log(`Successfully attached phone number ${newPhoneNumber} to ${targetEmail}`);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}

attachPhoneNumber();
