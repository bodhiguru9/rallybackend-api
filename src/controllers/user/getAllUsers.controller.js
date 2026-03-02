const User = require('../../models/User');
const Follow = require('../../models/Follow');
const { getPaginationParams, createPaginationResponse } = require('../../utils/pagination');
const { getDB } = require('../../config/database');
const { getBookingStatsByUsers } = require('../../utils/bookingStats');

/**
 * @desc    Get all users list with their details
 * @route   GET /api/users?page=1
 * @access  Public (or Private if needed)
 * 
 * Returns list of all users (both players and organisers) with pagination
 * Uses page-based pagination: 20 items per page
 * Query parameter: page (default: 1)
 */
const getAllUsers = async (req, res, next) => {
  try {
    const { page, perPage, skip } = getPaginationParams(req.query.page, 20);
    const userType = req.query.userType; // Optional filter: 'player' or 'organiser'

    const db = getDB();
    const usersCollection = db.collection('users');

    // Build query
    const query = {};
    if (userType && ['player', 'organiser'].includes(userType.toLowerCase())) {
      query.userType = userType.toLowerCase();
    }

    // Get total count
    const totalCount = await usersCollection.countDocuments(query);

    // Get paginated users
    const users = await usersCollection
      .find(query)
      .sort({ createdAt: -1 }) // Newest first
      .skip(skip)
      .limit(perPage)
      .toArray();

    const bookingStatsMap = await getBookingStatsByUsers(users.map((user) => user._id));

    // Format users with their details
    const usersList = await Promise.all(
      users.map(async (user) => {
        const userData = {
          id: user.userId,
          userId: user.userId,
          mongoId: user._id.toString(),
          userType: user.userType,
          email: user.email,
          mobileNumber: user.mobileNumber,
          profilePic: user.profilePic,
          isEmailVerified: user.isEmailVerified || false,
          isMobileVerified: user.isMobileVerified || false,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        };

        // Add type-specific fields
        if (user.userType === 'player') {
          userData.fullName = user.fullName;
          userData.dob = user.dob;
          userData.gender = user.gender;
          userData.sport1 = user.sport1;
          userData.sport2 = user.sport2;
          userData.sports = user.sports || [];
          userData.followingCount = user.followingCount || 0;
        } else if (user.userType === 'organiser') {
          userData.fullName = user.fullName;
          userData.yourBest = user.yourBest;
          userData.communityName = user.communityName;
          userData.yourCity = user.yourCity;
          userData.sport1 = user.sport1;
          userData.sport2 = user.sport2;
          userData.sports = user.sports || [];
          userData.bio = user.bio;
          userData.instagramLink = user.instagramLink || null;
          userData.profileVisibility = user.profileVisibility || 'private';
          
          // Get actual follower count from follows collection
          const followerCount = await Follow.getFollowerCount(user._id.toString());
          userData.followersCount = followerCount;
          
          userData.eventsCreated = user.eventsCreated || 0;
          userData.totalAttendees = user.totalAttendees || 0;
          userData.followingCount = user.followingCount || 0;
        }

        const bookingStats = bookingStatsMap.get(user._id.toString()) || { bookedCount: 0, totalSpent: 0 };
        userData.totalBookedEvents = bookingStats.bookedCount;
        userData.totalBookingAmount = bookingStats.totalSpent;

        return userData;
      })
    );

    const pagination = createPaginationResponse(totalCount, page, perPage);

    res.status(200).json({
      success: true,
      data: {
        users: usersList,
        pagination,
        ...(userType && { filter: { userType } }),
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllUsers,
};

