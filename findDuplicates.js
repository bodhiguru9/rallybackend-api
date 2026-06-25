require('dotenv').config();
const { MongoClient } = require('mongodb');

async function checkDuplicates() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('No MONGODB_URI found in environment');
    return;
  }
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db();
    const eventJoins = db.collection('eventJoins');
    
    console.log('Connected to database. Searching for duplicate eventJoins...');
    
    // Aggregation pipeline to find duplicates
    const duplicates = await eventJoins.aggregate([
      {
        $group: {
          _id: { 
            userId: "$userId", 
            eventId: "$eventId", 
            occurrenceStart: "$occurrenceStart" 
          },
          count: { $sum: 1 },
          joinDates: { $push: "$joinedAt" },
          documentIds: { $push: "$_id" }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]).toArray();

    console.log(`\nFound ${duplicates.length} sets of duplicate join records.`);
    
    if (duplicates.length > 0) {
      console.log('\nHere is a sample of the duplicates found:');
      console.log(JSON.stringify(duplicates.slice(0, 3), null, 2));
    } else {
      console.log('\nNo duplicates found in the collection. The issue might have been something else.');
    }
  } catch (error) {
    console.error('Error during execution:', error);
  } finally {
    await client.close();
  }
}

checkDuplicates();
