const { validateEmail, validateMobileNumber } = require('./auth.validator');

/**
 * Validate send signup OTP request
 */
const validateSendSignupOTP = (data) => {
  const errors = [];

  // User type validation
  if (!data.userType || !['player', 'organiser'].includes(data.userType)) {
    errors.push('User type is required and must be "player" or "organiser"');
  }

  // Email or mobile number validation
  const hasEmail = data.email && data.email.trim();
  const hasMobile = data.mobileNumber && data.mobileNumber.trim();

  if (!hasEmail && !hasMobile) {
    errors.push('Either email or mobileNumber is required');
  }

  if (hasEmail && hasMobile) {
    errors.push('Please provide either email OR mobileNumber, not both');
  }

  if (hasEmail && !validateEmail(data.email)) {
    errors.push('Valid email is required');
  }

  if (hasMobile && !validateMobileNumber(data.mobileNumber)) {
    errors.push('Valid mobile number is required');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validate verify signup OTP request
 */
const validateVerifySignupOTP = (data) => {
  const errors = [];

  // Email or mobile number validation
  const hasEmail = data.email && data.email.trim();
  const hasMobile = data.mobileNumber && data.mobileNumber.trim();

  if (!hasEmail && !hasMobile) {
    errors.push('Either email or mobileNumber is required');
  }

  if (hasEmail && hasMobile) {
    errors.push('Please provide either email OR mobileNumber, not both');
  }

  if (hasEmail && !validateEmail(data.email)) {
    errors.push('Valid email is required');
  }

  if (hasMobile && !validateMobileNumber(data.mobileNumber)) {
    errors.push('Valid mobile number is required');
  }

  // OTP validation
  if (!data.otp || !/^\d{6}$/.test(data.otp)) {
    errors.push('OTP is required and must be a 6-digit number');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validate signup with token request
 * When signupToken is provided, user should provide ONLY the alternative identifier:
 * - If OTP was verified with email → provide only mobileNumber
 * - If OTP was verified with mobileNumber → provide only email
 */
const validateSignupWithToken = (data) => {
  const errors = [];

  // Email or mobile number validation
  const hasEmail = data.email && data.email.trim();
  const hasMobile = data.mobileNumber && data.mobileNumber.trim();

  // Signup token validation
  if (!data.signupToken || data.signupToken.trim().length < 10) {
    errors.push('Signup token is required');
  }

  // User must provide exactly one identifier (the alternative, not the verified one)
  if (!hasEmail && !hasMobile) {
    errors.push('Either email or mobileNumber is required');
  }

  if (hasEmail && hasMobile) {
    errors.push('Please provide either email OR mobileNumber, not both. Provide only the one that was NOT used in OTP verification.');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

module.exports = {
  validateSendSignupOTP,
  validateVerifySignupOTP,
  validateSignupWithToken,
};

