const crypto = require('crypto');
const { sendSignupOTP: sendEmailSignupOTP, sendPasswordResetOTP } = require('../utils/email');
const { sendWhatsAppOTP, generateOTP } = require('./twilio.service');
const User = require('../models/User');
const { getBookingStatsByUsers } = require('../utils/bookingStats');

// Test-only OTP bypass identifiers
const TEST_EMAIL = 'yadav.navin51@gmail.com';
const TEST_MOBILE_RAW = '9569734648';
const TEST_OTP = '359695';

// Persistent OTP store (MongoDB-backed) — shared across PM2 cluster workers and
// horizontally-scaled instances, and auto-expired via a TTL index. Replaces the
// old in-memory Map (which broke when "send OTP" and "verify OTP" hit different
// workers). Real expiry is still enforced by the numeric checks below; the TTL is
// only background garbage collection. No Redis required (uses existing MongoDB).
const otpStore = require('./otpStore');

/**
 * Normalize mobile number consistently
 * @param {string} mobileNumber - Mobile number to normalize
 * @returns {string} Normalized mobile number with country code
 */
const normalizeMobileNumber = (mobileNumber) => {
  let normalized = mobileNumber.replace(/[^\d+]/g, '').trim();
  normalized = normalized.replace(/\s+/g, '').replace(/-/g, '');

  if (!normalized.startsWith('+')) {
    if (normalized.length === 10) {
      normalized = `+91${normalized}`;
    } else if (normalized.length === 12 && normalized.startsWith('91')) {
      normalized = `+${normalized}`;
    } else {
      normalized = `+${normalized}`;
    }
  }

  const digitsOnly = normalized.replace(/\+/g, '');
  if (digitsOnly.length < 10 || digitsOnly.length > 15) {
    throw new Error(`Invalid phone number format. Number should be 10-15 digits with country code.`);
  }

  return normalized;
};

/**
 * Check if identifier is email
 * @param {string} identifier - Email or mobile number
 * @returns {boolean} True if email
 */
const isEmailIdentifier = (identifier) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
};

/**
 * Normalize identifier (email or mobile)
 * @param {string} emailOrMobile - Email or mobile number
 * @returns {Object} { normalizedIdentifier, isEmail }
 */
const normalizeIdentifier = (emailOrMobile) => {
  const isEmail = isEmailIdentifier(emailOrMobile);
  const normalizedIdentifier = isEmail
    ? emailOrMobile.toLowerCase()
    : normalizeMobileNumber(emailOrMobile);
  return { normalizedIdentifier, isEmail };
};

const getTestIdentifiers = () => {
  let normalizedMobile = null;
  try {
    normalizedMobile = normalizeMobileNumber(TEST_MOBILE_RAW);
  } catch (error) {
    normalizedMobile = null;
  }
  return {
    email: TEST_EMAIL.toLowerCase(),
    mobile: normalizedMobile,
  };
};

const isTestIdentifier = (normalizedIdentifier, isEmail) => {
  const testIds = getTestIdentifiers();
  if (isEmail) {
    return normalizedIdentifier === testIds.email;
  }
  return testIds.mobile && normalizedIdentifier === testIds.mobile;
};

/**
 * Generate and hash OTP
 * @returns {Object} { otp, hashedOTP, otpExpire }
 */
const generateAndHashOTP = () => {
  const otp = generateOTP();
  const otpExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
  const hashedOTP = crypto.createHash('sha256').update(otp).digest('hex');
  return { otp, hashedOTP, otpExpire };
};

/**
 * Get store key for OTP data
 * @param {string} normalizedIdentifier - Normalized email or mobile
 * @param {boolean} isEmail - Whether identifier is email
 * @param {string} context - Context prefix (e.g., 'forgot-password' or '')
 * @returns {string} Store key
 */
const getStoreKey = (normalizedIdentifier, isEmail, context = '') => {
  const prefix = context ? `${context}:` : '';
  return `${prefix}${isEmail ? 'email' : 'mobile'}:${normalizedIdentifier}`;
};

