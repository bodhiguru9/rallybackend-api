const authService = require('../../services/auth.service');
const { validateSignin } = require('../../validators/auth.validator');

/**
 * @desc    Authenticate user with email/mobile and password
 * @route   POST /api/auth/signin
 * @access  Public
 */
const signin = async (req, res, next) => {
  try {
    // Validate input
    const validation = validateSignin(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: validation.errors,
      });
    }

    const { email, mobileNumber, password } = req.body;

    // Use email or mobile number for authentication
    const emailOrMobile = email || mobileNumber;

    // Authenticate user
    const result = await authService.signin(emailOrMobile, password);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { signin };

