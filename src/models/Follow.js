const { getDB } = require('../config/database');
const { ObjectId } = require('mongodb');

/**
 * Follow Model
 * Handles follower/following relationships for public organisers
 */
class Follow {
  /**
   * Create a follow relationship
   */
  static async create(followerId, followingId) {
    const db = getDB();
    const followsCollection = db.collection('follows');

    // Check if already following
    const existing = await followsCollection.findOne({
      followerId: typeof followerId === 'string' ? new ObjectId(followerId) : followerId,
      followingId: typeof followingId === 'string' ? new ObjectId(followingId) : followingId,
    });

    if (existing) {
      throw new Error('Already following this organiser');
    }

    const now = new Date();
    const result = await followsCollection.insertOne({
      followerId: typeof followerId === 'string' ? new ObjectId(followerId) : followerId,
      followingId: typeof followingId === 'string' ? new ObjectId(followingId) : followingId,
      createdAt: now,
    });

    // Update follower counts
    await this.updateFollowerCount(followingId, 1);
    await this.updateFollowingCount(followerId, 1);

    return result.insertedId;
  }

  /**
   * Remove a follow relationship
   */
  static async remove(followerId, followingId) {
    const db = getDB();
    const followsCollection = db.collection('follows');

    const result = await followsCollection.deleteOne({
      followerId: typeof followerId === 'string' ? new ObjectId(followerId) : followerId,
      followingId: typeof followingId === 'string' ? new ObjectId(followingId) : followingId,
    });

    if (result.deletedCount > 0) {
      // Update follower counts
      await this.updateFollowerCount(followingId, -1);
      await this.updateFollowingCount(followerId, -1);
    }

    return result.deletedCount > 0;
  }

  /**
   * Check if user is following organiser
   */
  static async isFollowing(followerId, followingId) {
    const db = getDB();
    const followsCollection = db.collection('follows');

    const follow = await followsCollection.findOne({
      followerId: typeof followerId === 'string' ? new ObjectId(followerId) : followerId,
      followingId: typeof followingId === 'string' ? new ObjectId(followingId) : followingId,
    });

    return !!follow;
  }

  /**
   * Get followers of an organiser
   */
  static async getFollowers(organiserId, limit = 50, skip = 0) {
    const db = getDB();
    const followsCollection = db.collection('follows');
    const usersCollection = db.collection('users');

    const objectId = typeof organiserId === 'string' ? new ObjectId(organiserId) : organiserId;

    const follows = await followsCollection
      .find({ followingId: objectId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .toArray();

    const followerIds = follows.map((f) => f.followerId);

    if (followerIds.length === 0) {
      return [];
    }

    const followers = await usersCollection
      .find({ _id: { $in: followerIds } })
      .toArray();

    return followers.map((user) => ({
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
      }),
    }));
  }

  /**
   * Get users that a person is following
   */
  static async getFollowing(userId, limit = 50, skip = 0) {
    const db = getDB();
    const followsCollection = db.collection('follows');
    const usersCollection = db.collection('users');

    const objectId = typeof userId === 'string' ? new ObjectId(userId) : userId;

    const follows = await followsCollection
      .find({ followerId: objectId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .toArray();

    const followingIds = follows.map((f) => f.followingId);

    if (followingIds.length === 0) {
      return [];
    }

    const following = await usersCollection
      .find({ _id: { $in: followingIds }, userType: 'organiser' })
      .toArray();

    return following.map((user) => ({
      userId: user.userId,
      userType: user.userType,
      email: user.email,
      mobileNumber: user.mobileNumber,
      profilePic: user.profilePic,
      fullName: user.fullName,
      communityName: user.communityName,
      yourCity: user.yourCity,
      profileVisibility: user.profileVisibility,
    }));
  }

  /**
   * Update follower count for organiser
   */
  static async updateFollowerCount(organiserId, increment) {
    const db = getDB();
    const usersCollection = db.collection('users');

    const objectId = typeof organiserId === 'string' ? new ObjectId(organiserId) : organiserId;

    // Use upsert to ensure field exists, or set to 0 if it doesn't exist
    const currentUser = await usersCollection.findOne({ _id: objectId });
    const currentCount = currentUser?.followersCount || 0;
    const newCount = Math.max(0, currentCount + (increment || 0));

    await usersCollection.updateOne(
      { _id: objectId },
      { $set: { followersCount: newCount } }
    );
  }

  /**
   * Update following count for user
   */
  static async updateFollowingCount(userId, increment) {
    const db = getDB();
    const usersCollection = db.collection('users');

    const objectId = typeof userId === 'string' ? new ObjectId(userId) : userId;

    // Use upsert to ensure field exists, or set to 0 if it doesn't exist
    const currentUser = await usersCollection.findOne({ _id: objectId });
    const currentCount = currentUser?.followingCount || 0;
    const newCount = Math.max(0, currentCount + (increment || 0));

    await usersCollection.updateOne(
      { _id: objectId },
      { $set: { followingCount: newCount } }
    );
  }

  /**
   * Get follower count
   */
  static async getFollowerCount(organiserId) {
    const db = getDB();
    const followsCollection = db.collection('follows');

    const objectId = typeof organiserId === 'string' ? new ObjectId(organiserId) : organiserId;

    return await followsCollection.countDocuments({ followingId: objectId });
  }

  /**
   * Get following count
   */
  static async getFollowingCount(userId) {
    const db = getDB();
    const followsCollection = db.collection('follows');

    const objectId = typeof userId === 'string' ? new ObjectId(userId) : userId;

    return await followsCollection.countDocuments({ followerId: objectId });
  }
}

module.exports = Follow;

