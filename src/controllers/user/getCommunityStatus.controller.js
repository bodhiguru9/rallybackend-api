const User = require('../../models/User');
const Follow = require('../../models/Follow');
const { getDB } = require('../../config/database');
const { ObjectId } = require('mongodb');

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const buildCommunityId = (organiser) => `Community${organiser.userId}`;

/**
 * @desc    Get community status for logged-in user (joined/requested/none)
 * @route   GET /api/users/community/:communityName/status
 * @access  Private
 */
const getCommunityStatus = async (req, res, next) => {
  try {
    const { communityName } = req.params;

    if (!communityName || communityName.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Community name is required',
      });
    }

    const db = getDB();
    const usersCollection = db.collection('users');
    const organiser = await usersCollection.findOne({
      userType: 'organiser',
      communityName: { $regex: new RegExp(`^${escapeRegex(communityName.trim())}$`, 'i') },
    });

    if (!organiser) {
      return res.status(404).json({
        success: false,
        error: 'Community not found',
        communityName: communityName,
      });
    }

    const isOwner = organiser._id.toString() === req.user.id;
    if (isOwner) {
      return res.status(200).json({
        success: true,
        message: 'Community status retrieved successfully',
        data: {
          community: {
            userId: organiser.userId,
            communityId: buildCommunityId(organiser),
            communityName: organiser.communityName || null,
            fullName: organiser.fullName || null,
            profilePic: organiser.profilePic || null,
            profileVisibility: organiser.profileVisibility || 'private',
          },
          viewerStatus: {
            isJoined: true,
            isRequested: false,
            status: 'joined',
          },
        },
      });
    }

    let viewerStatus = {
      isJoined: false,
      isRequested: false,
      status: 'none',
    };

    if (organiser.profileVisibility !== 'public') {
      const requestsCollection = db.collection('requests');
      const existingRequest = await requestsCollection.findOne({
        userId: new ObjectId(req.user.id),
        organiserId: new ObjectId(organiser._id),
        status: { $in: ['pending', 'accepted'] },
      });
      if (existingRequest?.status === 'accepted') {
        viewerStatus = { isJoined: true, isRequested: false, status: 'joined' };
      } else if (existingRequest?.status === 'pending') {
        viewerStatus = { isJoined: false, isRequested: true, status: 'requested' };
      }
    } else {
      const isFollowing = await Follow.isFollowing(req.user.id, organiser._id);
      viewerStatus = {
        isJoined: isFollowing,
        isRequested: false,
        status: isFollowing ? 'joined' : 'none',
      };
    }

    return res.status(200).json({
      success: true,
      message: 'Community status retrieved successfully',
      data: {
        community: {
          userId: organiser.userId,
          communityId: buildCommunityId(organiser),
          communityName: organiser.communityName || null,
          fullName: organiser.fullName || null,
          profilePic: organiser.profilePic || null,
          profileVisibility: organiser.profileVisibility || 'private',
        },
        viewerStatus,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCommunityStatus,
};