/**
 * Find stored data by identifier with fallback matching
 * @param {string} normalizedIdentifier - Normalized identifier
 * @param {boolean} isEmail - Whether identifier is email
 * @param {string} context - Context prefix
 * @returns {Promise<Object|null>} { storedData, storeKey } or null
 */
const findStoredData = async (normalizedIdentifier, isEmail, context = '') => {
  const primaryKey = getStoreKey(normalizedIdentifier, isEmail, context);
  let storedData = await otpStore.get(primaryKey);

  if (storedData) {
    return { storedData, storeKey: primaryKey };
  }

  // Try alternative formats for mobile numbers
  if (!isEmail) {
    const alternatives = [
      getStoreKey(normalizedIdentifier.replace('+', ''), isEmail, context),
      getStoreKey(`+${normalizedIdentifier.replace('+', '')}`, isEmail, context),
    ];

    for (const altKey of alternatives) {
      storedData = await otpStore.get(altKey);
      if (storedData) {
        return { storedData, storeKey: altKey };
      }
    }

    // Try partial matching (last 10 digits)
    const identifierDigits = normalizedIdentifier.replace(/\+/g, '');
    const prefix = context ? `${context}:` : '';
    const hit = await otpStore.getMobileByLast10(prefix, identifierDigits.slice(-10));
    if (hit) {
      return { storedData: hit.value, storeKey: hit.key };
    }
  }

  return null;
};

/**
 * Send OTP via email or WhatsApp
 * @param {string} normalizedIdentifier - Normalized identifier
 * @param {boolean} isEmail - Whether identifier is email
 * @param {string} otp - OTP code
 * @param {string} context - Context for OTP
 */
const sendOTP = async (normalizedIdentifier, isEmail, otp, context = 'signup') => {
  const emailOTPEnabled =
    process.env.EMAIL_OTP === 'true' ||
    process.env.EMAIL_OTP === '1' ||
    process.env.EMAIL_OTP === 'enabled' ||
    process.env.EMAIL_OTP === 'yes';

  if (isEmail) {
    if (!emailOTPEnabled) return;

    // ✅ choose correct email template/subject
    if (context === 'forgot-password') {
      await sendPasswordResetOTP(normalizedIdentifier, otp);
    } else {
      await sendEmailSignupOTP(normalizedIdentifier, otp); // ✅ signup email subject/template
    }
    return;
  }

  // WhatsApp OTP keeps using context already
  await sendWhatsAppOTP(normalizedIdentifier, otp, context);
};

/**
 * Send OTP for forgot password (via email or mobile number)
 * @param {string} emailOrMobile - Email address or mobile number
 * @returns {Promise<Object>} Result with message
 */
