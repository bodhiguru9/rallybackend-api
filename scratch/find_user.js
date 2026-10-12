const { MongoClient } = require('mongodb');

async function findUser() {
    const uris = [
        'mongodb+srv://bodhiguru7_db_user:mongodbnewpassword123@cluster0.uhtukkx.mongodb.net',
        'mongodb+srv://consoledevjourney_db_user:NnrV4lNcOnHWXv8X@cluster0.vi2fsdr.mongodb.net/?appName=Cluster0'
    ];
    
    for (const uri of uris) {
        console.log("Connecting to:", uri);
        const client = new MongoClient(uri);
        
        try {
            await client.connect();
            
            const adminDb = client.db('admin');
            const dbs = await adminDb.admin().listDatabases();
            
            for (let dbInfo of dbs.databases) {
                if (dbInfo.name === 'admin' || dbInfo.name === 'local') continue;
                
                const db = client.db(dbInfo.name);
                const collection = db.collection('users');
                
                const results = await collection.find({
                    $or: [
                        { mobileNumber: { $regex: '0585440080' } },
                        { whatsappNumber: { $regex: '0585440080' } },
                        { fullName: { $regex: 'shuttles', $options: 'i' } },
                        { communityName: { $regex: 'shuttles', $options: 'i' } }
                    ]
                }).toArray();

                if (results.length > 0) {
                    console.log(`\nFound in DB '${dbInfo.name}', collection 'users':`);
                    console.log(JSON.stringify(results, null, 2));
                }
            }
        } catch (e) {
            console.error("Error with URI", uri, e.message);
        } finally {
            await client.close();
        }
    }
}

findUser().catch(console.error);
