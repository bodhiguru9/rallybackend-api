const express = require('express');
const router = express.Router();

// Import controllers
const signupController = require('../controllers/auth/signup.controller');
const signupOTPController = require('../controllers/auth/signup-otp.controller');
const signinController = require('../controllers/auth/signin.controller');
const superadminSigninController = require('../controllers/auth/superadmin-signin.controller');
const emailLoginController = require('../controllers/auth/email-login.controller');
const whatsappLoginController = require('../controllers/auth/whatsapp-login.controller');
const forgotPasswordController = require('../controllers/auth/forgot-password.controller');
const otpController = require('../controllers/auth/otp.controller');
const oauthController = require('../controllers/auth/oauth.controller');
const refreshTokenController = require('../controllers/auth/refresh-token.controller');
const logoutController = require('../controllers/auth/logout.controller');
const { protect } = require('../middleware/auth');

/**
 * SIGNUP FLOW - NEW OTP-BASED PROCESS
 * 
 * Step 1: Send OTP
 * POST /api/auth/send-signup-otp
 * Content-Type: application/json
 * 
 * Request Body (provide ONLY ONE - email OR mobileNumber):
 * Option 1 - With Email:
 * {
 *   "email": "user@example.com",        // Required (if using email)
 *   "userType": "player" | "organiser"  // Required
 * }
 * 
 * Option 2 - With Mobile Number:
 * {
 *   "mobileNumber": "+1234567890",      // Required (if using mobile)
 *   "userType": "player" | "organiser" // Required
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "OTP has been sent to your email/mobile number"
 * }
 * 
 * Step 2: Verify OTP
 * POST /api/auth/verify-signup-otp
 * Content-Type: application/json
 * 
 * Request Body (provide ONLY ONE - email OR mobileNumber):
 * Option 1 - With Email:
 * {
 *   "email": "user@example.com",        // Required (if using email)
 *   "otp": "123456"                     // Required (6-digit OTP from email)
 * }
 * 
 * Option 2 - With Mobile Number:
 * {
 *   "mobileNumber": "+1234567890",     // Required (if using mobile)
 *   "otp": "123456"                     // Required (6-digit OTP from WhatsApp)
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "OTP verified successfully. Please complete your signup by providing your details.",
 *   "data": {
 *     "signupToken": "token_here",      // REQUIRED: Use this in signup endpoint
 *     "userType": "player" | "organiser",
 *     "verifiedEmail": "user@example.com" | null,
 *     "verifiedMobile": "+1234567890" | null,
 *     "nextStep": "Complete signup by calling POST /api/auth/signup with signupToken and all required fields"
 *   }
 * }
 * 
 * NOTE: After OTP verification, you MUST call the signup endpoint with signupToken
 * 
 * Step 3: Complete Signup (AFTER OTP VERIFICATION)
 * POST /api/auth/signup
 * Content-Type: multipart/form-data
 * 
 * IMPORTANT: This endpoint can ONLY be called AFTER verifying OTP in Step 2.
 * You MUST provide the signupToken from verify-signup-otp response.
 * 
 * For Player:
 * - signupToken: "token_from_verify_signup_otp" (REQUIRED - from Step 2)
 * - userType: "player" (required)
 * - email: "player@example.com" (required, MUST match the email used in Step 1)
 * - mobile_number: "+1234567890" (required, MUST match the mobile used in Step 1)
 * - full_name: "John Doe" (required)
 * - dob: "1990-01-01" (required, format: YYYY-MM-DD)
 * - gender: "male" | "female" | "other" | "prefer not to say" (required)
 * - password: (optional) if provided, must meet password rules; user can set later via forgot-password
 * - sport1: "Football" (required)
 * - sport2: "Basketball" (required)
 * - profile_pic / profilePic / profilePicture: [file] (optional) - profile picture upload
 * - whatsappNumber / whatsapp_number: (optional) - WhatsApp number
 * - dob: (optional) - date of birth (YYYY-MM-DD)
 * - gender: (optional) - male | female | other | prefer not to say
 * 
 * For Organiser:
 * - signupToken: "token_from_verify_signup_otp" (REQUIRED - from Step 2)
 * - userType: "organiser" (required)
 * - email: "organiser@example.com" (required, MUST match the email used in Step 1)
 * - mobile_number: "+1234567890" (required, MUST match the mobile used in Step 1)
 * - full_name: "John Doe" (required)
 * - your_best: "organiser" | "coach" | "club" (required)
 * - community_name: "Sports Club" (required)
 * - your_city: "New York" (required)
 * - sport1: "Football" (required)
 * - sport2: "Basketball" (required)
 * - password: (optional) if provided, must meet password rules; user can set later via forgot-password
 * - profile_pic / profilePic / profilePicture: [file] (optional) - profile picture upload
 * - whatsappNumber / whatsapp_number: (optional) - WhatsApp number
 * - dob: (optional) - date of birth (YYYY-MM-DD)
 * - gender: (optional) - male | female | other | prefer not to say
 * - bio: "Experienced coach..." (optional, min 10 chars if provided)
 * - profileVisibility: "public" | "private" (optional, default: "private")
 * - profile_pic: [file] (optional)
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "User registered successfully",
 *   "data": {
 *     "user": { ... },
 *     "token": "jwt_token_here"
 *   }
 * }
 */
