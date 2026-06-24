const { connectDB, closeDB } = require('../src/config/database');
const Booking = require('../src/models/Booking');

async function test() {
  await connectDB();
  console.log('DB Connected');
  
  const dummyUserId = '60d5ecb54b51a0210c410000';
  
  try {
    console.log('Testing Booking.findByUser for booked...');
    const booked = await Booking.findByUser(dummyUserId, 'booked', 20, 0);
    console.log('Success! Booked returned array of length:', booked.length);
  } catch (err) {
    console.error('Error in booked test:', err.message);
  }

  try {
    console.log('Testing Booking.findByUser for pending...');
    const pending = await Booking.findByUser(dummyUserId, 'pending', 20, 0);
    console.log('Success! Pending returned array of length:', pending.length);
  } catch (err) {
    console.error('Error in pending test:', err.message);
  }

  await closeDB();
}

test();
