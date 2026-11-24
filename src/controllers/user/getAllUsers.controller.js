const Follow = require('../../models/Follow');
const { getPaginationParams, createPaginationResponse } = require('../../utils/pagination');
const { getDB } = require('../../config/database');
const { getBookingStatsByUsers } = require('../../utils/bookingStats');

const ADMIN_MAX_PER_PAGE = 100;

/**
 * Temporary switch for the public route while the Lovable admin panel moves
 * to GET /api/admin/users. Set PUBLIC_USERS_EXPOSE_PII=true only for that
 * transition window; unset (default) = public route returns no private data.
 */
const publicRouteExposesPrivateData = () => process.env.PUBLIC_USERS_EXPOSE_PII === 'true';

/**
 * Format one user. `includePrivate` adds contact details, verification
 * flags, date of birth, gender and booking spend — admin-only data.
 */
const formatUser = async (user, bookingStatsMap, includePrivate) => {
  const userData = {
    id: user.userId,
    userId: user.userId,
    mongoId: user._id.toString(),
    userType: user.userType,
    fullName: user.fullName,
    profilePic: user.profilePic,
    sport1: user.sport1,
    sport2: user.sport2,
    sports: user.sports || [],
    followingCount: user.followingCount || 0,
    createdAt: user.createdAt,
  };

  if (user.userType === 'organiser') {
    userData.yourBest = user.yourBest;
    userData.communityName = user.communityName;
    userData.yourCity = user.yourCity;
    userData.bio = user.bio;
    userData.instagramLink = user.instagramLink || null;
    userData.profileVisibility = user.profileVisibility || 'private';
    userData.followersCount = await Follow.getFollowerCount(user._id.toString());
    userData.eventsCreated = user.eventsCreated || 0;
    userData.totalAttendees = user.totalAttendees || 0;
  }

  if (includePrivate) {
    userData.email = user.email;
    userData.mobileNumber = user.mobileNumber;
    userData.isEmailVerified = user.isEmailVerified || false;
    userData.isMobileVerified = user.isMobileVerified || false;
    userData.updatedAt = user.updatedAt;
    if (user.userType === 'player') {
      userData.dob = user.dob;
      userData.gender = user.gender;
    }
    const bookingStats = bookingStatsMap.get(user._id.toString()) || { bookedCount: 0, totalSpent: 0 };
    userData.totalBookedEvents = bookingStats.bookedCount;
    userData.totalBookingAmount = bookingStats.totalSpent;
  }

  return userData;
};

/**
 * Shared paginated user listing used by the public and admin routes.
 */
const listUsers = async ({ page: rawPage, perPage: rawPerPage, userType, includePrivate }) => {
  const { page, perPage, skip } = getPaginationParams(rawPage, rawPerPage);

  const usersCollection = getDB().collection('users');

  const query = {};
  if (userType && ['player', 'organiser'].includes(userType.toLowerCase())) {
    query.userType = userType.toLowerCase();
  }

  const totalCount = await usersCollection.countDocuments(query);
  const users = await usersCollection
    .find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(perPage)
    .toArray();

  const bookingStatsMap = includePrivate
    ? await getBookingStatsByUsers(users.map((user) => user._id))
    : new Map();

  const usersList = await Promise.all(
    users.map((user) => formatUser(user, bookingStatsMap, includePrivate))
  );

  return {
    users: usersList,
    pagination: createPaginationResponse(totalCount, page, perPage),
    ...(query.userType && { filter: { userType: query.userType } }),
  };
};

/**
 * @desc    Public users list — public profile fields only
 * @route   GET /api/users?page=1&userType=player
 * @access  Public
 *
 * No email, phone, date of birth, gender, verification flags or booking
 * spend (unless the temporary PUBLIC_USERS_EXPOSE_PII switch is on).
 * Fixed 20 per page.
 */
const getAllUsers = async (req, res, next) => {
  try {
    const data = await listUsers({
      page: req.query.page,
      perPage: 20,
      userType: req.query.userType,
      includePrivate: publicRouteExposesPrivateData(),
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Admin users list — full details incl. contact data and booking stats
 * @route   GET /api/admin/users?page=1&perPage=20&userType=player
 * @access  Admin (X-Admin-Key, via admin.routes.js)
 *
 * Same response shape as the legacy public route. perPage 1-100 (default 20).
 */
const getAdminUsers = async (req, res, next) => {
  try {
    const requested = parseInt(req.query.perPage, 10);
    const perPage = Number.isFinite(requested)
      ? Math.min(Math.max(requested, 1), ADMIN_MAX_PER_PAGE)
      : 20;

    const data = await listUsers({
      page: req.query.page,
      perPage,
      userType: req.query.userType,
      includePrivate: true,
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllUsers,
  getAdminUsers,
};
