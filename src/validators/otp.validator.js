const { validateMobileNumber } = require('./auth.validator');

/**
 * Validate OTP verification data
 */
const validateVerifyOTP = (data) => {
  const errors = [];

  if (!data.mobileNumber) {
    errors.push('Mobile number is required');
  } else if (!validateMobileNumber(data.mobileNumber)) {
    errors.push('Valid mobile number is required');
  }

  if (!data.otp) {
    errors.push('OTP is required');
  } else if (!/^\d{6}$/.test(data.otp)) {
    errors.push('OTP must be a 6-digit number');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validate resend OTP data
 */
const validateResendOTP = (data) => {
  const errors = [];

  if (!data.mobileNumber) {
    errors.push('Mobile number is required');
  } else if (!validateMobileNumber(data.mobileNumber)) {
    errors.push('Valid mobile number is required');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

module.exports = {
  validateVerifyOTP,
  validateResendOTP,
};

