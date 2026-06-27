const User = require('../../models/User');
const Follow = require('../../models/Follow');
const Favorite = require('../../models/Favorite');
const Request = require('../../models/Request');
const { formatEventResponse } = require('../../utils/eventFields');
const { getBookingStatsByUsers } = require('../../utils/bookingStats');
const { getDB } = require('../../config/database');

/**
 * @desc    Get user profile by ID
 * @route   GET /api/users/:id
 * @access  Public (but shows follow status if authenticated)
 * 
 * Supports both sequential userId (1, 2, 3, etc.) and MongoDB ObjectId.
 * For organisers, shows follower count and follow status (if user is authenticated).
 */
const getUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const authenticatedUserId = req.user?.id; // Optional - user may not be logged in

    // Find user by sequential userId or MongoDB ObjectId
    let user = null;
    
    // Check if it's a number (sequential userId)
    if (!isNaN(id) && parseInt(id).toString() === id) {
      user = await User.findByUserId(id);
    }
    
    // If not found by userId, try MongoDB ObjectId
    if (!user) {
      user = await User.findById(id);
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        suggestion: 'Please provide a valid user ID (sequential userId like 5, or MongoDB ObjectId)',
      });
    }

    // Prepare response data (exclude sensitive fields)
    const userResponse = {
      id: user.userId, // Sequential ID (1, 2, 3...)
      userId: user.userId, // Sequential ID for clarity
      mongoId: user._id.toString(), // MongoDB ObjectId (for internal use if needed)
      userType: user.userType,
      email: user.email,
      mobileNumber: user.mobileNumber,
      profilePic: user.profilePic || null, // Always include profilePic field
      isEmailVerified: user.isEmailVerified,
      isMobileVerified: user.isMobileVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    // Add type-specific fields
    if (user.userType === 'player') {
      userResponse.fullName = user.fullName;
      userResponse.dob = user.dob;
      userResponse.gender = user.gender;
      userResponse.sport1 = user.sport1;
      userResponse.sport2 = user.sport2;
      userResponse.sports = user.sports || [];
      userResponse.followingCount = user.followingCount || 0;
    } else if (user.userType === 'organiser') {
      userResponse.fullName = user.fullName;
      userResponse.yourBest = user.yourBest;
      userResponse.communityName = user.communityName;
      userResponse.yourCity = user.yourCity;
      userResponse.sport1 = user.sport1;
      userResponse.sport2 = user.sport2;
      userResponse.sports = user.sports || [];
      userResponse.bio = user.bio;
      userResponse.instagramLink = user.instagramLink || null;
      userResponse.profileVisibility = user.profileVisibility || 'private';
      
      // Run ALL independent queries in parallel (was: 7 sequential awaits)
      const db = getDB();
      const eventsCollection = db.collection('events');
      const joinsCollection = db.collection('eventJoins');
      const organiserId = user._id;
      const organiserIdString = organiserId.toString();

      const [
        followerCount,
        eventsResult,
        isFollowing,
        isRequested,
        favoriteEvents,
        bookingStatsMap,
      ] = await Promise.all([
        Follow.getFollowerCount(user._id.toString()),
        eventsCollection
          .find({ $or: [{ creatorId: organiserId }, { creatorId: organiserIdString }] })
          .project({ _id: 1 })
          .toArray(),
        authenticatedUserId
          ? Follow.isFollowing(authenticatedUserId, user._id.toString())
          : Promise.resolve(false),
        authenticatedUserId
          ? Request.hasPendingRequest(authenticatedUserId, user._id.toString())
          : Promise.resolve(false),
        Favorite.getUserFavorites(user._id, 20, 0),
        getBookingStatsByUsers([user._id]),
      ]);

      userResponse.followersCount = followerCount;

      // Compute totalAttendees from eventsResult (synchronous after the parallel fetch)
      if (eventsResult.length === 0) {
        userResponse.totalAttendees = 0;
      } else {
        const eventIds = eventsResult.map((event) => event._id);
        const distinctUserIds = await joinsCollection.distinct('userId', {
          eventId: { $in: eventIds },
        });
        userResponse.totalAttendees = distinctUserIds.length;
      }

      userResponse.isFollowing = isFollowing;
      userResponse.isRequested = isRequested;

      // Show if organiser can be followed (is public)
      userResponse.canFollow = user.profileVisibility === 'public';

      // Favorite events
      const favoriteEventNames = favoriteEvents
        .map((fav) => fav.event?.eventName || fav.event?.eventTitle)
        .filter(Boolean);
      userResponse.favoriteEvents = favoriteEventNames;
      userResponse.favoriteEventsCount = favoriteEvents.length;

      // Booking stats
      const bookingStats = bookingStatsMap.get(user._id.toString()) || { bookedCount: 0, totalSpent: 0 };
      userResponse.totalBookedEvents = bookingStats.bookedCount;
      userResponse.totalBookingAmount = bookingStats.totalSpent;

    } else {
      // Non-organiser users: simpler path
      const [favoriteEvents, bookingStatsMap] = await Promise.all([
        Favorite.getUserFavorites(user._id, 20, 0),
        getBookingStatsByUsers([user._id]),
      ]);

      const favoriteEventNames = favoriteEvents
        .map((fav) => fav.event?.eventName || fav.event?.eventTitle)
        .filter(Boolean);
      userResponse.favoriteEvents = favoriteEventNames;
      userResponse.favoriteEventsCount = favoriteEvents.length;

      const bookingStats = bookingStatsMap.get(user._id.toString()) || { bookedCount: 0, totalSpent: 0 };
      userResponse.totalBookedEvents = bookingStats.bookedCount;
      userResponse.totalBookingAmount = bookingStats.totalSpent;
    }

    res.status(200).json({
      success: true,
      data: {
        user: userResponse,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getUser,
};

