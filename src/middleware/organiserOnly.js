const { isSuperAdmin } = require('./auth');

/**
 * Middleware to ensure only organisers (or super admin) can access certain routes
 * Must be used after the protect middleware
 * Super admin has full access to all endpoints including organiser-only.
 */
const organiserOnly = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Please log in first.',
    });
  }

  if (isSuperAdmin(req)) return next();
  if (req.user.userType !== 'organiser') {
    return res.status(403).json({
      success: false,
      error: 'Access denied. Only organisers can perform this action.',
      userType: req.user.userType,
      requiredType: 'organiser',
    });
  }

  next();
};

module.exports = organiserOnly;

