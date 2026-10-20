require('dotenv').config();
const { connectDB, getDB, closeDB } = require('./src/config/database');
const { signin } = require('./src/services/auth.service');

async function main() {
  try {
    await connectDB();
    console.log('\n--- Simulating Login for Meghna ---');
    try {
      const result = await signin('meghna1800@gmail.com', '1234Rally');
      console.log('Login Success:', !!result);
    } catch (e) {
      console.log('Login Error:', e.message, 'Status:', e.statusCode);
    }

    console.log('\n--- Simulating Login for Jovian ---');
    try {
      const result = await signin('jovianr2710@gmail.com', '1234Rally');
      console.log('Login Success:', !!result);
    } catch (e) {
      console.log('Login Error:', e.message, 'Status:', e.statusCode);
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
