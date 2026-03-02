const { getDB } = require('../config/database');
const { ObjectId } = require('mongodb');

/**
 * Block Model
 * Handles block/unblock relationships between users (players and organisers)
 * Optimized with proper indexing and efficient queries
 */
class Block {
  /**
   * Create a block relationship
   * @param {string|ObjectId} blockerId - User who is blocking
   * @param {string|ObjectId} blockedId - User who is being blocked
   */
  static async create(blockerId, blockedId) {
    const db = getDB();
    const blocksCollection = db.collection('blocks');

    // Convert to ObjectId if string
    const blockerObjectId = typeof blockerId === 'string' ? new ObjectId(blockerId) : blockerId;
    const blockedObjectId = typeof blockedId === 'string' ? new ObjectId(blockedId) : blockedId;

    // Check if already blocked
    const existing = await blocksCollection.findOne({
      blockerId: blockerObjectId,
      blockedId: blockedObjectId,
    });

    if (existing) {
      throw new Error('User is already blocked');
    }

    const now = new Date();
    const result = await blocksCollection.insertOne({
      blockerId: blockerObjectId,
      blockedId: blockedObjectId,
      createdAt: now,
    });

    // Remove any follow relationships if they exist (bidirectional cleanup)
    await this._removeFollowRelationships(blockerId, blockedId);

    return result.insertedId;
  }

  /**
   * Remove a block relationship
   * @param {string|ObjectId} blockerId - User who blocked
   * @param {string|ObjectId} blockedId - User who was blocked
   */
  static async remove(blockerId, blockedId) {
    const db = getDB();
    const blocksCollection = db.collection('blocks');

    const blockerObjectId = typeof blockerId === 'string' ? new ObjectId(blockerId) : blockerId;
    const blockedObjectId = typeof blockedId === 'string' ? new ObjectId(blockedId) : blockedId;

    const result = await blocksCollection.deleteOne({
      blockerId: blockerObjectId,
      blockedId: blockedObjectId,
    });

    return result.deletedCount > 0;
  }

  /**
   * Check if user is blocked by another user
   * @param {string|ObjectId} blockerId - User who might have blocked
   * @param {string|ObjectId} blockedId - User who might be blocked
   */
  static async isBlocked(blockerId, blockedId) {
    const db = getDB();
    const blocksCollection = db.collection('blocks');

    const blockerObjectId = typeof blockerId === 'string' ? new ObjectId(blockerId) : blockerId;
    const blockedObjectId = typeof blockedId === 'string' ? new ObjectId(blockedId) : blockedId;

    const block = await blocksCollection.findOne({
      blockerId: blockerObjectId,
      blockedId: blockedObjectId,
    });

    return !!block;
  }

  /**
   * Get block details including when the user was blocked
   * @param {string|ObjectId} blockerId - User who might have blocked
   * @param {string|ObjectId} blockedId - User who might be blocked
   * @returns {Object|null} Block document with createdAt or null if not blocked
   */
  static async getBlockDetails(blockerId, blockedId) {
    const db = getDB();
    const blocksCollection = db.collection('blocks');

    const blockerObjectId = typeof blockerId === 'string' ? new ObjectId(blockerId) : blockerId;
    const blockedObjectId = typeof blockedId === 'string' ? new ObjectId(blockedId) : blockedId;

    const block = await blocksCollection.findOne({
      blockerId: blockerObjectId,
      blockedId: blockedObjectId,
    });

    return block;
  }

  /**
   * Check if there's a bidirectional block (either user blocked the other)
   * @param {string|ObjectId} userId1 - First user
   * @param {string|ObjectId} userId2 - Second user
   */
  static async isBlockedBidirectional(userId1, userId2) {
    const db = getDB();
    const blocksCollection = db.collection('blocks');

    const user1ObjectId = typeof userId1 === 'string' ? new ObjectId(userId1) : userId1;
    const user2ObjectId = typeof userId2 === 'string' ? new ObjectId(userId2) : userId2;

    const block = await blocksCollection.findOne({
      $or: [
        { blockerId: user1ObjectId, blockedId: user2ObjectId },
        { blockerId: user2ObjectId, blockedId: user1ObjectId },
      ],
    });

    return !!block;
  }

