const authService = require('../../services/auth.service');
const {
  validatePlayerSignup,
  validateOrganiserSignup,
} = require('../../validators/signup.validator');
const { validateSignupWithToken } = require('../../validators/signup-otp.validator');
const { uploadProfilePic } = require('../../middleware/upload');

// Test-only signup overrides
const TEST_EMAIL = 'yadav.navin51@gmail.com';
const TEST_MOBILE_RAW = '9569734648';
const TEST_PASSWORD = 'Pa$$w0rd';

const normalizeMobileNumber = (mobileNumber) => {
  let normalized = mobileNumber.replace(/[^\d+]/g, '').trim();
  normalized = normalized.replace(/\s+/g, '').replace(/-/g, '');
  if (!normalized.startsWith('+')) {
    if (normalized.length === 10) {
      normalized = `+91${normalized}`;
    } else if (normalized.length === 12 && normalized.startsWith('91')) {
      normalized = `+${normalized}`;
    } else {
      normalized = `+${normalized}`;
    }
  }
  return normalized;
};

/**
 * @desc    Register a new user (Player or Organiser)
 * @route   POST /api/auth/signup
 * @access  Public
 */
const signup = async (req, res, next) => {
  // Handle file upload first
  uploadProfilePic(req, res, async (err) => {
    try {
      // Handle multer errors
      if (err) {
        return res.status(400).json({
          success: false,
          error: err.message || 'File upload error',
        });
      }

      // Get user type and signup token from body
      const { userType, signupToken, email, mobileNumber } = req.body;

      if (!userType || !['player', 'organiser'].includes(userType)) {
        return res.status(400).json({
          success: false,
          error: 'User type is required and must be "player" or "organiser"',
        });
      }

      // Validate signup token first (this will check if email OR mobileNumber is provided)
      const tokenValidation = validateSignupWithToken(req.body);
      if (!tokenValidation.isValid) {
        // Files are already uploaded to S3, no need to delete
        return res.status(400).json({
          success: false,
          error: tokenValidation.errors,
        });
      }

      // Get signup data using only the token to determine which identifier was verified
      const signupOTPService = require('../../services/signup-otp.service');
      let signupData;
      try {
        signupData = await signupOTPService.getSignupDataByToken(signupToken);
      } catch (error) {
        return res.status(400).json({
          success: false,
          error: error.message || 'Invalid signup token or session expired',
        });
      }

      // Apply test password override if using test identifiers
      const testMobileNormalized = normalizeMobileNumber(TEST_MOBILE_RAW);
      const isTestIdentifier = signupData.isEmail
        ? signupData.identifier === TEST_EMAIL.toLowerCase()
        : signupData.identifier === testMobileNormalized;

      if (isTestIdentifier && !req.body.password) {
        req.body.password = TEST_PASSWORD;
      }

      // Now validate that ONLY the alternative identifier is provided (not the verified one)
      if (!isTestIdentifier) {
        if (signupData.isEmail) {
          // OTP was verified with email, so:
          // - Email should NOT be provided (already verified)
          // - MobileNumber MUST be provided (the alternative)
          if (email) {
            return res.status(400).json({
              success: false,
              error: 'Email was already verified via OTP. Please provide only mobile number.',
            });
          }
          if (!mobileNumber) {
            return res.status(400).json({
              success: false,
              error: 'Mobile number is required. You verified OTP with email, please provide mobile number only.',
            });
          }
        } else {
          // OTP was verified with mobileNumber, so:
          // - MobileNumber should NOT be provided (already verified)
          // - Email MUST be provided (the alternative)
          if (mobileNumber) {
            return res.status(400).json({
              success: false,
              error: 'Mobile number was already verified via OTP. Please provide only email.',
            });
          }
          if (!email) {
            return res.status(400).json({
              success: false,
              error: 'Email is required. You verified OTP with mobile number, please provide email only.',
            });
          }
        }
      }

      // Validate based on user type
      // Create validation body with both identifiers (verified one from signupData + alternative from request)
      const validationBody = {
        ...req.body,
        // Combine verified identifier from OTP with alternative identifier from request
        email: isTestIdentifier
          ? TEST_EMAIL.toLowerCase()
          : (signupData.isEmail ? signupData.identifier : email),
        mobileNumber: isTestIdentifier
          ? testMobileNormalized
          : (signupData.isEmail ? mobileNumber : signupData.identifier),
      };

      let validation;
      if (userType === 'player') {
        validation = validatePlayerSignup(validationBody);
      } else {
        validation = validateOrganiserSignup(validationBody);
      }

      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          error: validation.errors,
        });
      }

      // Prepare user data (include signupToken and both identifiers)
      // Combine verified identifier from OTP with alternative identifier from request
      const userData = {
        ...req.body,
        signupToken: signupToken,
        // Add verified identifier from signupData
        email: isTestIdentifier
          ? TEST_EMAIL.toLowerCase()
          : (signupData.isEmail ? signupData.identifier : email),
        mobileNumber: isTestIdentifier
          ? testMobileNormalized
          : (signupData.isEmail ? mobileNumber : signupData.identifier),
        // Optional: profile picture upload (profile_pic, profilePic, profilePicture)
        profilePic: (req.file || req.files?.profile_pic?.[0] || req.files?.profilePic?.[0] || req.files?.profilePicture?.[0])?.location || null,
        // Optional: WhatsApp number (whatsappNumber or whatsapp_number)
        whatsappNumber: req.body.whatsappNumber ?? req.body.whatsapp_number ?? null,
        // Optional: dob and gender (passed through from req.body)
        dob: req.body.dob ?? null,
        gender: req.body.gender ?? null,
      };

      // If test user already exists, return signin response
      if (isTestIdentifier) {
        try {
          const existing = await authService.signin(TEST_EMAIL.toLowerCase(), TEST_PASSWORD);
          return res.status(200).json({
            success: true,
            message: 'Test user already exists. Signed in successfully.',
            data: existing,
          });
        } catch (error) {
          // Continue to signup if signin fails
        }
      }

      // Create user
      const result = await authService.signup(userData);

      res.status(201).json({
        success: true,
        message: result.message || 'User registered successfully',
        data: result,
      });
    } catch (error) {
      // No need to delete files - S3 handles storage
      // Files are already uploaded to S3 at this point
      next(error);
    }
  });
};

module.exports = { signup };

