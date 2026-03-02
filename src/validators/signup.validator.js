const { validateEmail, validateMobileNumber, validatePassword } = require('./auth.validator');

/**
 * Validate date of birth (required)
 */
const validateDOB = (dob) => {
  if (!dob) return { valid: false, message: 'Date of birth is required' };
  return validateDOBOptional(dob);
};

/**
 * Validate date of birth when provided (optional field)
 */
const validateDOBOptional = (dob) => {
  if (!dob) return { valid: true };
  const date = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const monthDiff = today.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) {
    age--;
  }
  if (isNaN(date.getTime())) {
    return { valid: false, message: 'Invalid date of birth format' };
  }
  if (age < 13) {
    return { valid: false, message: 'You must be at least 13 years old' };
  }
  if (age > 120) {
    return { valid: false, message: 'Invalid date of birth' };
  }
  return { valid: true };
};

/**
 * Validate gender
 */
const validateGender = (gender) => {
  const validGenders = ['male', 'female', 'other', 'prefer not to say'];
  return validGenders.includes(gender?.toLowerCase());
};

/**
 * Validate yourBest field for organiser
 */
const validateYourBest = (yourBest) => {
  const validOptions = ['organiser', 'coach', 'club'];
  return validOptions.includes(yourBest?.toLowerCase());
};

/**
 * Validate Instagram link (optional, must be valid URL if provided)
 */
const validateInstagramLink = (instagramLink) => {
  if (!instagramLink) return true; // Optional field
  
  // Basic URL validation
  const urlPattern = /^(https?:\/\/)?(www\.)?(instagram\.com|instagr\.am)\/.+/i;
  if (!urlPattern.test(instagramLink)) {
    return { valid: false, message: 'Invalid Instagram link format. Use a valid Instagram URL' };
  }
  
  return { valid: true };
};

/**
 * Validate profile visibility for organiser
 */
const validateProfileVisibility = (profileVisibility) => {
  if (!profileVisibility) return true; // Optional field
  const validOptions = ['public', 'private'];
  return validOptions.includes(profileVisibility?.toLowerCase());
};

/**
 * Validate player signup data
 */
const validatePlayerSignup = (data) => {
  const errors = [];

  // User type
  if (data.userType !== 'player') {
    errors.push('Invalid user type for player signup');
  }

  // Profile pic (optional)
  // Will be handled by multer middleware

  // Email validation
  if (!data.email || !validateEmail(data.email)) {
    errors.push('Valid email is required');
  }

  // Mobile number validation
  if (!data.mobileNumber || !validateMobileNumber(data.mobileNumber)) {
    errors.push('Valid mobile number is required');
  }

  // Full name validation
  if (!data.fullName || data.fullName.trim().length < 2) {
    errors.push('Full name is required (minimum 2 characters)');
  }

  // Date of birth validation (optional) - if provided, must be valid
  if (data.dob != null && data.dob !== '') {
    const dobValidation = validateDOBOptional(data.dob);
    if (!dobValidation.valid) {
      errors.push(dobValidation.message);
    }
  }

  // Gender validation (optional) - if provided, must be valid
  if (data.gender != null && data.gender !== '') {
    if (!validateGender(data.gender)) {
      errors.push('Gender must be one of: male, female, other, prefer not to say');
    }
  }

  // WhatsApp number validation (optional) - if provided, must be valid
  if (data.whatsappNumber != null && data.whatsappNumber !== '') {
    if (!validateMobileNumber(data.whatsappNumber)) {
      errors.push('Invalid WhatsApp number format');
    }
  }

  // Password validation (optional) - if provided, must be valid
  if (data.password != null && data.password !== '') {
    const passwordValidation = validatePassword(data.password);
    if (!passwordValidation.valid) {
      errors.push(passwordValidation.message);
    }
  }

  // Sport 1 validation
  if (!data.sport1 || data.sport1.trim().length < 2) {
    errors.push('Sport 1 is required');
  }

  // Sport 2 validation
  if (!data.sport2 || data.sport2.trim().length < 2) {
    errors.push('Sport 2 is required');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validate organiser signup data
 */
const validateOrganiserSignup = (data) => {
  const errors = [];

  // User type
  if (data.userType !== 'organiser') {
    errors.push('Invalid user type for organiser signup');
  }

  // Profile pic (optional)
  // Will be handled by multer middleware

  // Full name validation
  if (!data.fullName || data.fullName.trim().length < 2) {
    errors.push('Full name must be at least 2 characters long');
  }

  // Your best validation
  if (!data.yourBest || !validateYourBest(data.yourBest)) {
    errors.push('Your best is required (Organiser, Coach, or Club)');
  }

  // Community name validation
  if (!data.communityName || data.communityName.trim().length < 2) {
    errors.push('Community name must be at least 2 characters long');
  }

  // Email validation
  if (!data.email || !validateEmail(data.email)) {
    errors.push('Valid email is required');
  }

  // Mobile number validation
  if (!data.mobileNumber || !validateMobileNumber(data.mobileNumber)) {
    errors.push('Valid mobile number is required');
  }

  // Your city validation
  if (!data.yourCity || data.yourCity.trim().length < 2) {
    errors.push('Your city must be at least 2 characters long');
  }

  // Sport 1 validation
  if (!data.sport1 || data.sport1.trim().length < 2) {
    errors.push('Sport 1 is required');
  }

  // Sport 2 validation
  if (!data.sport2 || data.sport2.trim().length < 2) {
    errors.push('Sport 2 is required');
  }

  // Bio validation (optional but if provided, should have minimum length)
  if (data.bio && data.bio.trim().length < 10) {
    errors.push('Bio must be at least 10 characters long if provided');
  }

  // Password validation (optional) - if provided, must be valid
  if (data.password != null && data.password !== '') {
    const passwordValidation = validatePassword(data.password);
    if (!passwordValidation.valid) {
      errors.push(passwordValidation.message);
    }
  }

  // Profile visibility validation (optional)
  if (data.profileVisibility && !validateProfileVisibility(data.profileVisibility)) {
    errors.push('Profile visibility must be "public" or "private"');
  }

  // Instagram link validation (optional)
  if (data.instagramLink) {
    const instagramValidation = validateInstagramLink(data.instagramLink);
    if (!instagramValidation.valid) {
      errors.push(instagramValidation.message);
    }
  }

  // Date of birth validation (optional) for organiser
  if (data.dob != null && data.dob !== '') {
    const dobValidation = validateDOBOptional(data.dob);
    if (!dobValidation.valid) {
      errors.push(dobValidation.message);
    }
  }

  // Gender validation (optional) for organiser
  if (data.gender != null && data.gender !== '') {
    if (!validateGender(data.gender)) {
      errors.push('Gender must be one of: male, female, other, prefer not to say');
    }
  }

  // WhatsApp number validation (optional) for organiser
  if (data.whatsappNumber != null && data.whatsappNumber !== '') {
    if (!validateMobileNumber(data.whatsappNumber)) {
      errors.push('Invalid WhatsApp number format');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

module.exports = {
  validatePlayerSignup,
  validateOrganiserSignup,
  validateDOB,
  validateDOBOptional,
  validateGender,
  validateYourBest,
  validateProfileVisibility,
  validateInstagramLink,
};

