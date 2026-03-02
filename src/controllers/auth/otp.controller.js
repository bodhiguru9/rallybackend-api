const authService = require('../../services/auth.service');
const {
  validateVerifyOTP,
  validateResendOTP,
} = require('../../validators/otp.validator');

/**
 * @desc    Verify OTP for mobile number verification
 * @route   POST /api/auth/verify-otp
 * @access  Public
 */
const verifyOTP = async (req, res, next) => {
  try {
    // Validate input
    const validation = validateVerifyOTP(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: validation.errors,
      });
    }

    const { mobileNumber, otp } = req.body;

    // Verify OTP
    const result = await authService.verifyOTP(mobileNumber, otp);

    res.status(200).json({
      success: true,
      message: result.message,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Resend OTP to mobile number
 * @route   POST /api/auth/resend-otp
 * @access  Public
 */
const resendOTP = async (req, res, next) => {
  try {
    // Validate input
    const validation = validateResendOTP(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: validation.errors,
      });
    }

    const { mobileNumber } = req.body;

    // Resend OTP
    const result = await authService.resendOTP(mobileNumber);

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  verifyOTP,
  resendOTP,
};

