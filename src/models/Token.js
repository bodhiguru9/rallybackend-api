const { getDB } = require('../config/database');
const { ObjectId } = require('mongodb');

/**
 * Token Model
 * Handles refresh token storage and management
 */
class Token {
  /**
   * Store refresh token for a user
   * @param {string} userId - MongoDB ObjectId of the user
   * @param {string} refreshToken - Refresh token string
   * @param {Date} expiresAt - Token expiration date
   * @returns {Promise<Object>} Stored token document
   */
  static async create(userId, refreshToken, expiresAt) {
    const db = getDB();
    const tokensCollection = db.collection('tokens');

    // Convert string ID to ObjectId if needed
    let objectId;
    try {
      objectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
    } catch (error) {
      throw new Error('Invalid user ID format');
    }

    const tokenData = {
      userId: objectId,
      refreshToken,
      expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await tokensCollection.insertOne(tokenData);
    return {
      _id: result.insertedId,
      ...tokenData,
    };
  }

  /**
   * Find refresh token by token string
   * @param {string} refreshToken - Refresh token string
   * @returns {Promise<Object|null>} Token document or null
   */
  static async findByToken(refreshToken) {
    const db = getDB();
    const tokensCollection = db.collection('tokens');

    return await tokensCollection.findOne({
      refreshToken,
      expiresAt: { $gt: new Date() }, // Only return non-expired tokens
    });
  }

  /**
   * Find all refresh tokens for a user
   * @param {string} userId - MongoDB ObjectId of the user
   * @returns {Promise<Array>} Array of token documents
   */
  static async findByUserId(userId) {
    const db = getDB();
    const tokensCollection = db.collection('tokens');

    // Convert string ID to ObjectId if needed
    let objectId;
    try {
      objectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
    } catch (error) {
      return [];
    }

    return await tokensCollection
      .find({
        userId: objectId,
        expiresAt: { $gt: new Date() }, // Only return non-expired tokens
      })
      .toArray();
  }

  /**
   * Delete refresh token by token string
   * @param {string} refreshToken - Refresh token string
   * @returns {Promise<boolean>} True if deleted, false otherwise
   */
  static async deleteByToken(refreshToken) {
    const db = getDB();
    const tokensCollection = db.collection('tokens');

    const result = await tokensCollection.deleteOne({ refreshToken });
    return result.deletedCount > 0;
  }

  /**
   * Delete all refresh tokens for a user
   * @param {string} userId - MongoDB ObjectId of the user
   * @returns {Promise<number>} Number of tokens deleted
   */
  static async deleteByUserId(userId) {
    const db = getDB();
    const tokensCollection = db.collection('tokens');

    // Convert string ID to ObjectId if needed
    let objectId;
    try {
      objectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
    } catch (error) {
      return 0;
    }

    const result = await tokensCollection.deleteMany({ userId: objectId });
    return result.deletedCount;
  }

  /**
   * Delete expired tokens (cleanup method)
   * @returns {Promise<number>} Number of tokens deleted
   */
  static async deleteExpired() {
    const db = getDB();
    const tokensCollection = db.collection('tokens');

    const result = await tokensCollection.deleteMany({
      expiresAt: { $lte: new Date() },
    });
    return result.deletedCount;
  }

  /**
   * Update token's updatedAt timestamp
   * @param {string} refreshToken - Refresh token string
   * @returns {Promise<boolean>} True if updated, false otherwise
   */
  static async updateTimestamp(refreshToken) {
    const db = getDB();
    const tokensCollection = db.collection('tokens');

    const result = await tokensCollection.updateOne(
      { refreshToken },
      { $set: { updatedAt: new Date() } }
    );
    return result.modifiedCount > 0;
  }
}

module.exports = Token;
