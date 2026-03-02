const User = require('../../models/User');
const Follow = require('../../models/Follow');
const { getPaginationParams, createPaginationResponse } = require('../../utils/pagination');
const { getDB } = require('../../config/database');
const { ObjectId } = require('mongodb');

/**
 * @desc    Get all organisers list with following status
 * @route   GET /api/users/organisers/all
 * @access  Public (optional auth for following status)
 * 
 * Returns list of all organisers:
 * - If user is logged in:
 *   - First: organisers they follow (including private ones they follow)
 *   - Then: public organisers they don't follow
 * - If user is not logged in:
 *   - Only public organisers
 * 
 * Uses page-based pagination: 20 items per page
 * Query parameter: page (default: 1)
 */
const getAllOrganisers = async (req, res, next) => {
  try {
    const { page, perPage, skip } = getPaginationParams(req.query.page, 20);
    const authenticatedUserId = req.user?.id; // Optional - user may not be logged in

    const db = getDB();
    const usersCollection = db.collection('users');
    const followsCollection = db.collection('follows');

    // Get all organisers
    let allOrganisers = await usersCollection
      .find({ userType: 'organiser' })
      .sort({ createdAt: -1 }) // Newest first
      .toArray();

    // If user is logged in, separate into following and not following
    let followingOrganisers = [];
    let notFollowingOrganisers = [];
    let followingOrganiserIds = new Set();

    if (authenticatedUserId) {
      // Get all organisers the user is following
      const userObjectId = new ObjectId(authenticatedUserId);
      const follows = await followsCollection
        .find({ followerId: userObjectId })
        .toArray();

      followingOrganiserIds = new Set(
        follows.map(f => f.followingId.toString())
      );

      // Separate organisers
      allOrganisers.forEach(organiser => {
        const organiserId = organiser._id.toString();
        const isFollowing = followingOrganiserIds.has(organiserId);
        
        if (isFollowing) {
          // User is following this organiser (can be public or private)
          followingOrganisers.push(organiser);
        } else {
          // User is not following - only show public organisers
          if (organiser.profileVisibility === 'public') {
            notFollowingOrganisers.push(organiser);
          }
        }
      });

      // Combine: following first, then not following
      allOrganisers = [...followingOrganisers, ...notFollowingOrganisers];
    } else {
      // User is not logged in - only show public organisers
      allOrganisers = allOrganisers.filter(
        organiser => organiser.profileVisibility === 'public'
      );
    }

    // Apply pagination
    const totalCount = allOrganisers.length;
    const paginatedOrganisers = allOrganisers.slice(skip, skip + perPage);

    // Format organisers with their details
    const organisersList = await Promise.all(
      paginatedOrganisers.map(async (organiser) => {
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

        // Add following status if user is logged in
        if (authenticatedUserId) {
          const isFollowing = followingOrganiserIds.has(organiserId);
          organiserData.isFollowing = isFollowing;
          organiserData.canFollow = organiser.profileVisibility === 'public';
        } else {
          organiserData.isFollowing = false;
          organiserData.canFollow = organiser.profileVisibility === 'public';
        }

        return organiserData;
      })
    );

    const pagination = createPaginationResponse(totalCount, page, perPage);

    res.status(200).json({
      success: true,
      message: 'Organisers retrieved successfully',
      data: {
        organisers: organisersList,
        pagination,
        summary: {
          totalOrganisers: totalCount,
          followingCount: authenticatedUserId ? followingOrganisers.length : 0,
          notFollowingCount: authenticatedUserId ? notFollowingOrganisers.length : totalCount,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllOrganisers,
};
