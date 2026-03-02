/**
 * Seed Super Admin user
 * Run: node scripts/seedSuperAdmin.js
 * Creates admin@rally.com / admin123 if not exists.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { connectDB } = require('../src/config/database');
const User = require('../src/models/User');

const SUPER_ADMIN_EMAIL = 'admin@rally.com';
const SUPER_ADMIN_PASSWORD = 'admin123';

async function seedSuperAdmin() {
  try {
    await connectDB();
    const existing = await User.findByEmail(SUPER_ADMIN_EMAIL);
    if (existing) {
      console.log('Super admin already exists:', SUPER_ADMIN_EMAIL);
      process.exit(0);
      return;
    }
    const user = await User.create({
      userType: 'superadmin',
      email: SUPER_ADMIN_EMAIL,
      mobileNumber: null,
      password: SUPER_ADMIN_PASSWORD,
      fullName: 'Super Admin',
      profilePic: null,
      isEmailVerified: true,
      isMobileVerified: false,
    });
    console.log('Super admin created successfully.');
    console.log('Email:', SUPER_ADMIN_EMAIL);
    console.log('Password:', SUPER_ADMIN_PASSWORD);
    console.log('UserId:', user.userId);
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  }
}

seedSuperAdmin();
