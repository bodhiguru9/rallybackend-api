const Booking = require('./src/models/Booking');
const { connectDB, closeDB } = require('./src/config/database');
const mongoose = require('mongoose');

async function test() {
  await connectDB();
  try {
    const userId = '65f338765f338765f3387123'; // dummy
    console.log('Testing Booking.getBookedBookings...');
    await Booking.getBookedBookings(userId, 20, 0);
    console.log('Success!');
  } catch (err) {
    console.error('Error:', err.message);
  }

  try {
    console.log('Testing Booking.getPendingBookings...');
    await Booking.getPendingBookings(userId, 20, 0);
    console.log('Success!');
  } catch (err) {
    console.error('Error:', err.message);
  }
  
  await closeDB();
}

test();
