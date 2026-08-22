/**
 * updatePushToken.controller.js
 *
 * PATCH /api/users/me/push-token
 *
 * Saves (or clears) the FCM device token for the authenticated user.
 * The client should call this:
 *   - On app launch after login, with the current token.
 *   - On logout, with { fcmToken: null } to deregister.
 *   - When FCM issues a token refresh via onTokenRefresh callback.
 */

const User = require('../../models/User');

/**
 * @desc    Save or clear FCM push token for current user
 * @route   PATCH /api/users/me/push-token
 * @access  Private
 */
const updatePushToken = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Accept either { fcmToken: "..." } or { fcmToken: null } to deregister
    const { fcmToken } = req.body;

    if (fcmToken !== null && fcmToken !== undefined && typeof fcmToken !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'fcmToken must be a string or null',
      });
    }

    const tokenValue = (typeof fcmToken === 'string' && fcmToken.trim() !== '')
      ? fcmToken.trim()
      : null;

    await User.updateById(userId, { fcmToken: tokenValue });

    console.log(`📱 [PUSH-TOKEN] User ${userId} token ${tokenValue ? 'registered' : 'cleared'}`);

    return res.status(200).json({
      success: true,
      message: tokenValue ? 'Push token registered' : 'Push token cleared',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { updatePushToken };
