const { validateEmail, validateMobileNumber, validatePassword } = require('./auth.validator');
const {
  validateDOB,
  validateGender,
  validateYourBest,
  validateProfileVisibility,
  validateInstagramLink,
} = require('./signup.validator');

/**
 * Validate user update data
 * Supports both player and organiser user types
 * All fields are optional - user can update any subset of their profile
 */
const validateUserUpdate = (data, userType) => {
  const errors = [];

  // Email validation (optional)
  if (data.email !== undefined) {
    if (!data.email || !validateEmail(data.email)) {
      errors.push('Valid email is required if provided');
    }
  }

  // Mobile number validation (optional)
  if (data.mobileNumber !== undefined) {
    if (!data.mobileNumber || !validateMobileNumber(data.mobileNumber)) {
      errors.push('Valid mobile number is required if provided');
    }
  }

  // Password validation (optional)
  if (data.password !== undefined) {
    if (!data.password) {
      errors.push('Password cannot be empty if provided');
    } else {
      const passwordValidation = validatePassword(data.password);
      if (!passwordValidation.valid) {
        errors.push(passwordValidation.message);
      }
    }
  }

  // Player specific validations
  if (userType === 'player') {
    // Full name validation (optional)
    if (data.fullName !== undefined) {
      if (!data.fullName || data.fullName.trim().length < 2) {
        errors.push('Full name must be at least 2 characters long if provided');
      }
    }

    // Date of birth validation (optional)
    if (data.dob !== undefined) {
      const dobValidation = validateDOB(data.dob);
      if (!dobValidation.valid) {
        errors.push(dobValidation.message);
      }
    }

    // Gender validation (optional)
    if (data.gender !== undefined) {
      if (!validateGender(data.gender)) {
        errors.push('Valid gender is required if provided (male, female, other, prefer not to say)');
      }
    }

    // Sport 1 validation (optional)
    if (data.sport1 !== undefined) {
      if (!data.sport1 || data.sport1.trim().length < 2) {
        errors.push('Sport 1 must be at least 2 characters long if provided');
      }
    }

    // Sport 2 validation (optional)
    if (data.sport2 !== undefined) {
      if (!data.sport2 || data.sport2.trim().length < 2) {
        errors.push('Sport 2 must be at least 2 characters long if provided');
      }
    }
  }

  // Organiser specific validations
  if (userType === 'organiser') {
    // Full name validation (optional)
    if (data.fullName !== undefined) {
      if (!data.fullName || data.fullName.trim().length < 2) {
        errors.push('Full name must be at least 2 characters long if provided');
      }
    }

    // Your best validation (optional)
    if (data.yourBest !== undefined) {
      if (!validateYourBest(data.yourBest)) {
        errors.push('Your best must be one of: organiser, coach, club');
      }
    }

    // Community name validation (optional)
    if (data.communityName !== undefined) {
      if (!data.communityName || data.communityName.trim().length < 2) {
        errors.push('Community name must be at least 2 characters long if provided');
      }
    }

    // Your city validation (optional)
    if (data.yourCity !== undefined) {
      if (!data.yourCity || data.yourCity.trim().length < 2) {
        errors.push('Your city must be at least 2 characters long if provided');
      }
    }

    // Sport 1 validation (optional)
    if (data.sport1 !== undefined) {
      if (!data.sport1 || data.sport1.trim().length < 2) {
        errors.push('Sport 1 must be at least 2 characters long if provided');
      }
    }

    // Sport 2 validation (optional)
    if (data.sport2 !== undefined) {
      if (!data.sport2 || data.sport2.trim().length < 2) {
        errors.push('Sport 2 must be at least 2 characters long if provided');
      }
    }

    // Bio validation (optional)
    if (data.bio !== undefined && data.bio !== null && data.bio !== '') {
      if (data.bio.trim().length < 10) {
        errors.push('Bio must be at least 10 characters long if provided');
      }
    }

    // Profile visibility validation (optional)
    if (data.profileVisibility !== undefined) {
      if (!validateProfileVisibility(data.profileVisibility)) {
        errors.push('Profile visibility must be "public" or "private"');
      }
    }

    // Instagram link validation (optional)
    if (data.instagramLink !== undefined && data.instagramLink !== null && data.instagramLink !== '') {
      const instagramValidation = validateInstagramLink(data.instagramLink);
      if (!instagramValidation.valid) {
        errors.push(instagramValidation.message);
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

module.exports = {
  validateUserUpdate,
};