const sendForgotPasswordOTP = async (emailOrMobile) => {
  const { normalizedIdentifier, isEmail } = normalizeIdentifier(emailOrMobile);

  // Check if user exists (required for password reset)
  let user;
  if (isEmail) {
    user = await User.findByEmail(normalizedIdentifier);
  } else {
    try {
      user = await User.findByMobileNumber(normalizedIdentifier);
    } catch (error) {
      // Invalid mobile number format - don't reveal if user exists
      return { message: 'If account exists, OTP has been sent' };
    }
  }

  if (!user) {
    // Don't reveal if user exists for security
    return { message: 'If account exists, OTP has been sent' };
  }

  // Generate OTP (use fixed OTP for test identifiers)
  let otp = null;
  let hashedOTP = null;
  let otpExpire = null;
  if (isTestIdentifier(normalizedIdentifier, isEmail)) {
    otp = TEST_OTP;
    otpExpire = Date.now() + 10 * 60 * 1000;
    hashedOTP = crypto.createHash('sha256').update(otp).digest('hex');
  } else {
    const generated = generateAndHashOTP();
    otp = generated.otp;
    hashedOTP = generated.hashedOTP;
    otpExpire = generated.otpExpire;
  }

  // Store OTP data
  const storeKey = getStoreKey(normalizedIdentifier, isEmail, 'forgot-password');
  await otpStore.set(storeKey, {
    otp: hashedOTP,
    otpExpire,
    identifier: normalizedIdentifier,
    isEmail,
    expiresAt: otpExpire,
    userId: user.userId,
    userMongoId: user._id.toString(),
    userType: user.userType,
    context: 'forgot-password',
  });

  // Send OTP
  try {
    await sendOTP(normalizedIdentifier, isEmail, otp, 'forgot-password');
  } catch (error) {
    const emailOTPEnabled = process.env.EMAIL_OTP === 'true' ||
                           process.env.EMAIL_OTP === '1' ||
                           process.env.EMAIL_OTP === 'enabled' ||
                           process.env.EMAIL_OTP === 'yes';

    // Only remove from store if it's a critical error
    if (isEmail && !emailOTPEnabled) {
      // Keep entry for verification even if email sending is disabled
    } else {
      await otpStore.delete(storeKey);
      throw new Error(`Failed to send OTP. Please try again. Error: ${error.message}`);
    }
  }

  return {
    message: `OTP has been sent to your ${isEmail ? 'email' : 'mobile number'}`,
  };
};

/**
 * Send OTP for signup (via email or mobile number)
 * @param {string} emailOrMobile - Email address or mobile number
 * @param {string} userType - 'player' or 'organiser'
 * @returns {Promise<Object>} Result with message
 */
const sendSignupOTP = async (emailOrMobile, userType) => {
  if (!userType || !['player', 'organiser'].includes(userType)) {
    throw new Error('Invalid user type. Must be "player" or "organiser"');
  }

  const { normalizedIdentifier, isEmail } = normalizeIdentifier(emailOrMobile);

  // Check if identifier already exists (skip for test identifiers)
  if (!isTestIdentifier(normalizedIdentifier, isEmail)) {
    if (isEmail) {
      const emailExists = await User.emailExists(normalizedIdentifier);
      if (emailExists) {
        throw new Error('Email already registered');
      }
    } else {
      const mobileExists = await User.mobileNumberExists(normalizedIdentifier);
      if (mobileExists) {
        throw new Error('Mobile number already registered');
      }
    }
  }

  // Generate OTP
  const { otp, hashedOTP, otpExpire } = generateAndHashOTP();

  // Store OTP data
  const storeKey = getStoreKey(normalizedIdentifier, isEmail);
  await otpStore.set(storeKey, {
    otp: hashedOTP,
    otpExpire,
    userType,
    identifier: normalizedIdentifier,
    isEmail,
    expiresAt: otpExpire,
  });

  // Send OTP (skip sending for test identifiers)
  if (!isTestIdentifier(normalizedIdentifier, isEmail)) {
    try {
      await sendOTP(normalizedIdentifier, isEmail, otp, 'signup');
    } catch (error) {
      const emailOTPEnabled = process.env.EMAIL_OTP === 'true' ||
                             process.env.EMAIL_OTP === '1' ||
                             process.env.EMAIL_OTP === 'enabled' ||
                             process.env.EMAIL_OTP === 'yes';

      // Only remove from store if it's a critical error
      if (isEmail && !emailOTPEnabled) {
        // Keep entry for verification even if email sending is disabled
      } else {
        await otpStore.delete(storeKey);
        throw new Error(`Failed to send OTP. Please try again. Error: ${error.message}`);
      }
    }
  }

  return {
    message: `OTP has been sent to your ${isEmail ? 'email' : 'mobile number'}`,
  };
};

/**
 * Verify OTP (common logic for signup and forgot password)
 * @param {string} emailOrMobile - Email address or mobile number
 * @param {string} otp - OTP code
 * @param {string} context - Context prefix ('forgot-password' or '')
 * @returns {Promise<Object>} Result with verified token
 */
