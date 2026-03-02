const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Token = require('../models/Token');
const { sendPasswordResetEmail, sendPasswordResetOTP } = require('../utils/email');
const { sendWhatsAppOTP, generateOTP } = require('./twilio.service');
const signupOTPService = require('./signup-otp.service');
const { normalizeMobileNumber } = signupOTPService;
const { getBookingStatsByUsers } = require('../utils/bookingStats');

/**
 * Generate JWT Access Token (short-lived)
 */
const generateAccessToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '15m', // Default 15 minutes
  });
};

/**
 * Generate Refresh Token (long-lived)
 */
const generateRefreshToken = () => {
  return crypto.randomBytes(64).toString('hex');
};

/**
 * Store refresh token in database
 */
const storeRefreshToken = async (userId, refreshToken) => {
  // Refresh token expires in 30 days
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await Token.create(userId, refreshToken, expiresAt);
};

/**
 * Generate both access and refresh tokens
 */
const generateTokens = async (userId) => {
  const accessToken = generateAccessToken(userId);
  const refreshToken = generateRefreshToken();
  await storeRefreshToken(userId, refreshToken);
  return { accessToken, refreshToken };
};

const addBookingStatsToResponse = async (user, userResponse) => {
  const statsMap = await getBookingStatsByUsers([user._id]);
  const stats = statsMap.get(user._id.toString()) || { bookedCount: 0, totalSpent: 0 };
  userResponse.totalBookedEvents = stats.bookedCount;
  userResponse.totalBookingAmount = stats.totalSpent;
};

/**
 * Generate JWT Token (backward compatibility - now returns access token)
 */
const generateToken = (userId) => {
  return generateAccessToken(userId);
};

/**
 * Signup service - handles both player and organiser signup
 * Now requires signupToken from OTP verification
 */
