const authService = require('../../services/auth.service');

/**
 * @desc    Super Admin sign-in (email + password). Only superadmin userType can use this.
 * @route   POST /api/auth/superadmin/signin
 * @access  Public
 *
 * Body: { "email": "admin@rally.com", "password": "admin123" }
 */
const superadminSignin = async (req, res, next) => {
  try {
    const email = req.body.email ? String(req.body.email).trim() : '';
    const password = req.body.password;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required',
      });
    }

    const result = await authService.signin(email, password);

    if (result.user.userType !== 'superadmin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. This endpoint is only for super admin.',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Super admin login successful',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { superadminSignin };
