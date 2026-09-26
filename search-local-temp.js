require('dotenv').config();
const { MongoClient } = require('mongodb');

async function checkSpaces() {
  const uri = process.env.MONGODB_URL;
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db('rally');
    const allUsers = await db.collection('users').find({}, { projection: { mobileNumber: 1, email: 1 } }).toArray();
    
    const target = '545627010';
    
    const match = allUsers.find(u => {
      const mob = u.mobileNumber ? String(u.mobileNumber).replace(/\D/g, '') : '';
      return mob.includes(target);
    });
    
    if (match) {
      console.log(`Found matching user: ID ${match._id}, Mobile: ${match.mobileNumber}`);
    } else {
      console.log(`Still no match after removing spaces/dashes.`);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}

checkSpaces();