const signup = async (userData) => {
  // Validate signup token is provided
  if (!userData.signupToken) {
    throw new Error('Signup token is required. Please verify OTP first.');
  }

  // Get signup data using token only (to find which identifier was verified)
  const signupData = await signupOTPService.getSignupDataByToken(userData.signupToken);

  // Validate user type matches
  if (userData.userType !== signupData.userType) {
    throw new Error(`User type mismatch. Expected ${signupData.userType}`);
  }

  // Determine which identifier was used in OTP and which one is required now
  let verifiedEmail = null;
  let verifiedMobile = null;
  let alternativeEmail = null;
  let alternativeMobile = null;

  if (signupData.isEmail) {
    // OTP was verified with email, so we need mobileNumber in signup
    verifiedEmail = signupData.identifier; // Use email from OTP verification
    alternativeMobile = userData.mobileNumber; // Require mobileNumber in signup
    
    if (!alternativeMobile) {
      throw new Error('Mobile number is required. You verified OTP with email, please provide mobile number.');
    }
  } else {
    // OTP was verified with mobileNumber, so we need email in signup
    verifiedMobile = signupData.identifier; // Use mobileNumber from OTP verification
    alternativeEmail = userData.email; // Require email in signup
    
    if (!alternativeEmail) {
      throw new Error('Email is required. You verified OTP with mobile number, please provide email.');
    }
  }

  // Normalize mobile number using consistent function
  let normalizedMobile = null;
  const mobileToNormalize = verifiedMobile || alternativeMobile;
  if (mobileToNormalize) {
    // Use same normalization as signup OTP service
    normalizedMobile = mobileToNormalize.replace(/[^\d+]/g, '').trim();
    normalizedMobile = normalizedMobile.replace(/\s+/g, '').replace(/-/g, '');
    
    if (!normalizedMobile.startsWith('+')) {
      if (normalizedMobile.length === 10) {
        normalizedMobile = `+1${normalizedMobile}`;
      } else if (normalizedMobile.length === 11 && normalizedMobile.startsWith('1')) {
        normalizedMobile = `+${normalizedMobile}`;
      } else {
        normalizedMobile = `+${normalizedMobile}`;
      }
    }
  }

  // Normalize WhatsApp number if provided (optional)
  let whatsappNumberNormalized = null;
  if (userData.whatsappNumber && String(userData.whatsappNumber).trim()) {
    whatsappNumberNormalized = String(userData.whatsappNumber).replace(/[^\d+]/g, '').trim();
    whatsappNumberNormalized = whatsappNumberNormalized.replace(/\s+/g, '').replace(/-/g, '');
    if (!whatsappNumberNormalized.startsWith('+')) {
      if (whatsappNumberNormalized.length === 10) {
        whatsappNumberNormalized = `+91${whatsappNumberNormalized}`;
      } else if (whatsappNumberNormalized.length >= 11) {
        whatsappNumberNormalized = `+${whatsappNumberNormalized}`;
      } else {
        whatsappNumberNormalized = `+${whatsappNumberNormalized}`;
      }
    }
  }

  // Prepare user data based on type - combine both identifiers
  // password is optional; if not provided, user can set it later via forgot-password flow
  const createData = {
    userType: userData.userType,
    email: (verifiedEmail || alternativeEmail) ? (verifiedEmail || alternativeEmail).toLowerCase() : null,
    mobileNumber: normalizedMobile,
    whatsappNumber: whatsappNumberNormalized,
    password: userData.password && String(userData.password).trim() ? userData.password : null,
    profilePic: userData.profilePic || null,
    // Mark as verified since OTP was already verified
    isMobileVerified: signupData.isEmail ? false : true,
    isEmailVerified: signupData.isEmail ? true : false,
  };

  // Add type-specific fields (dob, gender optional for both)
  if (userData.userType === 'player') {
    createData.fullName = userData.fullName.trim();
    createData.dob = userData.dob ? new Date(userData.dob) : null;
    createData.gender = userData.gender ? String(userData.gender).toLowerCase() : null;
    createData.sport1 = userData.sport1.trim();
    createData.sport2 = userData.sport2.trim();
    createData.sports = [userData.sport1.trim(), userData.sport2.trim()];
  } else if (userData.userType === 'organiser') {
    createData.fullName = userData.fullName.trim();
    createData.yourBest = userData.yourBest.toLowerCase();
    createData.communityName = userData.communityName.trim();
    createData.yourCity = userData.yourCity.trim();
    createData.dob = userData.dob ? new Date(userData.dob) : null;
    createData.gender = userData.gender ? String(userData.gender).toLowerCase() : null;
    createData.sport1 = userData.sport1.trim();
    createData.sport2 = userData.sport2.trim();
    createData.sports = [userData.sport1.trim(), userData.sport2.trim()];
    createData.bio = userData.bio ? userData.bio.trim() : null;
    createData.instagramLink = userData.instagramLink ? userData.instagramLink.trim() : null;
    // Profile visibility: 'public' or 'private', default to 'private' if not provided
    createData.profileVisibility = userData.profileVisibility 
      ? userData.profileVisibility.toLowerCase() 
      : 'private';
  }

  // Create user
  const user = await User.create(createData);

  // Cleanup signup OTP data after successful signup
  // Use the verified identifier from signupData
  signupOTPService.cleanupSignupData(signupData.identifier);

  // Generate tokens (access token and refresh token)
  const mongoUserId = user._id.toString();
  const { accessToken, refreshToken } = await generateTokens(mongoUserId);

  // Prepare response based on user type
  // Use sequential userId (1, 2, 3...) instead of MongoDB ObjectId
  const userResponse = {
    id: user.userId, // Sequential ID (1, 2, 3...)
    userId: user.userId, // Sequential ID for clarity
    mongoId: mongoUserId, // MongoDB ObjectId (for internal use if needed)
    userType: user.userType,
    email: user.email,
    mobileNumber: user.mobileNumber,
    profilePic: user.profilePic || null, // Always include profilePic field
    isEmailVerified: user.isEmailVerified || false,
    isMobileVerified: user.isMobileVerified || false,
  };

  // Add type-specific fields to response
  if (user.userType === 'player') {
    userResponse.fullName = user.fullName;
    userResponse.dob = user.dob;
    userResponse.gender = user.gender;
    userResponse.sport1 = user.sport1;
    userResponse.sport2 = user.sport2;
    userResponse.sports = user.sports;
  } else if (user.userType === 'organiser') {
    userResponse.fullName = user.fullName;
    userResponse.yourBest = user.yourBest;
    userResponse.communityName = user.communityName;
    userResponse.yourCity = user.yourCity;
    userResponse.sport1 = user.sport1;
    userResponse.sport2 = user.sport2;
    userResponse.sports = user.sports;
    userResponse.bio = user.bio;
    userResponse.instagramLink = user.instagramLink || null;
    userResponse.profileVisibility = user.profileVisibility || 'private';
    userResponse.followersCount = user.followersCount || 0;
    userResponse.eventsCreated = user.eventsCreated || 0;
    userResponse.totalAttendees = user.totalAttendees || 0;
  }

  // Add following count for all users
  userResponse.followingCount = user.followingCount || 0;
  await addBookingStatsToResponse(user, userResponse);

  return {
    user: userResponse,
    token: accessToken,
    refreshToken,
    message: 'User registered successfully',
  };
};

