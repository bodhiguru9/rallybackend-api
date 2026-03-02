const axios = require('axios');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const Token = require('../models/Token');
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
 * Verify Google OAuth Token
 */
const verifyGoogleToken = async (idToken) => {
  try {
    const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    const GOOGLE_PROJECT_ID = process.env.GOOGLE_PROJECT_ID;
    const GOOGLE_AUTH_URL = process.env.GOOGLE_AUTH_URL;
    const GOOGLE_TOKEN_URL = process.env.GOOGLE_TOKEN_URL;
    const GOOGLE_AUTH_PROVIDER_X509_CERT_URL = process.env.GOOGLE_AUTH_PROVIDER_X509_CERT_URL;

    if (!GOOGLE_CLIENT_ID) {
      console.warn('GOOGLE_CLIENT_ID not set. Token audience will not be verified.');
    }
    if (!GOOGLE_PROJECT_ID || !GOOGLE_AUTH_URL || !GOOGLE_TOKEN_URL || !GOOGLE_AUTH_PROVIDER_X509_CERT_URL) {
      console.warn('Google OAuth env vars missing: GOOGLE_PROJECT_ID/GOOGLE_AUTH_URL/GOOGLE_TOKEN_URL/GOOGLE_AUTH_PROVIDER_X509_CERT_URL');
    }

    const response = await axios.get(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=${idToken}`
    );

    if (response.data && response.data.sub) {
      if (GOOGLE_CLIENT_ID && response.data.aud && response.data.aud !== GOOGLE_CLIENT_ID) {
        return { success: false, error: 'Google token audience mismatch' };
      }
      return {
        success: true,
        data: {
          providerId: response.data.sub,
          email: response.data.email,
          emailVerified: response.data.email_verified === 'true',
          name: response.data.name,
          picture: response.data.picture,
          givenName: response.data.given_name,
          familyName: response.data.family_name,
        },
      };
    }

    return { success: false, error: 'Invalid Google token' };
  } catch (error) {
    console.error('Google token verification error:', error.message);
    return { success: false, error: 'Failed to verify Google token' };
  }
};

/**
 * Verify Facebook OAuth Token
 */
const verifyFacebookToken = async (accessToken) => {
  try {
    const FACEBOOK_ID = process.env.FACEBOOK_ID;
    const FACEBOOK_KEY = process.env.FACEBOOK_KEY;

    if (!FACEBOOK_ID || !FACEBOOK_KEY) {
      console.warn('FACEBOOK_ID or FACEBOOK_KEY not set in environment variables. Proceeding with basic token verification.');
    }

    // First, verify the token and get app_id using debug_token endpoint
    let appId = null;
    if (FACEBOOK_ID && FACEBOOK_KEY) {
      try {
        const debugResponse = await axios.get(
          `https://graph.facebook.com/debug_token?input_token=${accessToken}&access_token=${FACEBOOK_ID}|${FACEBOOK_KEY}`
        );

        if (debugResponse.data && debugResponse.data.data) {
          const tokenData = debugResponse.data.data;
          
          // Verify the token is valid
          if (!tokenData.is_valid) {
            return { success: false, error: 'Invalid Facebook token' };
          }

          // Verify the app_id matches our FACEBOOK_ID
          if (tokenData.app_id !== FACEBOOK_ID) {
            return { success: false, error: 'Token does not belong to this application' };
          }

          appId = tokenData.app_id;
        }
      } catch (debugError) {
        console.error('Facebook debug token error:', debugError.message);
        // Continue with basic verification if debug fails
      }
    }

    // Get user information
    const response = await axios.get(
      `https://graph.facebook.com/me?fields=id,name,email,picture&access_token=${accessToken}`
    );

    if (response.data && response.data.id) {
      return {
        success: true,
        data: {
          providerId: response.data.id,
          email: response.data.email || null,
          emailVerified: !!response.data.email,
          name: response.data.name,
          picture: response.data.picture?.data?.url || null,
        },
      };
    }

    return { success: false, error: 'Invalid Facebook token' };
  } catch (error) {
    console.error('Facebook token verification error:', error.message);
    
    // Provide more specific error messages
    if (error.response && error.response.data) {
      const fbError = error.response.data.error;
      if (fbError) {
        return { success: false, error: fbError.message || 'Failed to verify Facebook token' };
      }
    }
    
    return { success: false, error: 'Failed to verify Facebook token' };
  }
};