router.post('/send-signup-otp', signupOTPController.sendSignupOTP);
router.post('/verify-signup-otp', signupOTPController.verifySignupOTP);
router.post('/signup', signupController.signup);

/**
 * SIGNIN ROUTE (Email OR Mobile + Password)
 * POST /api/auth/signin
 * Content-Type: application/json
 * 
 * Request Body (provide ONLY ONE - email OR mobileNumber):
 * Option 1 - With Email:
 * {
 *   "email": "user@example.com",        // Required (if using email)
 *   "password": "SecurePass123!"        // Required
 * }
 * 
 * Option 2 - With Mobile Number:
 * {
 *   "mobileNumber": "+1234567890",      // Required (if using mobile)
 *   "password": "SecurePass123!"        // Required
 * }
 * 
 * Super Admin login (full access to all endpoints):
 * { "email": "admin@rally.com", "password": "admin123" }
 * (Create super admin first: node scripts/seedSuperAdmin.js)
 * 
 * Note: Provide either email OR mobileNumber, NOT both
 */
router.post('/signin', signinController.signin);

/**
 * SUPER ADMIN SIGN-IN (dedicated endpoint)
 * POST /api/auth/superadmin/signin  OR  POST /api/auth/superadmin-signin
 * Content-Type: application/json
 * Body: { "email": "admin@rally.com", "password": "admin123" }
 * Only users with userType "superadmin" can sign in via this route.
 */
router.post('/superadmin/signin', superadminSigninController.superadminSignin);
router.post('/superadmin-signin', superadminSigninController.superadminSignin);

/**
 * EMAIL LOGIN ROUTE
 * POST /api/auth/email-login
 * Content-Type: application/json
 * 
 * Request Body:
 * {
 *   "email": "user@example.com",        // Required
 *   "password": "SecurePass123!"        // Required
 * }
 */
router.post('/email-login', emailLoginController.emailLogin);

/**
 * WHATSAPP LOGIN - Request OTP
 * POST /api/auth/whatsapp-login
 * Content-Type: application/json
 * 
 * Request Body:
 * {
 *   "mobileNumber": "+1234567890"       // Required (with country code)
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "If mobile number exists, OTP has been sent via WhatsApp"
 * }
 */
router.post('/whatsapp-login', whatsappLoginController.whatsappLogin);

/**
 * WHATSAPP LOGIN - Verify OTP
 * POST /api/auth/verify-whatsapp-login
 * Content-Type: application/json
 * 
 * Request Body:
 * {
 *   "mobileNumber": "+1234567890",      // Required
 *   "otp": "123456"                     // Required (6-digit code)
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Login successful",
 *   "data": {
 *     "user": { ... },
 *     "token": "jwt_token_here"
 *   }
 * }
 */
