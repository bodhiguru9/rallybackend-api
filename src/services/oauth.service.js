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

const parseList = (...values) =>
  values
    .filter(Boolean)
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter(Boolean);

/**
 * Verify Google OAuth ID token.
 * Allowed audiences: GOOGLE_CLIENT_IDS (comma-separated) + GOOGLE_CLIENT_ID.
 * With the native Google Sign-In SDK the token audience is the *Web* client ID.
 */
const verifyGoogleToken = async (idToken) => {
  try {
    const allowedAudiences = parseList(process.env.GOOGLE_CLIENT_IDS, process.env.GOOGLE_CLIENT_ID);
    if (allowedAudiences.length === 0) {
      console.error('Google OAuth: GOOGLE_CLIENT_ID(S) not set; refusing to accept tokens.');
      return { success: false, error: 'Google sign-in is not configured' };
    }

    // tokeninfo validates signature and expiry for us
    const response = await axios.get('https://oauth2.googleapis.com/tokeninfo', {
      params: { id_token: idToken },
    });
    const data = response.data || {};

    if (!['accounts.google.com', 'https://accounts.google.com'].includes(data.iss)) {
      return { success: false, error: 'Invalid Google token issuer' };
    }
    if (!allowedAudiences.includes(data.aud)) {
      console.warn('Google OAuth audience mismatch:', data.aud);
      return { success: false, error: 'Google token audience mismatch' };
    }
    if (!data.sub) {
      return { success: false, error: 'Invalid Google token' };
    }

    return {
      success: true,
      data: {
        providerId: data.sub,
        email: data.email || null,
        emailVerified: data.email_verified === 'true' || data.email_verified === true,
        name: data.name,
        picture: data.picture,
        givenName: data.given_name,
        familyName: data.family_name,
      },
    };
  } catch (error) {
    console.error('Google token verification error:', error.response?.data || error.message);
    return { success: false, error: 'Failed to verify Google token' };
  }
};

/**
 * Resolve Facebook app credentials.
 * Preferred: FACEBOOK_APP_ID + FACEBOOK_APP_SECRET.
 * Legacy FACEBOOK_ID / FACEBOOK_KEY are still accepted; the all-digits value is treated as
 * the app ID because the two were stored swapped in some environments.
 */
const getFacebookCredentials = () => {
  if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
    return { appId: process.env.FACEBOOK_APP_ID, appSecret: process.env.FACEBOOK_APP_SECRET };
  }
  const a = process.env.FACEBOOK_ID;
  const b = process.env.FACEBOOK_KEY;
  if (!a || !b) return null;
  const isNumeric = (v) => /^\d+$/.test(v);
  if (isNumeric(b) && !isNumeric(a)) return { appId: b, appSecret: a };
  return { appId: a, appSecret: b };
};

/**
 * Verify Facebook user access token (must have been issued to our app)
 */
const verifyFacebookToken = async (accessToken) => {
  try {
    const creds = getFacebookCredentials();
    if (!creds) {
      console.error('Facebook OAuth: FACEBOOK_APP_ID / FACEBOOK_APP_SECRET not set; refusing to accept tokens.');
      return { success: false, error: 'Facebook sign-in is not configured' };
    }

    const debugResponse = await axios.get('https://graph.facebook.com/debug_token', {
      params: { input_token: accessToken, access_token: `${creds.appId}|${creds.appSecret}` },
    });
    const tokenData = debugResponse.data?.data;
    if (!tokenData || !tokenData.is_valid) {
      return { success: false, error: 'Invalid Facebook token' };
    }
    if (String(tokenData.app_id) !== String(creds.appId)) {
      return { success: false, error: 'Token does not belong to this application' };
    }

    const appsecretProof = crypto
      .createHmac('sha256', creds.appSecret)
      .update(accessToken)
      .digest('hex');
    const response = await axios.get('https://graph.facebook.com/me', {
      params: {
        fields: 'id,name,email,picture.type(large)',
        access_token: accessToken,
        appsecret_proof: appsecretProof,
      },
    });

    if (response.data && response.data.id && response.data.id === String(tokenData.user_id)) {
      return {
        success: true,
        data: {
          providerId: response.data.id,
          email: response.data.email || null,
          // Graph API only returns confirmed emails
          emailVerified: !!response.data.email,
          name: response.data.name,
          picture: response.data.picture?.data?.url || null,
        },
      };
    }

    return { success: false, error: 'Invalid Facebook token' };
  } catch (error) {
    const fbError = error.response?.data?.error;
    console.error('Facebook token verification error:', fbError || error.message);
    return { success: false, error: fbError?.message || 'Failed to verify Facebook token' };
  }
};