const verifyOTP = async (emailOrMobile, otp, context = '') => {
  const { normalizedIdentifier, isEmail } = normalizeIdentifier(emailOrMobile);

  // Find stored data
  let found = await findStoredData(normalizedIdentifier, isEmail, context);
  if (!found) {
    // Allow test OTP without stored state
    if (isTestIdentifier(normalizedIdentifier, isEmail) && otp === TEST_OTP) {
      const storeKey = getStoreKey(normalizedIdentifier, isEmail, context);
      const now = Date.now();
      const storedData = {
        otp: crypto.createHash('sha256').update(TEST_OTP).digest('hex'),
        otpExpire: now + 10 * 60 * 1000,
        userType: 'player',
        identifier: normalizedIdentifier,
        isEmail,
        expiresAt: now + 10 * 60 * 1000,
      };
      await otpStore.set(storeKey, storedData);
      found = { storedData, storeKey };
    } else {
      throw new Error('OTP not found or expired. Please request a new OTP.');
    }
  }

  const { storedData, storeKey } = found;

  // Check expiration
  if (Date.now() > storedData.expiresAt) {
    await otpStore.delete(storeKey);
    throw new Error('OTP has expired. Please request a new OTP.');
  }

  // Verify OTP (test identifier allows fixed OTP)
  if (isTestIdentifier(normalizedIdentifier, isEmail)) {
    if (otp !== TEST_OTP) {
      throw new Error('Invalid OTP');
    }
  } else {
    const hashedOTP = crypto.createHash('sha256').update(otp).digest('hex');
    if (storedData.otp !== hashedOTP) {
      throw new Error('Invalid OTP');
    }
  }

  // Generate verification token
  const verificationToken = isTestIdentifier(normalizedIdentifier, isEmail)
    ? 'TEST_SIGNUP_TOKEN'
    : crypto.randomBytes(32).toString('hex');
  const verificationTokenHash = crypto.createHash('sha256').update(verificationToken).digest('hex');
  const verificationTokenExpire = Date.now() + 60 * 60 * 1000; // 1 hour

  // Update stored data
  storedData.verificationToken = verificationTokenHash;
  storedData.verificationTokenExpire = verificationTokenExpire;
  storedData.verified = true;
  await otpStore.set(storeKey, storedData);

  return {
    verified: true,
    verificationToken,
    identifier: storedData.identifier,
    isEmail: storedData.isEmail,
    storeKey,
    storedData,
  };
};

/**
 * Verify OTP for signup
 * @param {string} emailOrMobile - Email address or mobile number
 * @param {string} otp - OTP code
 * @returns {Promise<Object>} Result with verified token for signup
 */
const verifySignupOTP = async (emailOrMobile, otp) => {
  const result = await verifyOTP(emailOrMobile, otp, '');

  // For signup, use 'signupToken' instead of 'verificationToken'
  const signupToken = result.verificationToken;
  result.storedData.signupToken = result.storedData.verificationToken;
  result.storedData.signupTokenExpire = result.storedData.verificationTokenExpire;
  await otpStore.set(result.storeKey, result.storedData);

  return {
    verified: true,
    signupToken,
    message: 'OTP verified successfully. You can now complete your signup.',
    userType: result.storedData.userType,
    identifier: result.storedData.identifier,
    isEmail: result.storedData.isEmail,
  };
};

/**
 * Verify OTP for forgot password
 * @param {string} emailOrMobile - Email address or mobile number
 * @param {string} otp - OTP code
 * @returns {Promise<Object>} Result with verified token for password reset
 */
const verifyForgotPasswordOTP = async (emailOrMobile, otp) => {
  const result = await verifyOTP(emailOrMobile, otp, 'forgot-password');

  return {
    verified: true,
    verificationToken: result.verificationToken,
    message: 'OTP verified successfully. You can now set your new password.',
    identifier: result.storedData.identifier,
    isEmail: result.storedData.isEmail,
    userId: result.storedData.userId,
    userType: result.storedData.userType,
  };
};

