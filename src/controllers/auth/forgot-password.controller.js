const signupOTPService = require('../../services/signup-otp.service');
const {
  validateForgotPassword,
  validateVerifyForgotPasswordOTP,
  validateSetNewPassword,
} = require('../../validators/auth.validator');

/**
 * @desc    Forgot password - send OTP via email or WhatsApp
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
const forgotPassword = async (req, res, next) => {
  try {
    // Validate input
    const validation = validateForgotPassword(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: validation.errors,
      });
    }

    const { email, mobileNumber } = req.body;

    // Ensure only one identifier is provided
    if (email && mobileNumber) {
      return res.status(400).json({
        success: false,
        error: 'Please provide either email OR mobileNumber, not both',
      });
    }

    if (!email && !mobileNumber) {
      return res.status(400).json({
        success: false,
        error: 'Either email or mobileNumber is required',
      });
    }

    // Use email or mobile number
    const emailOrMobile = email || mobileNumber;

    // Send password reset OTP
    const result = await signupOTPService.sendForgotPasswordOTP(emailOrMobile);

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Verify OTP for forgot password
 * @route   POST /api/auth/verify-forgot-password-otp
 * @access  Public
 */
const verifyForgotPasswordOTP = async (req, res, next) => {
  try {
    // Validate input
    const validation = validateVerifyForgotPasswordOTP(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: validation.errors,
      });
    }

    const { email, mobileNumber, otp } = req.body;

    // Ensure only one identifier is provided
    if (email && mobileNumber) {
      return res.status(400).json({
        success: false,
        error: 'Please provide either email OR mobileNumber, not both',
      });
    }

    if (!email && !mobileNumber) {
      return res.status(400).json({
        success: false,
        error: 'Either email or mobileNumber is required',
      });
    }

    // Use email or mobile number
    const emailOrMobile = email || mobileNumber;

    // Verify OTP
    const result = await signupOTPService.verifyForgotPasswordOTP(emailOrMobile, otp);

    res.status(200).json({
      success: true,
      message: result.message,
      data: {
        verified: result.verified,
        verificationToken: result.verificationToken,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Set new password after OTP verification
 * @route   POST /api/auth/set-new-password
 * @access  Public
 */
const setNewPassword = async (req, res, next) => {
  try {
    // Validate input
    const validation = validateSetNewPassword(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: validation.errors,
      });
    }

    const { verificationToken, password } = req.body;

    // Set new password with verification token (identifier retrieved from backend)
    const result = await signupOTPService.setNewPassword(verificationToken, password);

    res.status(200).json({
      success: true,
      message: 'Password reset successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  forgotPassword,
  verifyForgotPasswordOTP,
  setNewPassword,
};
