const jwt = require('jsonwebtoken');
const http = require('http');
const { MongoClient } = require('mongodb');
require('dotenv').config();

async function run() {
  const url = process.env.MONGODB_URL;
  const client = new MongoClient(url);

  try {
    await client.connect();
    const db = client.db('rally');
    
    const user = await db.collection('users').findOne({});
    if (!user) {
      console.log('No users found in db.');
      await client.close();
      return;
    }
    
    const oldType = user.userType;
    if (oldType !== 'superadmin') {
       await db.collection('users').updateOne({ _id: user._id }, { $set: { userType: 'superadmin' } });
       console.log(`Updated user ${user._id} to superadmin`);
    }

    const secret = process.env.JWT_SECRET || 'relly-is-really';
    const token = jwt.sign({ userId: user._id.toString(), userType: 'superadmin' }, secret, { expiresIn: '1h' });

    const payload = JSON.stringify({
      audience: { type: 'all' },
      message: {
        title: 'Test Broadcast Notification (Attempt 2)',
        body: 'This is another test broadcast to ensure push notifications are working, with a new unique message!',
        action: { type: 'none' }
      },
      metadata: { category: 'announcement' },
      notification: { channel: 'push', priority: 'high' }
    });

    const options = {
      hostname: 'localhost',
      port: 8080,
      path: '/api/admin/broadcasts',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', async () => {
        console.log('Response Status:', res.statusCode);
        console.log('Response Body:', data);
        
        if (oldType !== 'superadmin') {
           await db.collection('users').updateOne({ _id: user._id }, { $set: { userType: oldType } });
           console.log(`Reverted user ${user._id} back to ${oldType}`);
        }
        await client.close();
      });
    });

    req.on('error', (e) => {
      console.error(`Problem with request: ${e.message}`);
      client.close();
    });

    req.write(payload);
    req.end();
  } catch(e) {
    console.error(e);
    await client.close();
  }
}

run();
