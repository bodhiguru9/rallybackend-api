require('dotenv').config();
const { MongoClient } = require('mongodb');

async function exploreDB() {
  const uri = process.env.MONGODB_URL;
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const adminDb = client.db().admin();
    const dbInfo = await adminDb.listDatabases();
    
    console.log("Databases on this cluster:");
    for (let dbObj of dbInfo.databases) {
      console.log(`- ${dbObj.name} (Size: ${dbObj.sizeOnDisk})`);
      const currentDb = client.db(dbObj.name);
      try {
        const collections = await currentDb.listCollections().toArray();
        console.log(`  Collections: ${collections.map(c => c.name).join(', ')}`);
        
        // Check users collection
        if (collections.some(c => c.name === 'users')) {
          const userCount = await currentDb.collection('users').countDocuments();
          console.log(`  -> 'users' collection has ${userCount} documents`);
        }
      } catch (e) {
        console.log(`  (Cannot read collections)`);
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}

exploreDB();