/**
 * Signin service - accepts email or mobile number
 */
const signin = async (emailOrMobile, password) => {
  // Find user by email or mobile number
  const user = await User.findByEmailOrMobile(emailOrMobile);
  if (!user) {
    throw new Error('Invalid credentials');
  }

  // Check password (user may have no password if they signed up without one)
  if (!user.password) {
    throw new Error('No password set. Please use forgot password to set a password.');
  }
  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    throw new Error('Invalid credentials');
  }

  // Generate tokens (access token and refresh token)
  const mongoUserId = user._id.toString();
  const { accessToken, refreshToken } = await generateTokens(mongoUserId);

  // Prepare user response based on type
  // Use sequential userId (1, 2, 3...) instead of MongoDB ObjectId
  const userResponse = {
    id: user.userId, // Sequential ID (1, 2, 3...)
    userId: user.userId, // Sequential ID for clarity
    mongoId: mongoUserId, // MongoDB ObjectId (for internal use if needed)
    userType: user.userType,
    email: user.email,
    mobileNumber: user.mobileNumber,
    profilePic: user.profilePic || null, // Always include profilePic field
    isEmailVerified: user.isEmailVerified || false,
    isMobileVerified: user.isMobileVerified || false,
  };

  // Add type-specific fields
  if (user.userType === 'player') {
    userResponse.fullName = user.fullName;
    userResponse.dob = user.dob;
    userResponse.gender = user.gender;
    userResponse.sport1 = user.sport1;
    userResponse.sport2 = user.sport2;
    userResponse.sports = user.sports;
  } else if (user.userType === 'organiser') {
    userResponse.fullName = user.fullName;
    userResponse.yourBest = user.yourBest;
    userResponse.communityName = user.communityName;
    userResponse.yourCity = user.yourCity;
    userResponse.sport1 = user.sport1;
    userResponse.sport2 = user.sport2;
    userResponse.sports = user.sports;
    userResponse.bio = user.bio;
    userResponse.instagramLink = user.instagramLink || null;
    userResponse.profileVisibility = user.profileVisibility || 'private';
    userResponse.followersCount = user.followersCount || 0;
    userResponse.eventsCreated = user.eventsCreated || 0;
    userResponse.totalAttendees = user.totalAttendees || 0;
  } else if (user.userType === 'superadmin') {
    userResponse.fullName = user.fullName || 'Super Admin';
  }

  // Add following count for all users
  userResponse.followingCount = user.followingCount || 0;
  await addBookingStatsToResponse(user, userResponse);

  return {
    user: userResponse,
    token: accessToken,
    refreshToken,
  };
};

/**
 * Forgot password service - accepts email OR mobile number, sends OTP via Twilio WhatsApp (same as signup)
 */