router.post('/verify-whatsapp-login', whatsappLoginController.verifyWhatsAppLogin);

/**
 * FORGOT PASSWORD - Request OTP (Email OR Mobile)
 * POST /api/auth/forgot-password
 * Content-Type: application/json
 * 
 * Request Body (provide ONLY ONE - email OR mobileNumber):
 * Option 1 - With Email:
 * {
 *   "email": "user@example.com"        // Required (if using email)
 * }
 * 
 * Option 2 - With Mobile Number:
 * {
 *   "mobileNumber": "+1234567890"      // Required (if using mobile)
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "If account exists, OTP has been sent"
 * }
 * 
 * Note: OTP will be sent via email if email provided, or via WhatsApp if mobileNumber provided
 */
router.post('/forgot-password', forgotPasswordController.forgotPassword);

/**
 * VERIFY FORGOT PASSWORD OTP - Verify OTP sent for password reset
 * POST /api/auth/verify-forgot-password-otp
 * Content-Type: application/json
 * 
 * Request Body (provide ONLY ONE - email OR mobileNumber):
 * Option 1 - With Email:
 * {
 *   "email": "user@example.com",        // Required (if using email)
 *   "otp": "123456"                      // Required (6-digit OTP from email)
 * }
 * 
 * Option 2 - With Mobile Number:
 * {
 *   "mobileNumber": "+1234567890",      // Required (if using mobile)
 *   "otp": "123456"                      // Required (6-digit OTP from WhatsApp)
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "OTP verified successfully. You can now set your new password.",
 *   "data": {
 *     "verified": true,
 *     "verificationToken": "token_here"  // Use this token in set-new-password endpoint
 *   }
 * }
 */
router.post('/verify-forgot-password-otp', forgotPasswordController.verifyForgotPasswordOTP);

/**
 * SET NEW PASSWORD - Set new password after OTP verification
 * POST /api/auth/set-new-password
 * Content-Type: application/json
 * 
 * Request Body (provide ONLY ONE - email OR mobileNumber):
 * Option 1 - With Email:
 * {
 *   "email": "user@example.com",              // Required (if using email)
 *   "verificationToken": "token_from_verify", // Required (from verify-forgot-password-otp)
 *   "password": "1234"                        // Required (can be any password)
 * }
 * 
 * Option 2 - With Mobile Number:
 * {
 *   "mobileNumber": "+1234567890",            // Required (if using mobile)
 *   "verificationToken": "token_from_verify", // Required (from verify-forgot-password-otp)
 *   "password": "1234"                        // Required (can be any password)
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Password reset successfully",
 *   "data": {
 *     "user": { ... },
 *     "token": "jwt_token_here"
 *   }
 * }
 */
router.post('/set-new-password', forgotPasswordController.setNewPassword);

/**
 * VERIFY OTP - For Mobile Number Verification (After Signup)
 * POST /api/auth/verify-otp
 * Content-Type: application/json
 * 
 * Request Body:
 * {
 *   "mobileNumber": "+1234567890",      // Required
 *   "otp": "123456"                     // Required (6-digit code sent via WhatsApp)
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Mobile number verified successfully",
 *   "data": {
 *     "user": { ... },
 *     "token": "jwt_token_here"
 *   }
 * }
 */
router.post('/verify-otp', otpController.verifyOTP);

/**
 * RESEND OTP - Request New OTP
 * POST /api/auth/resend-otp
 * Content-Type: application/json
 * 
 * Request Body:
 * {
 *   "mobileNumber": "+1234567890"       // Required
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "If mobile number exists, OTP has been sent via WhatsApp"
 * }
 */
router.post('/resend-otp', otpController.resendOTP);

/**
 * OAUTH AUTHENTICATION ROUTES
 * Signup/Login with Google, Facebook, or Apple
 */

