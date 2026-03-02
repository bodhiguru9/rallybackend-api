const Follow = require('../../models/Follow');
const User = require('../../models/User');
const Notification = require('../../models/Notification');
const { getPaginationParams, createPaginationResponse } = require('../../utils/pagination');
const { getDB } = require('../../config/database');
const { ObjectId } = require('mongodb');

/**
 * @desc    Subscribe/Follow a public organiser
 * @route   POST /api/follow/:organiserId
 * @access  Private
 */
const followOrganiser = async (req, res, next) => {
  try {
    const { organiserId } = req.params;
    const followerId = req.user.id;

    // Check if organiser exists and is public
    // Try to find by sequential userId first, then by MongoDB ObjectId
    let organiser = null;
    
    // Check if it's a number (sequential userId)
    if (!isNaN(organiserId) && parseInt(organiserId).toString() === organiserId) {
      organiser = await User.findByUserId(organiserId);
    }
    
    // If not found by userId, try MongoDB ObjectId
    if (!organiser) {
      organiser = await User.findById(organiserId);
    }
    
    if (!organiser) {
      return res.status(404).json({
        success: false,
        error: 'Organiser not found',
        suggestion: 'Please provide a valid organiser ID (sequential userId like 5, or MongoDB ObjectId)',
      });
    }

    if (organiser.userType !== 'organiser') {
      return res.status(400).json({
        success: false,
        error: 'User is not an organiser',
      });
    }

    if (organiser.profileVisibility === 'private') {
      return res.status(400).json({
        success: false,
        error: 'Cannot follow private organiser. Please send a join request instead.',
      });
    }

    // Use MongoDB ObjectId for Follow operations
    const organiserMongoId = organiser._id.toString();

    // Check if already following
    const isFollowing = await Follow.isFollowing(followerId, organiserMongoId);
    if (isFollowing) {
      return res.status(400).json({
        success: false,
        error: 'Already following this organiser',
      });
    }

    // Create follow relationship (use MongoDB ObjectId)
    await Follow.create(followerId, organiserMongoId);

    // Create notification for organizer
    try {
      const follower = await User.findById(followerId);
      await Notification.create(
        organiserMongoId,
        'organiser_follow',
        'New Follower',
        `${follower?.fullName || 'A player'} has subscribed to your profile`,
        {
          userId: followerId,
        }
      );
    } catch (error) {
      // Don't fail the request if notification creation fails
      console.error('Error creating notification:', error);
    }

    // Get updated counts (use MongoDB ObjectId)
    const followerCount = await Follow.getFollowerCount(organiserMongoId);
    const followingCount = await Follow.getFollowingCount(followerId);

    // Update organiser's followersCount in database
    await Follow.updateFollowerCount(organiserMongoId, 0); // Sync count

    res.status(200).json({
      success: true,
      message: 'Successfully followed organiser',
      data: {
        organiser: {
          userId: organiser.userId,
          fullName: organiser.fullName,
          profileVisibility: organiser.profileVisibility,
        },
        followerCount,
        followingCount,
        isFollowing: true,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Unsubscribe/Unfollow an organiser
 * @route   DELETE /api/follow/:organiserId
 * @access  Private
 */
const unfollowOrganiser = async (req, res, next) => {
  try {
    const { organiserId } = req.params;
    const followerId = req.user.id;

    // Find organiser by sequential userId or MongoDB ObjectId
    let organiser = null;
    
    // Check if it's a number (sequential userId)
    if (!isNaN(organiserId) && parseInt(organiserId).toString() === organiserId) {
      organiser = await User.findByUserId(organiserId);
    }
    
    // If not found by userId, try MongoDB ObjectId
    if (!organiser) {
      organiser = await User.findById(organiserId);
    }
    
    if (!organiser) {
      return res.status(404).json({
        success: false,
        error: 'Organiser not found',
        suggestion: 'Please provide a valid organiser ID (sequential userId like 5, or MongoDB ObjectId)',
      });
    }

    // Use MongoDB ObjectId for Follow operations
    const organiserMongoId = organiser._id.toString();

    // Remove follow relationship
    const removed = await Follow.remove(followerId, organiserMongoId);

    if (!removed) {
      return res.status(400).json({
        success: false,
        error: 'Not following this organiser',
      });
    }

    // Get updated counts (use MongoDB ObjectId)
    const followerCount = await Follow.getFollowerCount(organiserMongoId);
    const followingCount = await Follow.getFollowingCount(followerId);

    // Update organiser's followersCount in database
    await Follow.updateFollowerCount(organiserMongoId, 0); // Sync count

    res.status(200).json({
      success: true,
      message: 'Successfully unfollowed organiser',
      data: {
        organiser: {
          userId: organiser.userId,
          fullName: organiser.fullName,
          profileVisibility: organiser.profileVisibility,
        },
        followerCount,
        followingCount,
        isFollowing: false,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get followers of an organiser
 * @route   GET /api/follow/:organiserId/followers?page=1
 * @access  Public
 * 
 * Uses page-based pagination: 20 items per page
 * Query parameter: page (default: 1)
 */
const getFollowers = async (req, res, next) => {
  try {
    const { organiserId } = req.params;
    const { page, perPage, skip } = getPaginationParams(req.query.page, 20);

    // Find organiser by sequential userId or MongoDB ObjectId
    let organiser = null;
    
    // Check if it's a number (sequential userId)
    if (!isNaN(organiserId) && parseInt(organiserId).toString() === organiserId) {
      organiser = await User.findByUserId(organiserId);
    }
    
    // If not found by userId, try MongoDB ObjectId
    if (!organiser) {
      organiser = await User.findById(organiserId);
    }

    if (!organiser) {
      return res.status(404).json({
        success: false,
        error: 'Organiser not found',
        suggestion: 'Please provide a valid organiser ID (sequential userId like 5, or MongoDB ObjectId)',
      });
    }

    if (organiser.userType !== 'organiser') {
      return res.status(400).json({
        success: false,
        error: 'User is not an organiser',
      });
    }

    // Use MongoDB ObjectId for Follow operations
    const organiserMongoId = organiser._id.toString();

    const followers = await Follow.getFollowers(organiserMongoId, perPage, skip);
    const totalCount = await Follow.getFollowerCount(organiserMongoId);
    const pagination = createPaginationResponse(totalCount, page, perPage);

    res.status(200).json({
      success: true,
      data: {
        organiser: {
          userId: organiser.userId,
          fullName: organiser.fullName,
          profileVisibility: organiser.profileVisibility || 'private',
        },
        followers,
        pagination,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get users that a person is following
 * @route   GET /api/follow/:userId/following?page=1
 * @access  Public
 * 
 * Returns list of organisers that the user is following with complete organizer data
 * (same data structure as /api/users/organisers/all)
 * Uses page-based pagination: 20 items per page
 * Query parameter: page (default: 1)
 * Supports both sequential userId and MongoDB ObjectId
 */
const getFollowing = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { page, perPage, skip } = getPaginationParams(req.query.page, 20);
    const authenticatedUserId = req.user?.id; // Optional - for isFollowing status

    // Find user by sequential userId or MongoDB ObjectId
    let user = null;
    
    // Check if it's a number (sequential userId)
    if (!isNaN(userId) && parseInt(userId).toString() === userId) {
      user = await User.findByUserId(userId);
    }
    
    // If not found by userId, try MongoDB ObjectId
    if (!user) {
      user = await User.findById(userId);
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        suggestion: 'Please provide a valid user ID (sequential userId like 5, or MongoDB ObjectId)',
      });
    }

    // Use MongoDB ObjectId for Follow operations
    const userMongoId = user._id.toString();

    // Get following organizers with full details
    const db = getDB();
    const followsCollection = db.collection('follows');
    const usersCollection = db.collection('users');

    // Get all follows for this user
    const follows = await followsCollection
      .find({ followerId: new ObjectId(userMongoId) })
      .sort({ createdAt: -1 })
      .toArray();
    const followingIds = follows.map((f) => f.followingId);

    
    if (followingIds.length === 0) {
      const pagination = createPaginationResponse(0, page, perPage);
      return res.status(200).json({
        success: true,
        message: 'Following organisers retrieved successfully',
        data: {
          user: {
            userId: user.userId,
            fullName: user.fullName,
          },
          organisers: [],
          pagination,
        },
      });
    }

    // Get all following organizers
    const followingOrganisers = await usersCollection
      .find({ _id: { $in: followingIds }, userType: 'organiser' })
      .toArray();

    // Get authenticated user's following list (if logged in) for isFollowing status
    let authenticatedUserFollowingIds = new Set();
    if (authenticatedUserId && authenticatedUserId !== userMongoId) {
      const authUserFollows = await followsCollection
        .find({ followerId: new ObjectId(authenticatedUserId) })
        .toArray();
      authenticatedUserFollowingIds = new Set(
        authUserFollows.map(f => f.followingId.toString())
      );
    } else if (authenticatedUserId === userMongoId) {
      // If viewing own following list, all are following
      authenticatedUserFollowingIds = new Set(followingIds.map(id => id.toString()));
    }

    // Format organisers with complete data (same as getAllOrganisers)
    const organisersList = await Promise.all(
      followingOrganisers.map(async (organiser) => {
        const organiserId = organiser._id.toString();
        
        // Get actual follower count from follows collection
        const followerCount = await Follow.getFollowerCount(organiserId);

        const organiserData = {
          id: organiser.userId,
          userId: organiser.userId,
          mongoId: organiserId,
          userType: organiser.userType,
          email: organiser.email,
          mobileNumber: organiser.mobileNumber,
          profilePic: organiser.profilePic || null,
          isEmailVerified: organiser.isEmailVerified || false,
          isMobileVerified: organiser.isMobileVerified || false,
          fullName: organiser.fullName,
          yourBest: organiser.yourBest,
          communityName: organiser.communityName,
          yourCity: organiser.yourCity,
          sport1: organiser.sport1,
          sport2: organiser.sport2,
          sports: organiser.sports || [],
          bio: organiser.bio,
          instagramLink: organiser.instagramLink || null,
          profileVisibility: organiser.profileVisibility || 'private',
          followersCount: followerCount,
          eventsCreated: organiser.eventsCreated || 0,
          totalAttendees: organiser.totalAttendees || 0,
          followingCount: organiser.followingCount || 0,
          createdAt: organiser.createdAt,
          updatedAt: organiser.updatedAt,
        };

        // Add following status
        if (authenticatedUserId) {
          const isFollowing = authenticatedUserFollowingIds.has(organiserId);
          organiserData.isFollowing = isFollowing;
          organiserData.canFollow = organiser.profileVisibility === 'public';
        } else {
          // If viewing someone else's following list without auth, show as not following
          organiserData.isFollowing = false;
          organiserData.canFollow = organiser.profileVisibility === 'public';
        }

        return organiserData;
      })
    );

    // Apply pagination
    const totalCount = organisersList.length;
    const paginatedOrganisers = organisersList.slice(skip, skip + perPage);
    const pagination = createPaginationResponse(totalCount, page, perPage);

    res.status(200).json({
      success: true,
      message: 'Following organisers retrieved successfully',
      data: {
        user: {
          userId: user.userId,
          fullName: user.fullName,
        },
        organisers: paginatedOrganisers,
        pagination,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Check if user is following organiser
 * @route   GET /api/follow/:organiserId/status
 * @access  Private
 */
const getFollowStatus = async (req, res, next) => {
  try {
    const { organiserId } = req.params;
    const userId = req.user.id;

    // Find organiser by sequential userId or MongoDB ObjectId
    let organiser = null;
    
    // Check if it's a number (sequential userId)
    if (!isNaN(organiserId) && parseInt(organiserId).toString() === organiserId) {
      organiser = await User.findByUserId(organiserId);
    }
    
    // If not found by userId, try MongoDB ObjectId
    if (!organiser) {
      organiser = await User.findById(organiserId);
    }
    
    if (!organiser) {
      return res.status(404).json({
        success: false,
        error: 'Organiser not found',
        suggestion: 'Please provide a valid organiser ID (sequential userId like 5, or MongoDB ObjectId)',
      });
    }

    // Use MongoDB ObjectId for Follow operations
    const organiserMongoId = organiser._id.toString();

    const isFollowing = await Follow.isFollowing(userId, organiserMongoId);

    res.status(200).json({
      success: true,
      data: {
        isFollowing,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get followers list of logged-in user (public organiser only)
 * @route   GET /api/follow/me/followers?page=1
 * @access  Private
 * 
 * Automatically detects the logged-in user and returns their followers list.
 * Only works if the logged-in user is a public organiser.
 * Uses page-based pagination: 20 items per page
 * Query parameter: page (default: 1)
 */
const getMyFollowers = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { page, perPage, skip } = getPaginationParams(req.query.page, 20);

    // Get the logged-in user
    const organiser = await User.findById(userId);

    if (!organiser) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    if (organiser.userType !== 'organiser') {
      return res.status(400).json({
        success: false,
        error: 'User is not an organiser',
      });
    }

    if (organiser.profileVisibility !== 'public') {
      return res.status(400).json({
        success: false,
        error: 'This endpoint is only available for public organisers',
      });
    }

    // Use MongoDB ObjectId for Follow operations
    const organiserMongoId = organiser._id.toString();

    const followers = await Follow.getFollowers(organiserMongoId, perPage, skip);
    const totalCount = await Follow.getFollowerCount(organiserMongoId);
    const pagination = createPaginationResponse(totalCount, page, perPage);

    res.status(200).json({
      success: true,
      data: {
        organiser: {
          userId: organiser.userId,
          fullName: organiser.fullName,
          profileVisibility: organiser.profileVisibility,
        },
        followers,
        totalCount,
        pagination,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get following list of logged-in user
 * @route   GET /api/follow/me/following?page=1
 * @access  Private
 * 
 * Automatically detects the logged-in user and returns their following list
 * with complete organizer data (same data structure as /api/users/organisers/all)
 * Uses page-based pagination: 20 items per page
 * Query parameter: page (default: 1)
 */
const getMyFollowing = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { page, perPage, skip } = getPaginationParams(req.query.page, 20);

    // Get the logged-in user
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Use MongoDB ObjectId for Follow operations
    const userMongoId = user._id.toString();

    // Get all follows for this user
    const db = getDB();
    const followsCollection = db.collection('follows');
    const usersCollection = db.collection('users');

    const follows = await followsCollection
      .find({ followerId: new ObjectId(userMongoId) })
      .sort({ createdAt: -1 })
      .toArray();

    const followingIds = follows.map((f) => f.followingId);

    if (followingIds.length === 0) {
      const pagination = createPaginationResponse(0, page, perPage);
      return res.status(200).json({
        success: true,
        message: 'Following organisers retrieved successfully',
        data: {
          organisers: [],
          pagination,
        },
      });
    }

    // Get all following organizers
    const followingOrganisers = await usersCollection
      .find({ _id: { $in: followingIds }, userType: 'organiser' })
      .toArray();

    // All organizers in this list are being followed by the logged-in user
    const authenticatedUserFollowingIds = new Set(followingIds.map(id => id.toString()));

    // Format organisers with complete data (same as getAllOrganisers)
    const organisersList = await Promise.all(
      followingOrganisers.map(async (organiser) => {
        const organiserId = organiser._id.toString();
        
        // Get actual follower count from follows collection
        const followerCount = await Follow.getFollowerCount(organiserId);

        const organiserData = {
          id: organiser.userId,
          userId: organiser.userId,
          mongoId: organiserId,
          userType: organiser.userType,
          email: organiser.email,
          mobileNumber: organiser.mobileNumber,
          profilePic: organiser.profilePic || null,
          isEmailVerified: organiser.isEmailVerified || false,
          isMobileVerified: organiser.isMobileVerified || false,
          fullName: organiser.fullName,
          yourBest: organiser.yourBest,
          communityName: organiser.communityName,
          yourCity: organiser.yourCity,
          sport1: organiser.sport1,
          sport2: organiser.sport2,
          sports: organiser.sports || [],
          bio: organiser.bio,
          instagramLink: organiser.instagramLink || null,
          profileVisibility: organiser.profileVisibility || 'private',
          followersCount: followerCount,
          eventsCreated: organiser.eventsCreated || 0,
          totalAttendees: organiser.totalAttendees || 0,
          followingCount: organiser.followingCount || 0,
          createdAt: organiser.createdAt,
          updatedAt: organiser.updatedAt,
        };

        // All organizers in this list are being followed
        const isFollowing = authenticatedUserFollowingIds.has(organiserId);
        organiserData.isFollowing = isFollowing;
        organiserData.canFollow = organiser.profileVisibility === 'public';

        return organiserData;
      })
    );

    // Apply pagination
    const totalCount = organisersList.length;
    const paginatedOrganisers = organisersList.slice(skip, skip + perPage);
    const pagination = createPaginationResponse(totalCount, page, perPage);

    res.status(200).json({
      success: true,
      message: 'Following organisers retrieved successfully',
      data: {
        organisers: paginatedOrganisers,
        pagination,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  followOrganiser,
  unfollowOrganiser,
  getFollowers,
  getFollowing,
  getFollowStatus,
  getMyFollowers,
  getMyFollowing,
};