const forgotPassword = async (emailOrMobile) => {
  // Check if it's email or mobile number
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailOrMobile);
  
  let user;
  let normalizedIdentifier;
  
  if (isEmail) {
    // Find user by email
    normalizedIdentifier = emailOrMobile.toLowerCase();
    user = await User.findByEmail(normalizedIdentifier);
  } else {
    // Normalize mobile number using same function as signup
    try {
      normalizedIdentifier = normalizeMobileNumber(emailOrMobile);
      user = await User.findByMobileNumber(normalizedIdentifier);
    } catch (error) {
      // Invalid mobile number format - don't reveal if user exists for security
      return { message: 'If account exists, OTP has been sent' };
    }
  }

  if (!user) {
    // Don't reveal if user exists for security
    return { message: 'If account exists, OTP has been sent' };
  }

  // Generate OTP (same as signup)
  const otp = generateOTP();
  const otpExpire = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  const hashedOTP = crypto.createHash('sha256').update(otp).digest('hex');

  // Store OTP data (same logging format as signup)
  const storeKey = `${isEmail ? 'email' : 'mobile'}:${normalizedIdentifier}`;
  
  console.log('\n🔐 ========== SEND FORGOT PASSWORD OTP ==========');
  console.log('📧 Original Input:', emailOrMobile);
  console.log('🔧 Normalized Identifier:', normalizedIdentifier);
  console.log('🔑 Store Key:', storeKey);
  console.log('🔢 OTP Code:', otp);
  console.log('👤 User Type:', user.userType);
  console.log('📍 Type:', isEmail ? 'EMAIL' : 'MOBILE');
  console.log('⏰ Expires At:', new Date(otpExpire.getTime()).toISOString());

  // Save OTP to user (using resetPasswordToken field for OTP storage)
  await User.updateById(user._id, {
    resetPasswordToken: hashedOTP,
    resetPasswordExpire: otpExpire,
  });

  // Log user info (similar to signup's store keys logging)
  console.log('👤 User ID:', user.userId);
  console.log('👤 User Mongo ID:', user._id.toString());
  console.log('✅ OTP Stored Successfully');
  console.log('========================================\n');

  // Check EMAIL_OTP environment variable (same as signup)
  const emailOTPEnabled = process.env.EMAIL_OTP === 'true' || 
                           process.env.EMAIL_OTP === '1' || 
                           process.env.EMAIL_OTP === 'enabled' ||
                           process.env.EMAIL_OTP === 'yes';

  // Send OTP (EXACT same logic as signup - line by line match)
  try {
    if (isEmail) {
      if (emailOTPEnabled) {
        console.log('📧 Attempting to send forgot password OTP via EMAIL...');
        await sendPasswordResetOTP(normalizedIdentifier, otp);
        console.log('✅ Email OTP sent successfully');
      }
      // If EMAIL_OTP is disabled, still keep the OTP in database for verification
      // The OTP will be shown in console logs from email utility
    } else {
      // Send WhatsApp OTP (EXACT same as signup - direct call with context)
      console.log('📱 Attempting to send forgot password OTP via WHATSAPP...');
      console.log('📱 Calling sendWhatsAppOTP with:', {
        mobileNumber: normalizedIdentifier,
        otp: otp,
        context: 'forgot-password'
      });
      await sendWhatsAppOTP(normalizedIdentifier, otp, 'forgot-password');
      console.log('✅ WhatsApp OTP sent successfully');
    }
  } catch (error) {
    console.error('\n❌ ========== ERROR IN FORGOT PASSWORD OTP SENDING ==========');
    console.error('❌ Error Type:', error.constructor.name);
    console.error('❌ Error Message:', error.message);
    console.error('❌ Error Stack:', error.stack);
    console.error('📍 Is Email:', isEmail);
    console.error('📍 Email OTP Enabled:', emailOTPEnabled);
    console.error('📧 Normalized Identifier:', normalizedIdentifier);
    console.error('🔢 OTP Code:', otp);
    console.error('============================================================\n');
    
    // Only remove from database if it's a critical error (EXACT same as signup)
    // For email when EMAIL_OTP is disabled, keep the entry
    if (isEmail && !emailOTPEnabled) {
      // Keep the entry even if email sending is disabled
      // User can still verify using the OTP shown in console
      console.log('⚠️  Email OTP disabled - keeping OTP in database for verification');
    } else {
      // Remove from database only if sending actually failed (EXACT same as signup removes from store)
      console.log('🗑️  Removing OTP from database due to send failure');
      await User.updateById(user._id, {
        resetPasswordToken: null,
        resetPasswordExpire: null,
      });
      throw new Error(`Failed to send OTP. Please try again.`);
    }
  }

  return {
    message: `OTP has been sent to your ${isEmail ? 'email' : 'mobile number'}`,
  };
};

/**
 * Verify OTP for forgot password (same normalization as signup)
 */