/**
 * Get signup data by token only
 * @param {string} signupToken - Signup token from verify-signup-otp
 * @returns {Promise<Object>} Signup data with storeKey
 */
const getSignupDataByToken = async (signupToken) => {
  const hashedSignupToken = crypto.createHash('sha256').update(signupToken).digest('hex');

  const found = await otpStore.getByField('signupToken', hashedSignupToken);
  if (found) {
    const { key: storeKey, value: storedData } = found;
    if (Date.now() > storedData.signupTokenExpire) {
      await otpStore.delete(storeKey);
      throw new Error('Signup session has expired. Please start the signup process again.');
    }

    if (!storedData.verified) {
      throw new Error('OTP not verified. Please verify OTP first.');
    }

    return {
      userType: storedData.userType,
      identifier: storedData.identifier,
      isEmail: storedData.isEmail,
      storeKey,
    };
  }

  throw new Error('Invalid signup token or session expired. Please verify OTP again.');
};

/**
 * Get signup data by token
 * @param {string} emailOrMobile - Email address or mobile number (optional)
 * @param {string} signupToken - Signup token from verify-signup-otp
 * @returns {Promise<Object>} Signup data
 */
const getSignupData = async (emailOrMobile, signupToken) => {
  if (!emailOrMobile) {
    return await getSignupDataByToken(signupToken);
  }

  const { normalizedIdentifier, isEmail } = normalizeIdentifier(emailOrMobile);
  const storeKey = getStoreKey(normalizedIdentifier, isEmail);
  const storedData = await otpStore.get(storeKey);

  if (!storedData) {
    throw new Error('Signup session not found or expired. Please start the signup process again.');
  }

  const hashedSignupToken = crypto.createHash('sha256').update(signupToken).digest('hex');
  if (storedData.signupToken !== hashedSignupToken) {
    throw new Error('Invalid signup token');
  }

  if (Date.now() > storedData.signupTokenExpire) {
    await otpStore.delete(storeKey);
    throw new Error('Signup session has expired. Please start the signup process again.');
  }

  if (!storedData.verified) {
    throw new Error('OTP not verified. Please verify OTP first.');
  }

  return {
    userType: storedData.userType,
    identifier: storedData.identifier,
    isEmail: storedData.isEmail,
  };
};

/**
 * Get forgot password data by token only
 * @param {string} verificationToken - Verification token from verify-forgot-password-otp
 * @returns {Promise<Object>} Forgot password data with storeKey
 */
const getForgotPasswordDataByToken = async (verificationToken) => {
  const hashedVerificationToken = crypto.createHash('sha256').update(verificationToken).digest('hex');

  const found = await otpStore.getByField('verificationToken', hashedVerificationToken, 'forgot-password:');
  if (found) {
    const { key: storeKey, value: storedData } = found;
    if (Date.now() > storedData.verificationTokenExpire) {
      await otpStore.delete(storeKey);
      throw new Error('Verification token has expired. Please start the password reset process again.');
    }

    if (!storedData.verified) {
      throw new Error('OTP not verified. Please verify OTP first.');
    }

    return {
      identifier: storedData.identifier,
      isEmail: storedData.isEmail,
      userId: storedData.userId,
      userMongoId: storedData.userMongoId,
      userType: storedData.userType,
      storeKey,
    };
  }

  throw new Error('Invalid verification token or session expired. Please verify OTP again.');
};

/**
 * Get forgot password data by token
 * @param {string} emailOrMobile - Email address or mobile number
 * @param {string} verificationToken - Verification token from verify-forgot-password-otp
 * @returns {Promise<Object>} Forgot password data
 */
