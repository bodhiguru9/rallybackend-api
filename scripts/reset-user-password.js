require('dotenv').config();
const { connectDB } = require('../src/config/database');
const User = require('../src/models/User');

async function resetPassword() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: node reset-user-password.js <email> <new_password>');
    process.exit(1);
  }

  const email = args[0];
  const newPassword = args[1];

  try {
    console.log('Connecting to database...');
    await connectDB();
    
    console.log(`Looking for user with email: ${email}`);
    const user = await User.findByEmail(email);
    
    if (!user) {
      console.error('User not found.');
      process.exit(1);
    }
    
    console.log(`User found. Updating password...`);
    const success = await User.updateById(user._id, { password: newPassword });
    
    if (success) {
      console.log('Password reset successfully.');
    } else {
      console.error('Failed to update password.');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error resetting password:', error);
    process.exit(1);
  }
}

resetPassword();
