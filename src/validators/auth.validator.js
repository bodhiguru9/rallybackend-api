const validator = require('validator');

/**
 * Validate email format
 */
const validateEmail = (email) => {
  return validator.isEmail(email);
};

/**
 * Validate mobile number format
 * Accepts various formats: +1234567890, 1234567890, (123) 456-7890, etc.
 */
const validateMobileNumber = (mobileNumber) => {
  if (!mobileNumber) return false;
  
  // Remove all non-digit characters except +
  const cleaned = mobileNumber.replace(/[^\d+]/g, '');
  
  // Check if it's a valid mobile number (10-15 digits, optionally with country code)
  // Minimum 10 digits (without country code) or 11-15 digits (with country code starting with +)
  const digitsOnly = cleaned.replace(/\+/g, '');
  
  if (cleaned.startsWith('+')) {
    // International format: + followed by 10-15 digits
    return digitsOnly.length >= 10 && digitsOnly.length <= 15;
  } else {
    // Local format: 10-15 digits
    return digitsOnly.length >= 10 && digitsOnly.length <= 15;
  }
};

/**
 * Validate password strength
 * Password can be any value (no complexity rules).
 * Only requires a non-empty password.
 */
const validatePassword = (password) => {
  if (password === undefined || password === null) {
    return { valid: false, message: 'Password is required' };
  }

  const passwordString = typeof password === 'string' ? password : String(password);
  if (passwordString.trim().length === 0) {
    return { valid: false, message: 'Password is required' };
  }

  return { valid: true };
};

/**
 * Validate signup data
 */
const validateSignup = (data) => {
  const errors = [];

  // Email validation (optional if mobile number is provided)
  if (!data.email && !data.mobileNumber) {
    errors.push('Email or mobile number is required');
  } else {
    if (data.email && !validateEmail(data.email)) {
      errors.push('Valid email is required');
    }
    if (data.mobileNumber && !validateMobileNumber(data.mobileNumber)) {
      errors.push('Valid mobile number is required');
    }
  }

  // Password validation
  if (!data.password) {
    errors.push('Password is required');
  } else {
    const passwordValidation = validatePassword(data.password);
    if (!passwordValidation.valid) {
      errors.push(passwordValidation.message);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validate signin data - accepts email OR mobile number (only one required)
 */
const validateSignin = (data) => {
  const errors = [];

  const hasEmail = data.email && data.email.trim().length > 0;
  const hasMobile = data.mobileNumber && data.mobileNumber.trim().length > 0;

  // Check if exactly one is provided (not both, not neither)
  if (!hasEmail && !hasMobile) {
    errors.push('Either email or mobile number is required');
  } else if (hasEmail && hasMobile) {
    errors.push('Please provide either email OR mobile number, not both');
  } else {
    // Validate the provided field
    if (hasEmail) {
      if (!validateEmail(data.email)) {
        errors.push('Valid email is required');
      }
    } else if (hasMobile) {
      if (!validateMobileNumber(data.mobileNumber)) {
        errors.push('Valid mobile number is required');
      }
    }
  }

  if (!data.password) {
    errors.push('Password is required');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validate forgot password data - accepts email OR mobile number (only one required)
 */
const validateForgotPassword = (data) => {
  const errors = [];

  const hasEmail = data.email && typeof data.email === 'string' && data.email.trim().length > 0;
  const hasMobile = data.mobileNumber && typeof data.mobileNumber === 'string' && data.mobileNumber.trim().length > 0;

  // Check if exactly one is provided (not both, not neither)
  if (!hasEmail && !hasMobile) {
    errors.push('Either email or mobile number is required');
  } else if (hasEmail && hasMobile) {
    errors.push('Please provide either email OR mobile number, not both');
  } else {
    // Validate the provided field
    if (hasEmail) {
      if (!validateEmail(data.email.trim())) {
        errors.push('Valid email is required');
      }
    } else if (hasMobile) {
      if (!validateMobileNumber(data.mobileNumber.trim())) {
        errors.push('Valid mobile number is required');
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validate verify OTP for forgot password
 */
const validateVerifyForgotPasswordOTP = (data) => {
  const errors = [];

  // Email or mobile number required
  const hasEmail = data.email && typeof data.email === 'string' && data.email.trim().length > 0;
  const hasMobile = data.mobileNumber && typeof data.mobileNumber === 'string' && data.mobileNumber.trim().length > 0;

  if (!hasEmail && !hasMobile) {
    errors.push('Either email or mobile number is required');
  } else if (hasEmail && hasMobile) {
    errors.push('Please provide either email OR mobile number, not both');
  } else {
    if (hasEmail && !validateEmail(data.email.trim())) {
      errors.push('Valid email is required');
    } else if (hasMobile && !validateMobileNumber(data.mobileNumber.trim())) {
      errors.push('Valid mobile number is required');
    }
  }

  // OTP is required
  const hasOTP = data.otp && (typeof data.otp === 'string' || typeof data.otp === 'number');
  const otpString = hasOTP ? String(data.otp).trim() : '';
  
  if (!hasOTP || otpString.length === 0) {
    errors.push('OTP is required');
  } else if (!/^\d{6}$/.test(otpString)) {
    errors.push('OTP must be a 6-digit number');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validate set new password (after OTP verification)
 * Only requires verificationToken and password (identifier retrieved from backend)
 */
const validateSetNewPassword = (data) => {
  const errors = [];

  // Verification token is required
  if (!data.verificationToken || typeof data.verificationToken !== 'string' || data.verificationToken.trim().length === 0) {
    errors.push('Verification token is required');
  }

  // Password is required
  if (!data.password) {
    errors.push('Password is required');
  } else {
    const passwordValidation = validatePassword(data.password);
    if (!passwordValidation.valid) {
      errors.push(passwordValidation.message);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validate reset password data - now uses OTP verification (kept for backward compatibility)
 */
const validateResetPassword = (data) => {
  const errors = [];

  // Email or mobile number required
  const hasEmail = data.email && data.email.trim().length > 0;
  const hasMobile = data.mobileNumber && data.mobileNumber.trim().length > 0;

  if (!hasEmail && !hasMobile) {
    errors.push('Either email or mobile number is required');
  } else if (hasEmail && hasMobile) {
    errors.push('Please provide either email OR mobile number, not both');
  } else {
    if (hasEmail && !validateEmail(data.email)) {
      errors.push('Valid email is required');
    } else if (hasMobile && !validateMobileNumber(data.mobileNumber)) {
      errors.push('Valid mobile number is required');
    }
  }

  // OTP is required
  if (!data.otp) {
    errors.push('OTP is required');
  } else if (!/^\d{6}$/.test(data.otp)) {
    errors.push('OTP must be a 6-digit number');
  }

  // Password is required
  if (!data.password) {
    errors.push('Password is required');
  } else {
    const passwordValidation = validatePassword(data.password);
    if (!passwordValidation.valid) {
      errors.push(passwordValidation.message);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

module.exports = {
  validateSignup,
  validateSignin,
  validateForgotPassword,
  validateVerifyForgotPasswordOTP,
  validateSetNewPassword,
  validateResetPassword,
  validatePassword,
  validateEmail,
  validateMobileNumber,
};