  /**
   * Get list of users blocked by a user
   * @param {string|ObjectId} blockerId - User who blocked others
   * @param {number} limit - Maximum number of results
   * @param {number} skip - Number of results to skip
   */
  static async getBlockedUsers(blockerId, limit = 50, skip = 0) {
    const db = getDB();
    const blocksCollection = db.collection('blocks');
    const usersCollection = db.collection('users');

    const blockerObjectId = typeof blockerId === 'string' ? new ObjectId(blockerId) : blockerId;

    const blocks = await blocksCollection
      .find({ blockerId: blockerObjectId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .toArray();

    const blockedIds = blocks.map((b) => b.blockedId);

    if (blockedIds.length === 0) {
      return [];
    }

    const blockedUsers = await usersCollection
      .find({ _id: { $in: blockedIds } })
      .toArray();

    return blockedUsers.map((user) => ({
      userId: user.userId,
      userType: user.userType,
      email: user.email,
      mobileNumber: user.mobileNumber,
      profilePic: user.profilePic,
      ...(user.userType === 'player' && {
        fullName: user.fullName,
        dob: user.dob,
        gender: user.gender,
        sport1: user.sport1,
        sport2: user.sport2,
      }),
      ...(user.userType === 'organiser' && {
        fullName: user.fullName,
        communityName: user.communityName,
        yourCity: user.yourCity,
        profileVisibility: user.profileVisibility,
      }),
      blockedAt: blocks.find((b) => b.blockedId.toString() === user._id.toString())?.createdAt,
    }));
  }

  /**
   * Get list of users who blocked a user
   * @param {string|ObjectId} blockedId - User who was blocked
   * @param {number} limit - Maximum number of results
   * @param {number} skip - Number of results to skip
   */
  static async getBlockedByUsers(blockedId, limit = 50, skip = 0) {
    const db = getDB();
    const blocksCollection = db.collection('blocks');
    const usersCollection = db.collection('users');

    const blockedObjectId = typeof blockedId === 'string' ? new ObjectId(blockedId) : blockedId;

    const blocks = await blocksCollection
      .find({ blockedId: blockedObjectId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .toArray();

    const blockerIds = blocks.map((b) => b.blockerId);

    if (blockerIds.length === 0) {
      return [];
    }

    const blockerUsers = await usersCollection
      .find({ _id: { $in: blockerIds } })
      .toArray();

    return blockerUsers.map((user) => ({
      userId: user.userId,
      userType: user.userType,
      email: user.email,
      mobileNumber: user.mobileNumber,
      profilePic: user.profilePic,
      ...(user.userType === 'player' && {
        fullName: user.fullName,
        dob: user.dob,
        gender: user.gender,
        sport1: user.sport1,
        sport2: user.sport2,
      }),
      ...(user.userType === 'organiser' && {
        fullName: user.fullName,
        communityName: user.communityName,
        yourCity: user.yourCity,
        profileVisibility: user.profileVisibility,
      }),
      blockedAt: blocks.find((b) => b.blockerId.toString() === user._id.toString())?.createdAt,
    }));
  }

  /**
   * Get count of users blocked by a user
   * @param {string|ObjectId} blockerId - User who blocked others
   */
  static async getBlockedCount(blockerId) {
    const db = getDB();
    const blocksCollection = db.collection('blocks');

    const blockerObjectId = typeof blockerId === 'string' ? new ObjectId(blockerId) : blockerId;

    return await blocksCollection.countDocuments({ blockerId: blockerObjectId });
  }

  /**
   * Get count of users who blocked a user
   * @param {string|ObjectId} blockedId - User who was blocked
   */
  static async getBlockedByCount(blockedId) {
    const db = getDB();
    const blocksCollection = db.collection('blocks');

    const blockedObjectId = typeof blockedId === 'string' ? new ObjectId(blockedId) : blockedId;

    return await blocksCollection.countDocuments({ blockedId: blockedObjectId });
  }

  /**
   * Remove follow relationships when blocking (optimization)
   * @private
   */
  static async _removeFollowRelationships(blockerId, blockedId) {
    try {
      const Follow = require('./Follow');
      const db = getDB();
      const followsCollection = db.collection('follows');

      const blockerObjectId = typeof blockerId === 'string' ? new ObjectId(blockerId) : blockerId;
      const blockedObjectId = typeof blockedId === 'string' ? new ObjectId(blockedId) : blockedId;

      // Check for existing follow relationships before deletion
      const existingFollows = await followsCollection.find({
        $or: [
          { followerId: blockerObjectId, followingId: blockedObjectId },
          { followerId: blockedObjectId, followingId: blockerObjectId },
        ],
      }).toArray();

      // Remove follow relationships in both directions
      const deleteResult = await followsCollection.deleteMany({
        $or: [
          { followerId: blockerObjectId, followingId: blockedObjectId },
          { followerId: blockedObjectId, followingId: blockerObjectId },
        ],
      });

      // Update counts if any relationships were removed
      if (deleteResult.deletedCount > 0) {
        // Check which direction the follows were in
        const blockerFollowsBlocked = existingFollows.some(
          f => f.followerId.toString() === blockerObjectId.toString() && 
               f.followingId.toString() === blockedObjectId.toString()
        );
        const blockedFollowsBlocker = existingFollows.some(
          f => f.followerId.toString() === blockedObjectId.toString() && 
               f.followingId.toString() === blockerObjectId.toString()
        );

        if (blockerFollowsBlocked) {
          await Follow.updateFollowerCount(blockedId, -1);
          await Follow.updateFollowingCount(blockerId, -1);
        }
        if (blockedFollowsBlocker) {
          await Follow.updateFollowerCount(blockerId, -1);
          await Follow.updateFollowingCount(blockedId, -1);
        }
      }
    } catch (error) {
      // Silently fail if Follow model is not available or other errors
      console.error('Error removing follow relationships:', error.message);
    }
  }

  /**
   * Create indexes for optimization (should be called during app initialization)
   */
  static async createIndexes() {
    const db = getDB();
    const blocksCollection = db.collection('blocks');

    // Create compound index for blockerId and blockedId queries
    await blocksCollection.createIndex({ blockerId: 1, blockedId: 1 }, { unique: true });
    
    // Create index for blockedId queries (to find who blocked a user)
    await blocksCollection.createIndex({ blockedId: 1 });
    
    // Create index for createdAt (for sorting)
    await blocksCollection.createIndex({ createdAt: -1 });
  }
}

module.exports = Block;