const verifyForgotPasswordOTP = async (emailOrMobile, otp) => {
  console.log('\n🔍 ========== VERIFY FORGOT PASSWORD OTP ==========');
  console.log('📧 Original Input:', emailOrMobile);
  console.log('🔢 OTP Provided:', otp);
  
  // Check if it's email or mobile number
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailOrMobile);
  console.log('📍 Detected Type:', isEmail ? 'EMAIL' : 'MOBILE');
  
  let user;
  let normalizedIdentifier;
  
  if (isEmail) {
    normalizedIdentifier = emailOrMobile.toLowerCase();
    user = await User.findByEmail(normalizedIdentifier);
  } else {
    // Normalize mobile number using same function as signup
    try {
      normalizedIdentifier = normalizeMobileNumber(emailOrMobile);
      console.log('🔧 Normalized Identifier:', normalizedIdentifier);
      user = await User.findByMobileNumber(normalizedIdentifier);
    } catch (error) {
      console.log('❌ Invalid mobile number format:', error.message);
      throw new Error('Invalid credentials');
    }
  }

  if (!user) {
    console.log('❌ User not found');
    throw new Error('Invalid credentials');
  }

  console.log('✅ User found');

  // Hash the OTP to compare with stored hash
  const hashedOTP = crypto.createHash('sha256').update(otp).digest('hex');
  console.log('🔢 Provided OTP Hash:', hashedOTP.substring(0, 16) + '...');
  console.log('🔢 Stored OTP Hash:', user.resetPasswordToken?.substring(0, 16) + '...');

  // Verify OTP and expiry
  if (user.resetPasswordToken !== hashedOTP) {
    console.log('❌ OTP Hash Mismatch!');
    throw new Error('Invalid OTP');
  }

  if (!user.resetPasswordExpire || new Date() > user.resetPasswordExpire) {
    console.log('❌ OTP Expired!');
    throw new Error('OTP has expired');
  }

  console.log('✅ OTP Verified Successfully!');

  // Generate a verification token (valid for 15 minutes) to allow password reset
  const verificationToken = crypto.randomBytes(32).toString('hex');
  const verificationTokenHash = crypto.createHash('sha256').update(verificationToken).digest('hex');
  const verificationExpire = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  // Store verification token (reuse resetPasswordToken field for verification token)
  await User.updateById(user._id, {
    resetPasswordToken: verificationTokenHash,
    resetPasswordExpire: verificationExpire,
  });

  console.log('✅ Verification Token Generated');
  console.log('✅ Verification Complete');
  console.log('====================================================\n');

  return {
    verified: true,
    verificationToken: verificationToken, // Return plain token to client
    message: 'OTP verified successfully. You can now set your new password.',
  };
};

/**
 * Set new password after OTP verification (same normalization as signup)
 */
const setNewPassword = async (emailOrMobile, verificationToken, newPassword) => {
  // Check if it's email or mobile number
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailOrMobile);
  
  let user;
  let normalizedIdentifier;
  
  if (isEmail) {
    normalizedIdentifier = emailOrMobile.toLowerCase();
    user = await User.findByEmail(normalizedIdentifier);
  } else {
    // Normalize mobile number using same function as signup
    try {
      normalizedIdentifier = normalizeMobileNumber(emailOrMobile);
      user = await User.findByMobileNumber(normalizedIdentifier);
    } catch (error) {
      throw new Error('Invalid credentials');
    }
  }

  if (!user) {
    throw new Error('Invalid credentials');
  }

  // Hash the verification token to compare with stored hash
  const hashedToken = crypto.createHash('sha256').update(verificationToken).digest('hex');

  // Verify token and expiry
  if (user.resetPasswordToken !== hashedToken) {
    throw new Error('Invalid or expired verification token. Please verify OTP again.');
  }

  if (!user.resetPasswordExpire || new Date() > user.resetPasswordExpire) {
    throw new Error('Verification token has expired. Please request a new OTP.');
  }

  // Update password and clear verification token
  await User.updateById(user._id, {
    password: newPassword,
    resetPasswordToken: null,
    resetPasswordExpire: null,
  });

  // Generate tokens for automatic login (use MongoDB ObjectId for JWT token)
  const mongoUserId = user._id.toString();
  const { accessToken: authToken, refreshToken } = await generateTokens(mongoUserId);

  // Prepare user response based on type
  // Use sequential userId (1, 2, 3...) instead of MongoDB ObjectId
  const userResponse = {
    id: user.userId, // Sequential ID (1, 2, 3...)
    userId: user.userId, // Sequential ID for clarity
    mongoId: mongoUserId, // MongoDB ObjectId (for internal use if needed)
    userType: user.userType,
    email: user.email,
    mobileNumber: user.mobileNumber,
    profilePic: user.profilePic || null, // Always include profilePic field
    isEmailVerified: user.isEmailVerified || false,
    isMobileVerified: user.isMobileVerified || false,
  };

  // Add type-specific fields
  if (user.userType === 'player') {
    userResponse.fullName = user.fullName;
    userResponse.dob = user.dob;
    userResponse.gender = user.gender;
    userResponse.sport1 = user.sport1;
    userResponse.sport2 = user.sport2;
    userResponse.sports = user.sports;
  } else if (user.userType === 'organiser') {
    userResponse.fullName = user.fullName;
    userResponse.yourBest = user.yourBest;
    userResponse.communityName = user.communityName;
    userResponse.yourCity = user.yourCity;
    userResponse.sport1 = user.sport1;
    userResponse.sport2 = user.sport2;
    userResponse.sports = user.sports;
    userResponse.bio = user.bio;
    userResponse.instagramLink = user.instagramLink || null;
    userResponse.profileVisibility = user.profileVisibility || 'private';
    userResponse.followersCount = user.followersCount || 0;
    userResponse.eventsCreated = user.eventsCreated || 0;
    userResponse.totalAttendees = user.totalAttendees || 0;
  }

  // Add following count for all users
  userResponse.followingCount = user.followingCount || 0;
  await addBookingStatsToResponse(user, userResponse);

  return {
    user: userResponse,
    token: authToken,
    refreshToken,
  };
};

