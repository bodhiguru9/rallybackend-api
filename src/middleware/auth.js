const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Protect routes - verify JWT token
 */
const protect = async (req, res, next) => {
  try {
    let token;

    // Check for token in Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // Check for token in cookies (alternative method)
    if (!token && req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    // Make sure token exists
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Not authorized to access this route',
      });
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user from token
      const user = await User.findById(decoded.userId);

      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'User not found',
        });
      }

      // Attach user to request object (convert ObjectId to string)
      req.user = {
        id: user._id.toString(), // MongoDB ObjectId (for database operations)
        userId: user.userId, // Sequential userId (1, 2, 3, etc.)
        userType: user.userType,
        email: user.email,
        mobileNumber: user.mobileNumber,
        profilePic: user.profilePic,
      };

      // Add type-specific fields
      if (user.userType === 'player') {
        req.user.fullName = user.fullName;
        req.user.dob = user.dob;
        req.user.gender = user.gender;
        req.user.sport1 = user.sport1;
        req.user.sport2 = user.sport2;
      } else if (user.userType === 'organiser') {
        req.user.fullName = user.fullName;
        req.user.yourBest = user.yourBest;
        req.user.communityName = user.communityName;
        req.user.yourCity = user.yourCity;
        req.user.instagramLink = user.instagramLink;
      } else if (user.userType === 'superadmin') {
        req.user.fullName = user.fullName || 'Super Admin';
      }

      next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
      });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Optional auth - verify token if present but don't require it
 */
const optionalAuth = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token && req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId);
        if (user) {
          req.user = {
            id: user._id.toString(), // MongoDB ObjectId (for database operations)
            userId: user.userId, // Sequential userId (1, 2, 3, etc.)
            userType: user.userType,
            email: user.email,
            mobileNumber: user.mobileNumber,
            profilePic: user.profilePic,
          };

          // Add type-specific fields
          if (user.userType === 'player') {
            req.user.fullName = user.fullName;
            req.user.dob = user.dob;
            req.user.gender = user.gender;
          } else if (user.userType === 'organiser') {
            req.user.fullName = user.fullName;
            req.user.yourBest = user.yourBest;
            req.user.instagramLink = user.instagramLink;
          } else if (user.userType === 'superadmin') {
            req.user.fullName = user.fullName || 'Super Admin';
          }
        }
      } catch (error) {
        // Ignore token errors for optional auth
      }
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Check if the authenticated user is super admin (full access to all endpoints)
 */
const isSuperAdmin = (req) => req.user && req.user.userType === 'superadmin';

module.exports = {
  protect,
  optionalAuth,
  isSuperAdmin,
};

