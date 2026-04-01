const { getDB } = require('../config/database');
const { ObjectId } = require('mongodb');

/**
 * Notification Model
 * Handles notifications for players and organizers
 */
class Notification {
  /**
   * Create a notification
   * @param {string|ObjectId} recipientId - User who receives the notification
   * @param {string} type - Notification type: 'event_join_request', 'event_request_accepted', 'event_leave', 'organiser_follow'
   * @param {string} title - Notification title
   * @param {string} message - Notification message
   * @param {object} data - Additional data (eventId, userId, eventName, etc.)
   * @returns {Promise<Object>} Created notification
   */
  static async create(recipientId, type, title, message, data = {}) {
    const db = getDB();
    const notificationsCollection = db.collection('notifications');

    const recipientObjectId = typeof recipientId === 'string' ? new ObjectId(recipientId) : recipientId;

    const now = new Date();
    const notification = {
      recipientId: recipientObjectId,
      type: type,
      title: title,
      message: message,
      data: data,
      isRead: false,
      createdAt: now,
      updatedAt: now,
    };

    const result = await notificationsCollection.insertOne(notification);

    return {
      _id: result.insertedId,
      ...notification,
    };
  }

  /**
   * Get notifications for a user
   * @param {string|ObjectId} userId - User ID
   * @param {number} limit - Maximum number of results
   * @param {number} skip - Number of results to skip
   * @param {string} type - Optional filter by type
   * @returns {Promise<Array>} Array of notifications
   */
  static async getUserNotifications(userId, limit = 50, skip = 0, type = null) {
    const db = getDB();
    const notificationsCollection = db.collection('notifications');

    const userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
    const userStringId = userObjectId.toString();

    const query = { recipientId: { $in: [userObjectId, userStringId] } };
    if (type) {
      query.type = type;
    }

    const notifications = await notificationsCollection
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .toArray();

    return notifications;
  }

  /**
   * Get unread notification count for a user
   * @param {string|ObjectId} userId - User ID
   * @param {string} type - Optional filter by type
   * @returns {Promise<number>} Count of unread notifications
   */
  static async getUnreadCount(userId, type = null) {
    const db = getDB();
    const notificationsCollection = db.collection('notifications');

    const userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
    const userStringId = userObjectId.toString();

    const query = {
      recipientId: { $in: [userObjectId, userStringId] },
      isRead: false,
    };
    if (type) {
      query.type = type;
    }

    return await notificationsCollection.countDocuments(query);
  }

  /**
   * Mark notification as read
   * @param {string|ObjectId} notificationId - Notification ID
   * @param {string|ObjectId} userId - User ID (to verify ownership)
   * @returns {Promise<boolean>} True if marked as read
   */
  static async markAsRead(notificationId, userId) {
    const db = getDB();
    const notificationsCollection = db.collection('notifications');

    const notificationObjectId = typeof notificationId === 'string' ? new ObjectId(notificationId) : notificationId;
    const userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;

    const result = await notificationsCollection.updateOne(
      {
        _id: notificationObjectId,
        recipientId: userObjectId,
      },
      {
        $set: {
          isRead: true,
          updatedAt: new Date(),
        },
      }
    );

    return result.modifiedCount > 0;
  }

  /**
   * Mark all notifications as read for a user
   * @param {string|ObjectId} userId - User ID
   * @param {string} type - Optional filter by type
   * @returns {Promise<number>} Number of notifications marked as read
   */
  static async markAllAsRead(userId, type = null) {
    const db = getDB();
    const notificationsCollection = db.collection('notifications');

    const userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;

    const query = {
      recipientId: userObjectId,
      isRead: false,
    };
    if (type) {
      query.type = type;
    }

    const result = await notificationsCollection.updateMany(query, {
      $set: {
        isRead: true,
        updatedAt: new Date(),
      },
    });

    return result.modifiedCount;
  }

  /**
   * Delete a notification
   * @param {string|ObjectId} notificationId - Notification ID
   * @param {string|ObjectId} userId - User ID (to verify ownership)
   * @returns {Promise<boolean>} True if deleted
   */
  static async delete(notificationId, userId) {
    const db = getDB();
    const notificationsCollection = db.collection('notifications');

    const notificationObjectId = typeof notificationId === 'string' ? new ObjectId(notificationId) : notificationId;
    const userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;

    const result = await notificationsCollection.deleteOne({
      _id: notificationObjectId,
      recipientId: userObjectId,
    });

    return result.deletedCount > 0;
  }

  /**
   * Delete all notifications for a user
   * @param {string|ObjectId} userId - User ID
   * @param {string} type - Optional filter by type
   * @returns {Promise<number>} Number of notifications deleted
   */
  static async deleteAll(userId, type = null) {
    const db = getDB();
    const notificationsCollection = db.collection('notifications');

    const userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;

    const query = { recipientId: userObjectId };
    if (type) {
      query.type = type;
    }

    const result = await notificationsCollection.deleteMany(query);

    return result.deletedCount;
  }
}

module.exports = Notification;

