const signupOTPService = require('../../services/signup-otp.service');
const { validateSendSignupOTP, validateVerifySignupOTP } = require('../../validators/signup-otp.validator');

/**
 * @desc    Send OTP for signup (via email or mobile number)
 * @route   POST /api/auth/send-signup-otp
 * @access  Public
 */
const sendSignupOTP = async (req, res, next) => {
  try {
    // Validate input
    const validation = validateSendSignupOTP(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: validation.errors,
      });
    }

    const { email, mobileNumber, userType } = req.body;

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

    const emailOrMobile = email || mobileNumber;

    // Send OTP
    const result = await signupOTPService.sendSignupOTP(emailOrMobile, userType);

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Verify OTP for signup
 * @route   POST /api/auth/verify-signup-otp
 * @access  Public
 */
const verifySignupOTP = async (req, res, next) => {
  try {
    // Validate input
    const validation = validateVerifySignupOTP(req.body);
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

    const emailOrMobile = email || mobileNumber;

    // Verify OTP
    const result = await signupOTPService.verifySignupOTP(emailOrMobile, otp);

    res.status(200).json({
      success: true,
      message: 'OTP verified successfully. Please complete your signup by providing your details.',
      data: {
        signupToken: result.signupToken, // Use this in /api/auth/signup endpoint
        userType: result.userType,
        verifiedEmail: result.isEmail ? result.identifier : null,
        verifiedMobile: result.isEmail ? null : result.identifier,
        nextStep: 'Complete signup by calling POST /api/auth/signup with signupToken and all required fields',
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  sendSignupOTP,
  verifySignupOTP,
};