/**
 * Verify Apple OAuth Token
 * Note: Apple uses JWT tokens that need to be verified with Apple's public keys
 * This is a simplified version - for production, you should fetch Apple's public keys
 */
const verifyAppleToken = async (idToken) => {
  try {
    // Decode the token without verification first to get the header
    const decoded = jwt.decode(idToken, { complete: true });

    if (!decoded || !decoded.payload) {
      return { success: false, error: 'Invalid Apple token format' };
    }

    const payload = decoded.payload;

    // Verify the token is from Apple
    if (payload.iss !== 'https://appleid.apple.com') {
      return { success: false, error: 'Invalid Apple token issuer' };
    }

    // For production, you should verify the signature using Apple's public keys
    // For now, we'll trust the token if it has the required fields
    if (payload.sub) {
      return {
        success: true,
        data: {
          providerId: payload.sub,
          email: payload.email || null,
          emailVerified: payload.email_verified === true || !!payload.email,
          name: payload.name || null, // Apple may provide name on first sign-in only
        },
      };
    }

    return { success: false, error: 'Invalid Apple token' };
  } catch (error) {
    console.error('Apple token verification error:', error.message);
    return { success: false, error: 'Failed to verify Apple token' };
  }
};

/**
 * OAuth Signup/Login - handles both signup and login
 */
const oauthSignupLogin = async (provider, token, userData = {}) => {
  let verificationResult;

  // Verify token based on provider
  switch (provider.toLowerCase()) {
    case 'google':
      verificationResult = await verifyGoogleToken(token);
      break;
    case 'facebook':
      verificationResult = await verifyFacebookToken(token);
      break;
    case 'apple':
      verificationResult = await verifyAppleToken(token);
      break;
    default:
      throw new Error('Invalid OAuth provider. Supported: google, facebook, apple');
  }

  if (!verificationResult.success) {
    throw new Error(verificationResult.error || 'Token verification failed');
  }

  const oauthData = verificationResult.data;
  const providerId = `${provider.toLowerCase()}_${oauthData.providerId}`;

  // Check if user already exists by email or provider ID
  let user = null;
  
  if (oauthData.email) {
    user = await User.findByEmail(oauthData.email);
  }

  // If user exists, check if they have this provider linked
  if (user) {
    // Check if user has OAuth provider linked
    const existingProvider = user.oauthProviders?.find(
      (p) => p.provider === provider.toLowerCase() && p.providerId === oauthData.providerId
    );

    if (!existingProvider) {
      // Link this provider to existing account
      const oauthProviders = user.oauthProviders || [];
      oauthProviders.push({
        provider: provider.toLowerCase(),
        providerId: oauthData.providerId,
        email: oauthData.email,
        linkedAt: new Date(),
      });

      await User.updateById(user._id, { oauthProviders });
    }

    // Generate tokens for existing user
    const mongoUserId = user._id.toString();
    const { accessToken: authToken, refreshToken } = await generateTokens(mongoUserId);

    const userResponse = formatUserResponse(user);
    await addBookingStatsToResponse(user, userResponse);
    return {
      isNewUser: false,
      user: userResponse,
      token: authToken,
      refreshToken,
      message: 'Login successful',
    };
  }

  // New user - create account
  // Validate user type
  if (!userData.userType || !['player', 'organiser'].includes(userData.userType)) {
    throw new Error('User type is required and must be "player" or "organiser"');
  }

  // Prepare user data
  const createData = {
    userType: userData.userType,
    email: oauthData.email ? oauthData.email.toLowerCase() : null,
    mobileNumber: userData.mobileNumber || null,
    password: crypto.randomBytes(32).toString('hex'), // Random password for OAuth users
    profilePic: oauthData.picture || userData.profilePic || null,
    isEmailVerified: oauthData.emailVerified || false,
    isMobileVerified: false,
    oauthProviders: [
      {
        provider: provider.toLowerCase(),
        providerId: oauthData.providerId,
        email: oauthData.email,
        linkedAt: new Date(),
      },
    ],
  };

  // Add type-specific fields
  if (userData.userType === 'player') {
    createData.fullName = userData.fullName || oauthData.name || 'User';
    createData.dob = userData.dob ? new Date(userData.dob) : null;
    createData.gender = userData.gender ? userData.gender.toLowerCase() : null;
    // For OAuth, sports can be optional - user can update later
    createData.sport1 = userData.sport1 ? userData.sport1.trim() : 'General';
    createData.sport2 = userData.sport2 ? userData.sport2.trim() : 'General';
    createData.sports = userData.sport1 && userData.sport2
      ? [userData.sport1.trim(), userData.sport2.trim()]
      : ['General', 'General'];
  } else if (userData.userType === 'organiser') {
    createData.fullName = userData.fullName || oauthData.name || 'User';
    createData.yourBest = userData.yourBest ? userData.yourBest.toLowerCase() : 'organiser';
    createData.communityName = userData.communityName ? userData.communityName.trim() : oauthData.name || 'Community';
    createData.yourCity = userData.yourCity ? userData.yourCity.trim() : null;
    // For OAuth, sports can be optional - user can update later
    createData.sport1 = userData.sport1 ? userData.sport1.trim() : 'General';
    createData.sport2 = userData.sport2 ? userData.sport2.trim() : 'General';
    createData.sports = userData.sport1 && userData.sport2
      ? [userData.sport1.trim(), userData.sport2.trim()]
      : ['General', 'General'];
    createData.bio = userData.bio ? userData.bio.trim() : null;
    createData.instagramLink = userData.instagramLink ? userData.instagramLink.trim() : null;
    createData.profileVisibility = userData.profileVisibility
      ? userData.profileVisibility.toLowerCase()
      : 'private';
  }

  // Create user
  const newUser = await User.create(createData);

  // Generate tokens
  const mongoUserId = newUser._id.toString();
  const { accessToken: authToken, refreshToken } = await generateTokens(mongoUserId);

  const newUserResponse = formatUserResponse(newUser);
  await addBookingStatsToResponse(newUser, newUserResponse);
  return {
    isNewUser: true,
    user: newUserResponse,
    token: authToken,
    refreshToken,
    message: 'Account created and logged in successfully',
  };
};

