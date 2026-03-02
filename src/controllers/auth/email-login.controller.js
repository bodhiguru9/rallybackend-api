const authService = require('../../services/auth.service');
const { validateEmail } = require('../../validators/auth.validator');

/**
 * @desc    Email login - authenticate with email and password
 * @route   POST /api/auth/email-login
 * @access  Public
 */
const emailLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Validate email
    if (!email || !validateEmail(email)) {
      return res.status(400).json({
        success: false,
        error: 'Valid email is required',
      });
    }

    // Validate password
    if (!password) {
      return res.status(400).json({
        success: false,
        error: 'Password is required',
      });
    }

    // Authenticate user with email
    const result = await authService.signin(email, password);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { emailLogin };