/**
 * Google OAuth Signup/Login
 * POST /api/auth/oauth/google
 * Content-Type: application/json
 * 
 * Request Body:
 * {
 *   "idToken": "google_id_token_here",    // Required (Google ID token from client)
 *   "userType": "player" | "organiser",    // Required (for new users)
 *   "mobileNumber": "+1234567890",         // Optional
 *   "fullName": "John Doe",                // Optional (will use Google name if not provided)
 *   "sport1": "Football",                  // Optional (for new users)
 *   "sport2": "Basketball",                // Optional (for new users)
 *   // ... other optional fields based on userType
 * }
 * 
 * Response (New User):
 * {
 *   "success": true,
 *   "message": "Account created and logged in successfully",
 *   "data": {
 *     "isNewUser": true,
 *     "user": { ... },
 *     "token": "jwt_token_here"
 *   }
 * }
 * 
 * Response (Existing User):
 * {
 *   "success": true,
 *   "message": "Login successful",
 *   "data": {
 *     "isNewUser": false,
 *     "user": { ... },
 *     "token": "jwt_token_here"
 *   }
 * }
 */
router.post('/oauth/google', oauthController.googleOAuth);

/**
 * Facebook OAuth Signup/Login
 * POST /api/auth/oauth/facebook
 * Content-Type: application/json
 * 
 * Request Body:
 * {
 *   "accessToken": "facebook_access_token_here",  // Required (Facebook access token from client)
 *   "userType": "player" | "organiser",            // Required (for new users)
 *   "mobileNumber": "+1234567890",                 // Optional
 *   "fullName": "John Doe",                        // Optional (will use Facebook name if not provided)
 *   "sport1": "Football",                          // Optional (for new users)
 *   "sport2": "Basketball",                        // Optional (for new users)
 *   // ... other optional fields based on userType
 * }
 * 
 * Response format same as Google OAuth
 */
router.post('/oauth/facebook', oauthController.facebookOAuth);

/**
 * Apple OAuth Signup/Login
 * POST /api/auth/oauth/apple
 * Content-Type: application/json
 * 
 * Request Body:
 * {
 *   "idToken": "apple_id_token_here",      // Required (Apple ID token from client)
 *   "userType": "player" | "organiser",    // Required (for new users)
 *   "mobileNumber": "+1234567890",         // Optional
 *   "fullName": "John Doe",                // Optional (Apple may provide name on first sign-in only)
 *   "sport1": "Football",                  // Optional (for new users)
 *   "sport2": "Basketball",                // Optional (for new users)
 *   // ... other optional fields based on userType
 * }
 * 
 * Response format same as Google OAuth
 */
router.post('/oauth/apple', oauthController.appleOAuth);

/**
 * REFRESH TOKEN ROUTE
 * POST /api/auth/refresh-token
 * Content-Type: application/json
 * 
 * Request Body:
 * {
 *   "refreshToken": "refresh_token_here"  // Required
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Token refreshed successfully",
 *   "data": {
 *     "accessToken": "new_access_token_here",
 *     "refreshToken": "same_refresh_token_here"
 *   }
 * }
 */
router.post('/refresh-token', refreshTokenController.refreshToken);

/**
 * LOGOUT ROUTE
 * POST /api/auth/logout
 * Content-Type: application/json
 * 
 * Request Body:
 * {
 *   "refreshToken": "refresh_token_here"  // Required
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Logged out successfully"
 * }
 * 
 * Note: Works for both player and organiser
 */
router.post('/logout', logoutController.logout);

/**
 * LOGOUT ALL DEVICES ROUTE
 * POST /api/auth/logout-all
 * Authorization: Bearer <access_token>
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Logged out from all devices successfully",
 *   "data": {
 *     "devicesLoggedOut": 3
 *   }
 * }
 * 
 * Note: Works for both player and organiser, requires authentication
 */
router.post('/logout-all', protect, logoutController.logoutAll);

module.exports = router;

