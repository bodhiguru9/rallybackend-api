const { getDB } = require('../config/database');
const { ObjectId } = require('mongodb');
const { getNextUniqueEventJoinRequestId } = require('../utils/idManager');

/**
 * EventJoinRequest Model (Private Events)
 *
 * Stores "pending join requests" for private events WHEN the event still has available spots.
 * If the event becomes full, new requests should go to waitlist instead.
 */
class EventJoinRequest {
  static collection() {
    const db = getDB();
    return db.collection('eventJoinRequests');
  }

  static async createIndexes() {
    const col = this.collection();
    await col.createIndex({ joinRequestId: 1 }, { unique: true });
    await col.createIndex({ eventId: 1, status: 1, createdAt: -1 });
    await col.createIndex({ userId: 1, status: 1, createdAt: -1 });
    await col.createIndex({ userId: 1, eventId: 1, status: 1 });
  }

  static async create(userId, eventId, userDetails = null) {
    const col = this.collection();

    const userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
    const eventObjectId = typeof eventId === 'string' ? new ObjectId(eventId) : eventId;

    // Prevent duplicate pending request for same user+event
    const existing = await col.findOne({
      userId: userObjectId,
      eventId: eventObjectId,
      status: 'pending',
    });
    if (existing) {
      throw new Error('Already requested');
    }

    const joinRequestId = await getNextUniqueEventJoinRequestId();
    const now = new Date();

    const doc = {
      joinRequestId,
      userId: userObjectId,
      eventId: eventObjectId,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };

    if (userDetails) {
      doc.profilePic = userDetails.profilePic || null;
      doc.fullName = userDetails.fullName || null;
      doc.email = userDetails.email || null;
    }

    await col.insertOne(doc);
    return doc;
  }

  static async findActiveByUserAndEvent(userId, eventId) {
    const col = this.collection();
    const userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
    const eventObjectId = typeof eventId === 'string' ? new ObjectId(eventId) : eventId;
    return await col.findOne({
      userId: userObjectId,
      eventId: eventObjectId,
      status: { $in: ['pending', 'accepted'] },
    });
  }

  static async findActiveByEvent(eventId, limit = 20, skip = 0) {
    const col = this.collection();
    const eventObjectId = typeof eventId === 'string' ? new ObjectId(eventId) : eventId;
    return await col
      .find({ eventId: eventObjectId, status: { $in: ['pending', 'accepted'] } })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();
  }

  static async countActiveByEvent(eventId) {
    const col = this.collection();
    const eventObjectId = typeof eventId === 'string' ? new ObjectId(eventId) : eventId;
    return await col.countDocuments({ eventId: eventObjectId, status: { $in: ['pending', 'accepted'] } });
  }

  static async markAccepted(joinRequestId, eventId, organiserId = null) {
    const col = this.collection();
    const query = { joinRequestId: String(joinRequestId) };
    if (eventId) {
      const eventObjectId = typeof eventId === 'string' ? new ObjectId(eventId) : eventId;
      query.eventId = eventObjectId;
    }
    const now = new Date();
    const update = {
      $set: {
        status: 'accepted',
        acceptedAt: now,
        updatedAt: now,
        ...(organiserId ? { acceptedBy: typeof organiserId === 'string' ? new ObjectId(organiserId) : organiserId } : {}),
      },
    };
    const result = await col.updateOne(query, update);
    return result.modifiedCount > 0;
  }

  static async findPendingByUserAndEvent(userId, eventId) {
    const col = this.collection();
    const userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
    const eventObjectId = typeof eventId === 'string' ? new ObjectId(eventId) : eventId;
    return await col.findOne({ userId: userObjectId, eventId: eventObjectId, status: 'pending' });
  }

  static async findPendingByEvent(eventId, limit = 20, skip = 0) {
    const col = this.collection();
    const eventObjectId = typeof eventId === 'string' ? new ObjectId(eventId) : eventId;
    return await col
      .find({ eventId: eventObjectId, status: 'pending' })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();
  }

  static async countPendingByEvent(eventId) {
    const col = this.collection();
    const eventObjectId = typeof eventId === 'string' ? new ObjectId(eventId) : eventId;
    return await col.countDocuments({ eventId: eventObjectId, status: 'pending' });
  }

  static async findPendingByUser(userId) {
    const col = this.collection();
    const userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
    return await col.find({ userId: userObjectId, status: 'pending' }).sort({ createdAt: -1 }).toArray();
  }

  static async findPendingByOrganiserEvents(eventIds, limit = 1000, skip = 0) {
    const col = this.collection();
    if (!Array.isArray(eventIds) || eventIds.length === 0) return [];
    return await col
      .find({ eventId: { $in: eventIds }, status: 'pending' })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();
  }

  static async deleteByJoinRequestId(joinRequestId, eventId = null) {
    const col = this.collection();
    const query = { joinRequestId: String(joinRequestId) };
    if (eventId) {
      const eventObjectId = typeof eventId === 'string' ? new ObjectId(eventId) : eventId;
      query.eventId = eventObjectId;
    }
    const result = await col.deleteOne(query);
    return result.deletedCount > 0;
  }

  static async deletePendingByUserAndEvent(userId, eventId) {
    const col = this.collection();
    const userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
    const eventObjectId = typeof eventId === 'string' ? new ObjectId(eventId) : eventId;
    const result = await col.deleteOne({ userId: userObjectId, eventId: eventObjectId, status: 'pending' });
    return result.deletedCount > 0;
  }

  static async deleteActiveByUserAndEvent(userId, eventId) {
    const col = this.collection();
    const userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
    const eventObjectId = typeof eventId === 'string' ? new ObjectId(eventId) : eventId;
    const result = await col.deleteMany({ userId: userObjectId, eventId: eventObjectId, status: { $in: ['pending', 'accepted'] } });
    return result.deletedCount > 0;
  }
}

module.exports = EventJoinRequest;

