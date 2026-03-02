const authService = require('../../services/auth.service');
const { protect } = require('../../middleware/auth');

/**
 * @desc    Logout user - remove refresh token
 * @route   POST /api/auth/logout
 * @access  Public (works for both player and organiser, only requires refresh token)
 */
const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'Refresh token is required',
      });
    }

    // Remove the refresh token
    const result = await authService.logout(refreshToken);

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Logout from all devices - remove all refresh tokens for user
 * @route   POST /api/auth/logout-all
 * @access  Private (works for both player and organiser)
 */
const logoutAll = async (req, res, next) => {
  try {
    // Get user ID from request (set by protect middleware)
    const userId = req.user.id;

    // Remove all refresh tokens for the user
    const result = await authService.logoutAll(userId);

    res.status(200).json({
      success: true,
      message: result.message,
      data: {
        devicesLoggedOut: result.devicesLoggedOut,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { logout, logoutAll };
