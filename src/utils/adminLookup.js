const User = require('../models/User');

/**
 * Resolve a URL param to a user, trying the sequential userId first
 * (e.g. "2018") and falling back to the Mongo _id. No userType filtering —
 * callers that need a specific type (e.g. organiser-only routes) check
 * user.userType themselves after this resolves.
 */
const findUserByIdParam = async (idParam) => {
  let user = null;
  if (!isNaN(idParam) && parseInt(idParam).toString() === idParam) {
    user = await User.findByUserId(idParam);
  }
  if (!user) {
    user = await User.findById(idParam);
  }
  return user;
};

module.exports = { findUserByIdParam };