const getForgotPasswordData = async (emailOrMobile, verificationToken) => {
  if (!emailOrMobile) {
    return await getForgotPasswordDataByToken(verificationToken);
  }

  const { normalizedIdentifier, isEmail } = normalizeIdentifier(emailOrMobile);
  const storeKey = getStoreKey(normalizedIdentifier, isEmail, 'forgot-password');
  const storedData = await otpStore.get(storeKey);

  if (!storedData) {
    throw new Error('Password reset session not found or expired. Please start the password reset process again.');
  }

  const hashedVerificationToken = crypto.createHash('sha256').update(verificationToken).digest('hex');
  if (storedData.verificationToken !== hashedVerificationToken) {
    throw new Error('Invalid verification token');
  }

  if (Date.now() > storedData.verificationTokenExpire) {
    await otpStore.delete(storeKey);
    throw new Error('Verification token has expired. Please start the password reset process again.');
  }

  if (!storedData.verified) {
    throw new Error('OTP not verified. Please verify OTP first.');
  }

  return {
    identifier: storedData.identifier,
    isEmail: storedData.isEmail,
    userId: storedData.userId,
    userMongoId: storedData.userMongoId,
    userType: storedData.userType,
  };
};

/**
 * Set new password after OTP verification
 * @param {string} verificationToken - Verification token from verify-forgot-password-otp
 * @param {string} newPassword - New password to set
 * @returns {Promise<Object>} User data and auth token
 */
const setNewPassword = async (verificationToken, newPassword) => {
  // Get forgot password data by token only (identifier retrieved from backend)
  const forgotPasswordData = await getForgotPasswordDataByToken(verificationToken);

  // Find user by identifier
  let user;
  if (forgotPasswordData.isEmail) {
    user = await User.findByEmail(forgotPasswordData.identifier);
  } else {
    user = await User.findByMobileNumber(forgotPasswordData.identifier);
  }

  if (!user) {
    throw new Error('User not found');
  }

  // Update password
  await User.updateById(user._id, {
    password: newPassword,
  });

  // Cleanup forgot password data using the storeKey
  await otpStore.delete(forgotPasswordData.storeKey);

  // Generate new token for automatic login
  const jwt = require('jsonwebtoken');
  const mongoUserId = user._id.toString();
  const authToken = jwt.sign({ userId: mongoUserId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });

  // Prepare user response based on type
  const userResponse = {
    id: user.userId,
    userId: user.userId,
    mongoId: mongoUserId,
    userType: user.userType,
    email: user.email,
    mobileNumber: user.mobileNumber,
    profilePic: user.profilePic || null, // Always include profilePic field
    isMobileVerified: user.isMobileVerified,
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

  userResponse.followingCount = user.followingCount || 0;

  const statsMap = await getBookingStatsByUsers([user._id]);
  const stats = statsMap.get(user._id.toString()) || { bookedCount: 0, totalSpent: 0 };
  userResponse.totalBookedEvents = stats.bookedCount;
  userResponse.totalBookingAmount = stats.totalSpent;

  return {
    user: userResponse,
    token: authToken,
  };
};

/**
 * Cleanup forgot password data after successful password reset
 * @param {string} emailOrMobile - Email address or mobile number
 */
const cleanupForgotPasswordData = async (emailOrMobile) => {
  const { normalizedIdentifier, isEmail } = normalizeIdentifier(emailOrMobile);
  const storeKey = getStoreKey(normalizedIdentifier, isEmail, 'forgot-password');
  await otpStore.delete(storeKey);
};

/**
 * Cleanup signup data after successful signup
 * @param {string} emailOrMobile - Email address or mobile number
 */
const cleanupSignupData = async (emailOrMobile) => {
  const { normalizedIdentifier, isEmail } = normalizeIdentifier(emailOrMobile);
  const storeKey = getStoreKey(normalizedIdentifier, isEmail);
  await otpStore.delete(storeKey);
};

module.exports = {
  sendSignupOTP,
  verifySignupOTP,
  getSignupData,
  getSignupDataByToken,
  cleanupSignupData,
  normalizeMobileNumber,
  // Forgot password functions
  sendForgotPasswordOTP,
  verifyForgotPasswordOTP,
  getForgotPasswordData,
  getForgotPasswordDataByToken,
  setNewPassword,
  cleanupForgotPasswordData,
};