// Apple signing keys (JWKS), cached in memory
const APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';
const APPLE_KEYS_TTL_MS = 60 * 60 * 1000;
let appleKeysCache = { keys: null, fetchedAt: 0 };

const getApplePublicKey = async (kid) => {
  const isFresh = appleKeysCache.keys && Date.now() - appleKeysCache.fetchedAt < APPLE_KEYS_TTL_MS;
  let jwk = isFresh ? appleKeysCache.keys.find((k) => k.kid === kid) : null;
  if (!jwk) {
    // Refetch on cache miss too, so key rotation is picked up
    const { data } = await axios.get(APPLE_KEYS_URL);
    appleKeysCache = { keys: data.keys || [], fetchedAt: Date.now() };
    jwk = appleKeysCache.keys.find((k) => k.kid === kid);
  }
  if (!jwk) return null;
  return crypto.createPublicKey({ key: jwk, format: 'jwk' });
};

/**
 * Verify Sign in with Apple identity token (signature, issuer, audience, expiry, nonce).
 * Allowed audiences: APPLE_CLIENT_IDS (comma-separated), default is the iOS bundle id.
 */
const verifyAppleToken = async (idToken, rawNonce) => {
  try {
    const decoded = jwt.decode(idToken, { complete: true });
    if (!decoded || !decoded.header?.kid) {
      return { success: false, error: 'Invalid Apple token format' };
    }

    const publicKey = await getApplePublicKey(decoded.header.kid);
    if (!publicKey) {
      return { success: false, error: 'Unknown Apple signing key' };
    }

    const audiences = parseList(process.env.APPLE_CLIENT_IDS || 'com.rallysports.app');
    const payload = jwt.verify(idToken, publicKey, {
      algorithms: ['RS256'],
      issuer: 'https://appleid.apple.com',
      audience: audiences,
    });

    if (payload.nonce) {
      if (!rawNonce) {
        return { success: false, error: 'Missing Apple nonce' };
      }
      const hashed = crypto.createHash('sha256').update(rawNonce).digest('hex');
      if (hashed !== payload.nonce) {
        return { success: false, error: 'Apple nonce mismatch' };
      }
    }

    if (!payload.sub) {
      return { success: false, error: 'Invalid Apple token' };
    }

    return {
      success: true,
      data: {
        providerId: payload.sub,
        email: payload.email || null,
        // Apple emails (including private relay addresses) are verified by Apple
        emailVerified: payload.email_verified === true || payload.email_verified === 'true',
        name: null, // Apple never puts the name in the token; the app sends it on first sign-in
      },
    };
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
      verificationResult = await verifyAppleToken(token, userData.nonce);
      break;
    default:
      throw new Error('Invalid OAuth provider. Supported: google, facebook, apple');
  }

  if (!verificationResult.success) {
    throw new Error(verificationResult.error || 'Token verification failed');
  }

  const oauthData = verificationResult.data;
  const providerId = `${provider.toLowerCase()}_${oauthData.providerId}`;

  // Look up by linked provider account first (Apple omits email after the first sign-in),
  // then fall back to linking by *verified* email only.
  let user = await User.findByOAuthProvider(provider.toLowerCase(), oauthData.providerId);

  if (!user && oauthData.email && oauthData.emailVerified) {
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