/**
 * Reset password service - verifies OTP and resets password (kept for backward compatibility)
 * Uses same normalization as signup
 */
const resetPassword = async (emailOrMobile, otp, newPassword) => {
  // Check if it's email or mobile number
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailOrMobile);
  
  let user;
  let normalizedIdentifier;
  
  if (isEmail) {
    normalizedIdentifier = emailOrMobile.toLowerCase();
    user = await User.findByEmail(normalizedIdentifier);
  } else {
    // Normalize mobile number using same function as signup
    try {
      normalizedIdentifier = normalizeMobileNumber(emailOrMobile);
      user = await User.findByMobileNumber(normalizedIdentifier);
    } catch (error) {
      throw new Error('Invalid credentials');
    }
  }

  if (!user) {
    throw new Error('Invalid credentials');
  }

  // Hash the OTP to compare with stored hash
  const hashedOTP = crypto.createHash('sha256').update(otp).digest('hex');

  // Verify OTP and expiry
  if (user.resetPasswordToken !== hashedOTP) {
    throw new Error('Invalid OTP');
  }

  if (!user.resetPasswordExpire || new Date() > user.resetPasswordExpire) {
    throw new Error('OTP has expired');
  }

  // Update password and clear OTP
  await User.updateById(user._id, {
    password: newPassword,
    resetPasswordToken: null,
    resetPasswordExpire: null,
  });

  // Generate tokens for automatic login (use MongoDB ObjectId for JWT token)
  const mongoUserId = user._id.toString();
  const { accessToken: authToken, refreshToken } = await generateTokens(mongoUserId);

  // Prepare user response based on type
  // Use sequential userId (1, 2, 3...) instead of MongoDB ObjectId
  const userResponse = {
    id: user.userId, // Sequential ID (1, 2, 3...)
    userId: user.userId, // Sequential ID for clarity
    mongoId: mongoUserId, // MongoDB ObjectId (for internal use if needed)
    userType: user.userType,
    email: user.email,
    mobileNumber: user.mobileNumber,
    profilePic: user.profilePic || null, // Always include profilePic field
    isEmailVerified: user.isEmailVerified || false,
    isMobileVerified: user.isMobileVerified || false,
  };

  // Add type-specific fields
  if (user.userType === 'player') {
    userResponse.fullName = user.fullName;
    userResponse.dob = user.dob;
    userResponse.gender = user.gender;
    userResponse.sport1 = user.sport1;
    userResponse.sport2 = user.sport2;
    userResponse.sports = user.sports;
  } else if (user.userType === 'organiser') {
    userResponse.fullName = user.fullName;
    userResponse.yourBest = user.yourBest;
    userResponse.communityName = user.communityName;
    userResponse.yourCity = user.yourCity;
    userResponse.sport1 = user.sport1;
    userResponse.sport2 = user.sport2;
    userResponse.sports = user.sports;
    userResponse.bio = user.bio;
    userResponse.instagramLink = user.instagramLink || null;
    userResponse.profileVisibility = user.profileVisibility || 'private';
    userResponse.followersCount = user.followersCount || 0;
    userResponse.eventsCreated = user.eventsCreated || 0;
    userResponse.totalAttendees = user.totalAttendees || 0;
  }

  // Add following count for all users
  userResponse.followingCount = user.followingCount || 0;
  await addBookingStatsToResponse(user, userResponse);

  return {
    user: userResponse,
    token: authToken,
    refreshToken,
  };
};

/**
 * Verify OTP for mobile number
 */
