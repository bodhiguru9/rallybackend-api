const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
require('dotenv').config();

const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID.trim(),
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL.trim(),
  privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n').trim(),
};

initializeApp({
  credential: cert(serviceAccount)
});

async function findUser() {
    try {
        console.log("Searching in Firebase Auth...");
        let users = [];
        let pageToken;
        do {
            const listUsersResult = await getAuth().listUsers(1000, pageToken);
            users = users.concat(listUsersResult.users);
            pageToken = listUsersResult.pageToken;
        } while (pageToken);

        const found = users.filter(u => 
            (u.phoneNumber && u.phoneNumber.includes('0585440080')) ||
            (u.displayName && u.displayName.toLowerCase().includes('shuttles')) ||
            (u.email && u.email.toLowerCase().includes('shuttles'))
        );

        console.log(`Found ${found.length} users in Firebase Auth:`);
        found.forEach(u => console.log(JSON.stringify(u, null, 2)));

    } catch (e) {
        console.error("Error:", e);
    }
}

findUser();
