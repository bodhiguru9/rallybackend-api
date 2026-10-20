require('dotenv').config();
const { connectDB, getDB, closeDB } = require('./src/config/database');
const bcrypt = require('bcryptjs');

async function main() {
  try {
    await connectDB();
    const db = getDB();
    const users = db.collection('users');
    
    const emails = ['meghna1800@gmail.com', 'jovianr2710@gmail.com'];
    
    for (const email of emails) {
      const user = await users.findOne({ email: email.toLowerCase() });
      console.log(`\n--- User: ${email} ---`);
      if (user && user.password) {
        const isMatch = await bcrypt.compare('1234Rally', user.password);
        console.log(`Password matches '1234Rally': ${isMatch}`);
      } else {
        console.log('User or password not found');
      }
    }
  } catch (error) {
    console.error(error);
  } finally {
    try {
      await closeDB();
    } catch(e) {}
  }
}

main();
