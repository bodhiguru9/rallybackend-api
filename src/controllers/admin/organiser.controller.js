const User = require('../../models/User');
const { deleteUserAccount } = require('../user/deleteUser.controller');

/**
 * @desc    Delete an organiser account (admin panel only)
 * @route   DELETE /api/admin/organisers/:userId
 * @access  Admin key (adminKeyAuth)
 *
 * Body:
 * {
 *   confirm: { email: string, mobileNumber: string, bio: string }
 * }
 *
 * All three confirm fields must match the target organiser's current
 * record exactly (bio may legitimately be empty/null — empty must match
 * empty). This is a defense against the wrong account being targeted by a
 * stale panel ID or a leftover test script, not a UI "type DELETE" gesture:
 * the admin panel is expected to show these three fields on a confirmation
 * screen before calling this route.
 *
 * Deletion keeps all financial records (bookings, payments, package
 * purchases) untouched — see deleteUserAccount. Bank details are removed
 * from both organizerBankDetails and organiserBankAccounts.
 */
const deleteOrganiser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { confirm } = req.body || {};

    let user = null;
    if (!isNaN(userId) && parseInt(userId).toString() === userId) {
      user = await User.findByUserId(userId);
    }
    if (!user) {
      user = await User.findById(userId);
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    if (user.userType !== 'organiser') {
      return res.status(400).json({
        success: false,
        error: 'Target user is not an organiser',
      });
    }

    if (!confirm || typeof confirm !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'confirm (email, mobileNumber, bio) is required',
      });
    }

    const normalize = (value) => (value === null || value === undefined ? '' : String(value).trim());

    const fieldsMatch =
      normalize(confirm.email).toLowerCase() === normalize(user.email).toLowerCase() &&
      normalize(confirm.mobileNumber) === normalize(user.mobileNumber) &&
      normalize(confirm.bio) === normalize(user.bio);

    if (!fieldsMatch) {
      return res.status(400).json({
        success: false,
        error: 'confirm fields do not match the target organiser. Re-check email, mobileNumber, and bio.',
      });
    }

    const deleted = await deleteUserAccount(user);
    if (!deleted) {
      return res.status(400).json({
        success: false,
        error: 'Failed to delete organiser account',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Organiser account deleted successfully',
      data: {
        userId: user.userId,
        deletedAt: new Date(),
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { deleteOrganiser };
