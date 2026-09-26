require('dotenv').config();
const { MongoClient } = require('mongodb');

async function searchUser() {
  const uri = process.env.MONGODB_URL;
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db('rally'); 
    
    // Check various types for mobile number
    const queries = [
      { mobileNumber: '545627010' },
      { mobileNumber: 545627010 },
      { whatsappNumber: '545627010' },
      { whatsappNumber: 545627010 }
    ];
    
    let foundUser = null;
    for (let q of queries) {
      foundUser = await db.collection('users').findOne(q);
      if (foundUser) {
        console.log(`Found user matching query ${JSON.stringify(q)}`);
        break;
      }
    }
    
    if (!foundUser) {
      console.log(`User 545627010 not found with exact match string or number.`);
      // Let's do a find by substring manually in code just in case
      // e.g. looking through some users if it's formatted weirdly (like +971545627010 or 0545627010)
      console.log('Searching for any user ending with 545627010...');
      const allUsers = await db.collection('users').find({}, { projection: { mobileNumber: 1, email: 1 } }).toArray();
      const match = allUsers.find(u => u.mobileNumber && String(u.mobileNumber).includes('545627010'));
      if (match) {
        console.log(`Found user by partial match: ${JSON.stringify(match)}`);
      } else {
        console.log('No partial matches found either.');
      }
    } else {
      console.log(`- ID: ${foundUser._id}, Mobile: ${foundUser.mobileNumber}, Email: ${foundUser.email}`);
    }
    
  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}

searchUser();
