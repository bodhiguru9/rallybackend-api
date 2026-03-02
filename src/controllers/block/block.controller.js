const Block = require('../../models/Block');
const User = require('../../models/User');
const { getPaginationParams, createPaginationResponse } = require('../../utils/pagination');

/**
 * Helper function to find user by sequential userId or MongoDB ObjectId
 */
const findUserById = async (userId) => {
  let user = null;
  
  // Check if it's a number (sequential userId)
  if (!isNaN(userId) && parseInt(userId).toString() === userId) {
    user = await User.findByUserId(userId);
  }
  
  // If not found by userId, try MongoDB ObjectId
  if (!user) {
    user = await User.findById(userId);
  }
  
  return user;
};

/**
 * @desc    Block a user (player or organiser)
 * @route   POST /api/block/:userId
 * @access  Private
 */
const blockUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const blockerId = req.user.id;

    // Find user to block
    const userToBlock = await findUserById(userId);

    if (!userToBlock) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        suggestion: 'Please provide a valid user ID (sequential userId like 5, or MongoDB ObjectId)',
      });
    }

    // Check if trying to block yourself
    const blockerMongoId = typeof blockerId === 'string' ? blockerId : blockerId.toString();
    const blockedMongoId = userToBlock._id.toString();

    if (blockerMongoId === blockedMongoId) {
      return res.status(400).json({
        success: false,
        error: 'Cannot block yourself',
      });
    }

    // Use MongoDB ObjectId for Block operations
    const userToBlockMongoId = userToBlock._id.toString();

    // Check if already blocked
    const isAlreadyBlocked = await Block.isBlocked(blockerId, userToBlockMongoId);
    if (isAlreadyBlocked) {
      return res.status(400).json({
        success: false,
        error: 'User is already blocked',
      });
    }

    // Create block relationship
    await Block.create(blockerId, userToBlockMongoId);

    // Get updated counts
    const blockedCount = await Block.getBlockedCount(blockerId);

    res.status(200).json({
      success: true,
      message: 'User blocked successfully',
      data: {
        blockedUser: {
          userId: userToBlock.userId,
          userType: userToBlock.userType,
          fullName: userToBlock.fullName,
          ...(userToBlock.userType === 'organiser' && {
            communityName: userToBlock.communityName,
          }),
        },
        blockedCount,
        isBlocked: true,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Unblock a user (player or organiser)
 * @route   DELETE /api/block/:userId
 * @access  Private
 */
const unblockUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const blockerId = req.user.id;

    // Find user to unblock
    const userToUnblock = await findUserById(userId);

    if (!userToUnblock) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        suggestion: 'Please provide a valid user ID (sequential userId like 5, or MongoDB ObjectId)',
      });
    }

    // Use MongoDB ObjectId for Block operations
    const userToUnblockMongoId = userToUnblock._id.toString();

    // Remove block relationship
    const removed = await Block.remove(blockerId, userToUnblockMongoId);

    if (!removed) {
      return res.status(400).json({
        success: false,
        error: 'User is not blocked',
      });
    }

    // Get updated counts
    const blockedCount = await Block.getBlockedCount(blockerId);

    res.status(200).json({
      success: true,
      message: 'User unblocked successfully',
      data: {
        unblockedUser: {
          userId: userToUnblock.userId,
          userType: userToUnblock.userType,
          fullName: userToUnblock.fullName,
          ...(userToUnblock.userType === 'organiser' && {
            communityName: userToUnblock.communityName,
          }),
        },
        blockedCount,
        isBlocked: false,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get list of users blocked by the logged-in user
 * @route   GET /api/block/blocked?page=1
 * @access  Private
 * 
 * Uses page-based pagination: 20 items per page
 * Query parameter: page (default: 1)
 */
const getBlockedUsers = async (req, res, next) => {
  try {
    const blockerId = req.user.id;
    const { page, perPage, skip } = getPaginationParams(req.query.page, 20);

    const blockedUsers = await Block.getBlockedUsers(blockerId, perPage, skip);
    const totalCount = await Block.getBlockedCount(blockerId);
    const pagination = createPaginationResponse(totalCount, page, perPage);

    res.status(200).json({
      success: true,
      data: {
        blockedUsers,
        totalCount,
        pagination,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get list of users who blocked the logged-in user
 * @route   GET /api/block/blocked-by?page=1
 * @access  Private
 * 
 * Uses page-based pagination: 20 items per page
 * Query parameter: page (default: 1)
 */
const getBlockedByUsers = async (req, res, next) => {
  try {
    const blockedId = req.user.id;
    const { page, perPage, skip } = getPaginationParams(req.query.page, 20);

    const blockedByUsers = await Block.getBlockedByUsers(blockedId, perPage, skip);
    const totalCount = await Block.getBlockedByCount(blockedId);
    const pagination = createPaginationResponse(totalCount, page, perPage);

    res.status(200).json({
      success: true,
      data: {
        blockedByUsers,
        totalCount,
        pagination,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Check if a user is blocked by the logged-in user
 * @route   GET /api/block/:userId/status
 * @access  Private
 */
const getBlockStatus = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const blockerId = req.user.id;

    // Find user to check
    const userToCheck = await findUserById(userId);

    if (!userToCheck) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        suggestion: 'Please provide a valid user ID (sequential userId like 5, or MongoDB ObjectId)',
      });
    }

    // Use MongoDB ObjectId for Block operations
    const userToCheckMongoId = userToCheck._id.toString();

    // Get block details including when it was blocked
    const blockDetails = await Block.getBlockDetails(blockerId, userToCheckMongoId);
    const isBlocked = !!blockDetails;

    res.status(200).json({
      success: true,
      data: {
        isBlocked,
        ...(isBlocked && {
          blockedAt: blockDetails.createdAt,
          blockedSince: blockDetails.createdAt,
          blockedDate: blockDetails.createdAt.toISOString().split('T')[0], // YYYY-MM-DD format
          blockedTimestamp: blockDetails.createdAt.getTime(), // Unix timestamp in milliseconds
        }),
        user: {
          userId: userToCheck.userId,
          userType: userToCheck.userType,
          fullName: userToCheck.fullName,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Check if there's a bidirectional block between logged-in user and another user
 * @route   GET /api/block/:userId/bidirectional-status
 * @access  Private
 */
const getBidirectionalBlockStatus = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;

    // Find user to check
    const userToCheck = await findUserById(userId);

    if (!userToCheck) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        suggestion: 'Please provide a valid user ID (sequential userId like 5, or MongoDB ObjectId)',
      });
    }

    // Use MongoDB ObjectId for Block operations
    const userToCheckMongoId = userToCheck._id.toString();

    const isBlockedBidirectional = await Block.isBlockedBidirectional(currentUserId, userToCheckMongoId);
    
    // Get individual block statuses
    const currentUserBlocked = await Block.isBlocked(currentUserId, userToCheckMongoId);
    const otherUserBlocked = await Block.isBlocked(userToCheckMongoId, currentUserId);

    res.status(200).json({
      success: true,
      data: {
        isBlockedBidirectional,
        currentUserBlocked,
        otherUserBlocked,
        user: {
          userId: userToCheck.userId,
          userType: userToCheck.userType,
          fullName: userToCheck.fullName,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  blockUser,
  unblockUser,
  getBlockedUsers,
  getBlockedByUsers,
  getBlockStatus,
  getBidirectionalBlockStatus,
};

