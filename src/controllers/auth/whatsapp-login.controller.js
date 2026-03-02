const authService = require('../../services/auth.service');
const { validateMobileNumber } = require('../../validators/auth.validator');
const { validateVerifyOTP } = require('../../validators/otp.validator');

/**
 * @desc    WhatsApp login - send OTP for login
 * @route   POST /api/auth/whatsapp-login
 * @access  Public
 */
const whatsappLogin = async (req, res, next) => {
  try {
    const { mobileNumber } = req.body;

    if (!mobileNumber || !validateMobileNumber(mobileNumber)) {
      return res.status(400).json({
        success: false,
        error: 'Valid mobile number is required',
      });
    }

    // Send WhatsApp OTP for login
    const result = await authService.whatsappLogin(mobileNumber);

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Verify WhatsApp login OTP
 * @route   POST /api/auth/verify-whatsapp-login
 * @access  Public
 */
const verifyWhatsAppLogin = async (req, res, next) => {
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

    // Verify WhatsApp login OTP
    const result = await authService.verifyWhatsAppLogin(mobileNumber, otp);

    res.status(200).json({
      success: true,
      message: result.message,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  whatsappLogin,
  verifyWhatsAppLogin,
};