/**
 * Format user response based on user type
 */
const formatUserResponse = (user) => {
  const userResponse = {
    id: user.userId,
    userId: user.userId,
    mongoId: user._id.toString(),
    userType: user.userType,
    email: user.email,
    mobileNumber: user.mobileNumber,
    profilePic: user.profilePic || null, // Always include profilePic field
    isEmailVerified: user.isEmailVerified,
    isMobileVerified: user.isMobileVerified,
  };

  // Add type-specific fields
  if (user.userType === 'player') {
    userResponse.fullName = user.fullName;
    userResponse.dob = user.dob;
    userResponse.gender = user.gender;
    userResponse.sport1 = user.sport1;
    userResponse.sport2 = user.sport2;
    userResponse.sports = user.sports || [];
    userResponse.followingCount = user.followingCount || 0;
  } else if (user.userType === 'organiser') {
    userResponse.fullName = user.fullName;
    userResponse.yourBest = user.yourBest;
    userResponse.communityName = user.communityName;
    userResponse.yourCity = user.yourCity;
    userResponse.sport1 = user.sport1;
    userResponse.sport2 = user.sport2;
    userResponse.sports = user.sports || [];
    userResponse.bio = user.bio;
    userResponse.instagramLink = user.instagramLink || null;
    userResponse.profileVisibility = user.profileVisibility || 'private';
    userResponse.followersCount = user.followersCount || 0;
    userResponse.eventsCreated = user.eventsCreated || 0;
    userResponse.totalAttendees = user.totalAttendees || 0;
    userResponse.followingCount = user.followingCount || 0;
  }

  return userResponse;
};

module.exports = {
  verifyGoogleToken,
  verifyFacebookToken,
  verifyAppleToken,
  oauthSignupLogin,
};