const verifyOTP = async (mobileNumber, otp) => {
  // Find user with valid OTP
  const user = await User.findByMobileWithValidOTP(mobileNumber, otp);
  
  if (!user) {
    throw new Error('Invalid or expired OTP');
  }

  // Update user - mark mobile as verified and clear OTP
  await User.updateById(user._id, {
    isMobileVerified: true,
    otp: null,
    otpExpire: null,
  });

  // Generate tokens for verified user (use MongoDB ObjectId for JWT token)
  const mongoUserId = user._id.toString();
  const { accessToken: token, refreshToken } = await generateTokens(mongoUserId);

  // Prepare user response based on type
  // Use sequential userId (1, 2, 3...) instead of MongoDB ObjectId
  const userResponse = {
    id: user.userId, // Sequential ID (1, 2, 3...)
    userId: user.userId, // Sequential ID for clarity
    mongoId: mongoUserId, // MongoDB ObjectId (for internal use if needed)
    userType: user.userType,
    email: user.email,
    mobileNumber: user.mobileNumber,
    profilePic: user.profilePic || null, // Always include profilePic field
    isEmailVerified: user.isEmailVerified || false,
    isMobileVerified: true,
  };

  // Add type-specific fields
  if (user.userType === 'player') {
    userResponse.fullName = user.fullName;
    userResponse.dob = user.dob;
    userResponse.gender = user.gender;
    userResponse.sport1 = user.sport1;
    userResponse.sport2 = user.sport2;
    userResponse.sports = user.sports;
  } else if (user.userType === 'organiser') {
    userResponse.fullName = user.fullName;
    userResponse.yourBest = user.yourBest;
    userResponse.communityName = user.communityName;
    userResponse.yourCity = user.yourCity;
    userResponse.sport1 = user.sport1;
    userResponse.sport2 = user.sport2;
    userResponse.sports = user.sports;
    userResponse.bio = user.bio;
    userResponse.instagramLink = user.instagramLink || null;
    userResponse.profileVisibility = user.profileVisibility || 'private';
    userResponse.followersCount = user.followersCount || 0;
    userResponse.eventsCreated = user.eventsCreated || 0;
    userResponse.totalAttendees = user.totalAttendees || 0;
  }

  // Add following count for all users
  userResponse.followingCount = user.followingCount || 0;
  await addBookingStatsToResponse(user, userResponse);

  return {
    user: userResponse,
    token,
    refreshToken,
    message: 'Mobile number verified successfully',
  };
};

/**
 * Resend OTP to mobile number
 */
const resendOTP = async (mobileNumber) => {
  // Normalize mobile number
  let normalizedMobile = mobileNumber.replace(/[^\d+]/g, '');
  if (!normalizedMobile.startsWith('+')) {
    normalizedMobile = normalizedMobile.replace(/\D/g, '');
  }

  // Find user by mobile number
  const user = await User.findByMobileNumber(normalizedMobile);
  if (!user) {
    // Don't reveal if user exists for security
    return { message: 'If mobile number exists, OTP has been sent via WhatsApp' };
  }

  // Generate new OTP
  const otp = generateOTP();
  const otpExpire = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Update user with new OTP
  await User.updateById(user._id, {
    otp,
    otpExpire,
  });

  // Send WhatsApp OTP for resend
  try {
    await sendWhatsAppOTP(normalizedMobile, otp, 'resend-otp');
  } catch (error) {
    console.error('Error sending WhatsApp OTP:', error);
    throw new Error('Failed to send OTP. Please try again.');
  }

  return { message: 'If mobile number exists, OTP has been sent via WhatsApp' };
};

/**
 * WhatsApp login - send OTP for login (no password required)
 */
const whatsappLogin = async (mobileNumber) => {
  // Normalize mobile number
  let normalizedMobile = mobileNumber.replace(/[^\d+]/g, '');
  if (!normalizedMobile.startsWith('+')) {
    normalizedMobile = normalizedMobile.replace(/\D/g, '');
  }

  // Find user by mobile number
  const user = await User.findByMobileNumber(normalizedMobile);
  if (!user) {
    // Don't reveal if user exists for security
    return { message: 'If mobile number exists, OTP has been sent via WhatsApp' };
  }

  // Generate OTP for login
  const otp = generateOTP();
  const otpExpire = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Update user with login OTP
  await User.updateById(user._id, {
    otp,
    otpExpire,
  });

  // Send WhatsApp OTP for login
  try {
    await sendWhatsAppOTP(normalizedMobile, otp, 'login');
  } catch (error) {
    console.error('Error sending WhatsApp OTP for login:', error);
    throw new Error('Failed to send OTP. Please try again.');
  }

  return { message: 'If mobile number exists, OTP has been sent via WhatsApp' };
};

