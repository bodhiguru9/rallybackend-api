require('dotenv').config();
const { MongoClient } = require('mongodb');

async function checkEventIndexes() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/rally';
  console.log('Connecting to MongoDB...');
  
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('✅ Connected successfully to MongoDB server');
    
    const dbName = uri.split('/').pop().split('?')[0] || 'rally';
    const db = client.db(dbName);
    const eventsCollection = db.collection('events');
    
    // 1. Check existing indexes
    console.log('\n--- Current Indexes on "events" collection ---');
    try {
      const indexes = await eventsCollection.indexes();
      if (indexes.length > 0) {
        indexes.forEach((index, i) => {
          console.log(`\nIndex ${i + 1}: ${index.name}`);
          console.log(`Keys: ${JSON.stringify(index.key)}`);
        });
      } else {
        console.log('No indexes found.');
      }
    } catch (e) {
       console.log('Error fetching indexes. Collection might not exist.', e.message);
    }

    // 2. Run execution plan test for creatorId query
    console.log('\n--- Execution Plan for { creatorId: "test_id" } ---');
    try {
      const explainResult = await eventsCollection.find({ creatorId: "test_id" }).explain("executionStats");
      const winningPlan = explainResult.queryPlanner.winningPlan;
      
      const stage = winningPlan.stage || (winningPlan.queryPlan && winningPlan.queryPlan.stage);
      console.log(`Stage used: ${stage}`);
      
      if (stage === 'COLLSCAN') {
        console.log('❌ WARNING: Database is performing a full Collection Scan (COLLSCAN). The index is MISSING.');
      } else if (stage === 'IXSCAN' || stage === 'FETCH') {
        console.log('✅ SUCCESS: Database is using an Index (IXSCAN). The index EXISTS.');
        const indexName = winningPlan.inputStage?.indexName || winningPlan.indexName || (winningPlan.queryPlan && winningPlan.queryPlan.inputStage?.indexName);
        if (indexName) console.log(`Index used: ${indexName}`);
      } else {
        console.log(`Other stage: ${stage}`);
      }
    } catch (e) {
      console.log('Error running explain:', e.message);
    }
    
  } catch (error) {
    console.error('❌ Error connecting to database:', error.message);
  } finally {
    await client.close();
    console.log('\nDisconnected from MongoDB');
  }
}

checkEventIndexes();
