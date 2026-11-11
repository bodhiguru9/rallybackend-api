const { getDB } = require('../../config/database');
const { getPaginationParams, createPaginationResponse } = require('../../utils/pagination');
const { getBookingStatsByUsers } = require('../../utils/bookingStats');
const { escapeRegex, normalizePhoneDigits } = require('../../utils/adminSearch');
const { findUserByIdParam } = require('../../utils/adminLookup');
const { confirmMatchesTarget } = require('../../utils/adminDeleteConfirm');
const { deleteUserAccount } = require('../user/deleteUser.controller');

/**
 * @desc    Search users of any type (player or organiser) by name, email,
 *          or phone (any format). Matching the same email or phone across
 *          multiple accounts surfaces all of them together, with enough
 *          distinguishing info (join date, last booking, organiser stats)
 *          for the admin to tell which account is which.
 * @route   GET /api/admin/search-user?search=&page=&perPage=
 * @access  Admin key (adminKeyAuth)
 */
const searchUsers = async (req, res, next) => {
  try {
    const search = (req.query.search || '').trim();
    if (!search) {
      return res.status(400).json({ success: false, error: 'search is required' });
    }

    const { page, perPage, skip } = getPaginationParams(req.query.page, parseInt(req.query.perPage, 10) || 20);

    const db = getDB();
    const usersCollection = db.collection('users');

    const regex = new RegExp(escapeRegex(search), 'i');
    const orConditions = [{ fullName: regex }, { email: regex }, { communityName: regex }];

    // Phone search: match on digits only, so any of +971551899547 /
    // 971551899547 / 0551899547 / 551899547 find the same account.
    // Require a handful of digits so short numeric input doesn't
    // accidentally match half the phone book.
    const phoneDigits = normalizePhoneDigits(search);
    if (phoneDigits.length >= 6) {
      orConditions.push({ mobileNumber: new RegExp(escapeRegex(phoneDigits)) });
    }

    // userId is stored as a number, so regex can't match it — only exact match works
    if (!isNaN(search) && search.trim() !== '') {
      orConditions.push({ userId: parseInt(search, 10) });
    }

    const query = { $or: orConditions };

    const totalCount = await usersCollection.countDocuments(query);
    const users = await usersCollection
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(perPage)
      .toArray();

    const statsMap = await getBookingStatsByUsers(users.map((u) => u._id));

    const usersData = users.map((u) => {
      const stats = statsMap.get(u._id.toString()) || { bookedCount: 0, totalSpent: 0, lastBookedAt: null };
      const base = {
        userId: u.userId,
        mongoId: u._id.toString(),
        fullName: u.fullName,
        email: u.email,
        mobileNumber: u.mobileNumber,
        userType: u.userType,
        profilePic: u.profilePic || null,
        createdAt: u.createdAt,
        bookingCount: stats.bookedCount,
        totalSpent: stats.totalSpent,
        lastBookingAt: stats.lastBookedAt,
      };
      if (u.userType === 'organiser') {
        base.communityName = u.communityName || null;
        base.eventsCreated = u.eventsCreated || 0;
        base.totalAttendees = u.totalAttendees || 0;
      }
      return base;
    });

    res.status(200).json({
      success: true,
      data: {
        users: usersData,
        pagination: createPaginationResponse(totalCount, page, perPage),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete any user's account (admin panel only), player or organiser
 * @route   DELETE /api/admin/users/:userId
 * @access  Admin key (adminKeyAuth)
 *
 * Body: { confirm: { email, mobileNumber, bio? , createdAt? } }
 *
 * email + mobileNumber must always match the target. The third field is
 * bio for organisers (a real differentiator) or the exact createdAt
 * timestamp for everyone else (bio is always empty for players) — see
 * confirmMatchesTarget. Deletion keeps all financial records (bookings,
 * payments, package purchases) untouched — see deleteUserAccount.
 */
const deleteUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { confirm } = req.body || {};

    const user = await findUserByIdParam(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (!confirmMatchesTarget(user, confirm)) {
      return res.status(400).json({
        success: false,
        error:
          user.userType === 'organiser'
            ? 'confirm fields do not match the target. Re-check email, mobileNumber, and bio.'
            : 'confirm fields do not match the target. Re-check email, mobileNumber, and createdAt.',
      });
    }

    const deleted = await deleteUserAccount(user);
    if (!deleted) {
      return res.status(400).json({ success: false, error: 'Failed to delete user account' });
    }

    res.status(200).json({
      success: true,
      message: 'User account deleted successfully',
      data: {
        userId: user.userId,
        userType: user.userType,
        deletedAt: new Date(),
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { searchUsers, deleteUser };