/**
 * Verify WhatsApp login OTP
 */
const verifyWhatsAppLogin = async (mobileNumber, otp) => {
  // Find user with valid OTP
  const user = await User.findByMobileWithValidOTP(mobileNumber, otp);
  
  if (!user) {
    throw new Error('Invalid or expired OTP');
  }

  // Clear OTP after successful login
  await User.updateById(user._id, {
    otp: null,
    otpExpire: null,
  });

  // Generate tokens for login (use MongoDB ObjectId for JWT token)
  const mongoUserId = user._id.toString();
  const { accessToken: token, refreshToken } = await generateTokens(mongoUserId);

  // Prepare user response based on type
  // Use sequential userId (1, 2, 3...) instead of MongoDB ObjectId
  const userResponse = {
    id: user.userId, // Sequential ID (1, 2, 3...)
    userId: user.userId, // Sequential ID for clarity
    mongoId: mongoUserId, // MongoDB ObjectId (for internal use if needed)
    userType: user.userType,
    email: user.email,
    mobileNumber: user.mobileNumber,
    profilePic: user.profilePic || null, // Always include profilePic field
    isEmailVerified: user.isEmailVerified || false,
    isMobileVerified: user.isMobileVerified || false,
  };

  // Add type-specific fields
  if (user.userType === 'player') {
    userResponse.fullName = user.fullName;
    userResponse.dob = user.dob;
    userResponse.gender = user.gender;
    userResponse.sport1 = user.sport1;
    userResponse.sport2 = user.sport2;
    userResponse.sports = user.sports;
  } else if (user.userType === 'organiser') {
    userResponse.fullName = user.fullName;
    userResponse.yourBest = user.yourBest;
    userResponse.communityName = user.communityName;
    userResponse.yourCity = user.yourCity;
    userResponse.sport1 = user.sport1;
    userResponse.sport2 = user.sport2;
    userResponse.sports = user.sports;
    userResponse.bio = user.bio;
    userResponse.instagramLink = user.instagramLink || null;
    userResponse.profileVisibility = user.profileVisibility || 'private';
    userResponse.followersCount = user.followersCount || 0;
    userResponse.eventsCreated = user.eventsCreated || 0;
    userResponse.totalAttendees = user.totalAttendees || 0;
  }

  // Add following count for all users
  userResponse.followingCount = user.followingCount || 0;
  await addBookingStatsToResponse(user, userResponse);

  return {
    user: userResponse,
    token,
    refreshToken,
    message: 'Login successful',
  };
};

/**
 * Refresh access token using refresh token
 */
const refreshAccessToken = async (refreshToken) => {
  // Find the refresh token in database
  const tokenDoc = await Token.findByToken(refreshToken);
  
  if (!tokenDoc) {
    throw new Error('Invalid or expired refresh token');
  }

  // Generate new access token
  const userId = tokenDoc.userId.toString();
  const accessToken = generateAccessToken(userId);

  // Update token timestamp
  await Token.updateTimestamp(refreshToken);

  return {
    accessToken,
    refreshToken, // Return same refresh token (can be rotated if needed)
  };
};

/**
 * Logout - remove refresh token
 */
const logout = async (refreshToken) => {
  // Delete the refresh token
  const deleted = await Token.deleteByToken(refreshToken);
  
  if (!deleted) {
    throw new Error('Invalid refresh token');
  }

  return {
    message: 'Logged out successfully',
  };
};

/**
 * Logout all devices - remove all refresh tokens for a user
 */
const logoutAll = async (userId) => {
  // Delete all refresh tokens for the user
  const deletedCount = await Token.deleteByUserId(userId);
  
  return {
    message: 'Logged out from all devices successfully',
    devicesLoggedOut: deletedCount,
  };
};

module.exports = {
  signup,
  signin,
  forgotPassword,
  resetPassword,
  verifyOTP,
  resendOTP,
  whatsappLogin,
  verifyWhatsAppLogin,
  refreshAccessToken,
  logout,
  logoutAll,
  generateToken,
  generateAccessToken,
  generateRefreshToken,
  generateTokens,
};

