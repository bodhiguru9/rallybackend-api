const oauthService = require('../../services/oauth.service');

/**
 * @desc    OAuth Signup/Login with Google
 * @route   POST /api/auth/oauth/google
 * @access  Public
 */
const googleOAuth = async (req, res, next) => {
  try {
    const { idToken, userType, ...additionalData } = req.body;

    if (!idToken) {
      return res.status(400).json({
        success: false,
        error: 'Google ID token is required',
      });
    }

    const result = await oauthService.oauthSignupLogin('google', idToken, {
      userType,
      ...additionalData,
    });

    res.status(result.isNewUser ? 201 : 200).json({
      success: true,
      message: result.message,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    OAuth Signup/Login with Facebook
 * @route   POST /api/auth/oauth/facebook
 * @access  Public
 */
const facebookOAuth = async (req, res, next) => {
  try {
    const { accessToken, userType, ...additionalData } = req.body;

    if (!accessToken) {
      return res.status(400).json({
        success: false,
        error: 'Facebook access token is required',
      });
    }

    const result = await oauthService.oauthSignupLogin('facebook', accessToken, {
      userType,
      ...additionalData,
    });

    res.status(result.isNewUser ? 201 : 200).json({
      success: true,
      message: result.message,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    OAuth Signup/Login with Apple
 * @route   POST /api/auth/oauth/apple
 * @access  Public
 */
const appleOAuth = async (req, res, next) => {
  try {
    const { idToken, userType, ...additionalData } = req.body;

    if (!idToken) {
      return res.status(400).json({
        success: false,
        error: 'Apple ID token is required',
      });
    }

    const result = await oauthService.oauthSignupLogin('apple', idToken, {
      userType,
      ...additionalData,
    });

    res.status(result.isNewUser ? 201 : 200).json({
      success: true,
      message: result.message,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  googleOAuth,
  facebookOAuth,
  appleOAuth,
};

