const User = require('../../models/User');

/**
 * @desc    Get snaps for an organiser
 * @route   GET /api/users/:id/snaps
 * @access  Public (visibility enforced by private community rules if applicable)
 */
const getSnaps = async (req, res, next) => {
  try {
    const { id } = req.params;

    let user = null;
    if (!isNaN(id) && parseInt(id).toString() === id) {
      user = await User.findByUserId(id);
    }
    if (!user) {
      user = await User.findById(id);
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    if (user.userType !== 'organiser') {
      return res.status(200).json({
        success: true,
        data: { snaps: [] }
      });
    }

    return res.status(200).json({
      success: true,
      data: { snaps: user.snaps || [] }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getSnaps };
