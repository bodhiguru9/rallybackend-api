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
      
      // Get actual follower count from follows collection
      const followerCount = await Follow.getFollowerCount(user._id.toString());
      userResponse.followersCount = followerCount;
      
      userResponse.eventsCreated = user.eventsCreated || 0;
      userResponse.totalAttendees = user.totalAttendees || 0;
      userResponse.followingCount = user.followingCount || 0;

      try {
        const db = getDB();
        const eventsCollection = db.collection('events');
        const joinsCollection = db.collection('eventJoins');
        const organiserId = user._id;
        const organiserIdString = organiserId.toString();

        const events = await eventsCollection
          .find({ $or: [{ creatorId: organiserId }, { creatorId: organiserIdString }] })
          .project({ _id: 1 })
          .toArray();
        if (events.length === 0) {
          userResponse.totalAttendees = 0;
        } else {
          const eventIds = events.map((event) => event._id);
          const distinctUserIds = await joinsCollection.distinct('userId', {
            eventId: { $in: eventIds },
          });
          userResponse.totalAttendees = distinctUserIds.length;
        }
      } catch (error) {
        // Keep stored totalAttendees if recalculation fails
      }

      // If user is authenticated, check if they are following this organiser
      if (authenticatedUserId) {
        const isFollowing = await Follow.isFollowing(authenticatedUserId, user._id.toString());
        userResponse.isFollowing = isFollowing;

        const isRequested = await Request.hasPendingRequest(authenticatedUserId, user._id.toString());
        userResponse.isRequested = isRequested;
      } else {
        userResponse.isFollowing = false;
        userResponse.isRequested = false;
      }

      // Show if organiser can be followed (is public)
      userResponse.canFollow = user.profileVisibility === 'public';

    }

    // Get favorite events for this user
    const favoriteEvents = await Favorite.getUserFavorites(user._id, 20, 0);
    const favoriteEventNames = favoriteEvents
      .map((fav) => fav.event?.eventName || fav.event?.eventTitle)
      .filter(Boolean);

    userResponse.favoriteEvents = favoriteEventNames;
    userResponse.favoriteEventsCount = favoriteEvents.length;

    const bookingStatsMap = await getBookingStatsByUsers([user._id]);
    const bookingStats = bookingStatsMap.get(user._id.toString()) || { bookedCount: 0, totalSpent: 0 };
    userResponse.totalBookedEvents = bookingStats.bookedCount;
    userResponse.totalBookingAmount = bookingStats.totalSpent;

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

