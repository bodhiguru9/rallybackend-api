const { getDB } = require('../config/database');
const { ObjectId } = require('mongodb');
const Counter = require('./Counter');

/**
 * Request Model
 * Handles join requests for private organisers
 */
class Request {
  /**
   * Create a join request
   */
  static async create(userId, organiserId) {
    const db = getDB();
    const requestsCollection = db.collection('requests');

    // Check if request already exists
    const existing = await requestsCollection.findOne({
      userId: typeof userId === 'string' ? new ObjectId(userId) : userId,
      organiserId: typeof organiserId === 'string' ? new ObjectId(organiserId) : organiserId,
      status: { $in: ['pending', 'accepted'] },
    });

    if (existing) {
      if (existing.status === 'pending') {
        throw new Error('Request already sent and pending');
      }
      if (existing.status === 'accepted') {
        throw new Error('Request already accepted');
      }
    }

    // Generate sequential request ID (R1, R2, R3, etc.)
    const requestId = await Counter.getNextJoinRequestId();

    const now = new Date();
    const result = await requestsCollection.insertOne({
      requestId: requestId, // Sequential request ID (R1, R2, R3, etc.)
      userId: typeof userId === 'string' ? new ObjectId(userId) : userId,
      organiserId: typeof organiserId === 'string' ? new ObjectId(organiserId) : organiserId,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });

    return {
      insertedId: result.insertedId,
      requestId: requestId,
    };
  }

    /**
   * Delete accepted/pending request for a user-organiser pair
   * Used when a user unfollows a private organiser and we want a clean re-request flow
   */
  static async deleteByUserAndOrganiser(userId, organiserId) {
    const db = getDB();
    const requestsCollection = db.collection('requests');

    const userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
    const organiserObjectId = typeof organiserId === 'string' ? new ObjectId(organiserId) : organiserId;

    const result = await requestsCollection.deleteMany({
      userId: userObjectId,
      organiserId: organiserObjectId,
      status: { $in: ['pending', 'accepted'] },
    });

    return result.deletedCount;
  }

  /**
   * Get pending requests for an organiser
   */
  static async getPendingRequests(organiserId, limit = 50, skip = 0) {
    const db = getDB();
    const requestsCollection = db.collection('requests');
    const usersCollection = db.collection('users');

    // Handle both ObjectId and string formats
    let organiserObjectId;
    if (organiserId instanceof ObjectId) {
      organiserObjectId = organiserId;
    } else if (typeof organiserId === 'string') {
      organiserObjectId = new ObjectId(organiserId);
    } else {
      organiserObjectId = organiserId;
    }

    const requests = await requestsCollection
      .find({ 
        organiserId: organiserObjectId, 
        status: 'pending' 
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .toArray();

    const userIds = requests.map((r) => r.userId);

    if (userIds.length === 0) {
      return [];
    }

    // Ensure userIds are ObjectIds for the query
    const userObjectIds = userIds.map(id => 
      id instanceof ObjectId ? id : new ObjectId(id)
    );
    const users = await usersCollection.find({ 
      _id: { $in: userObjectIds } 
    }).toArray();

    return requests.map((request) => {
      // Find user by matching ObjectIds (handle both ObjectId and string comparisons)
      const user = users.find((u) => {
        const requestUserId = request.userId instanceof ObjectId ? request.userId : new ObjectId(request.userId);
        const userMongoId = u._id instanceof ObjectId ? u._id : new ObjectId(u._id);
        return requestUserId.toString() === userMongoId.toString();
      });
      
      if (!user) {
        // Return request with minimal data if user not found
        return {
          requestId: request.requestId || null,
          user: null,
          status: request.status,
          createdAt: request.createdAt,
        };
      }
      
      return {
        requestId: request.requestId || null, // Sequential request ID (R1, R2, R3, etc.)
        user: {
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
            sports: user.sports || [user.sport1, user.sport2].filter(Boolean),
          }),
          ...(user.userType === 'organiser' && {
            fullName: user.fullName,
            communityName: user.communityName,
            yourCity: user.yourCity,
          }),
        },
        status: request.status,
        createdAt: request.createdAt,
      };
    });
  }

  /**
   * Find request by sequential requestId (R1, R2, etc.) or MongoDB ObjectId
   */
  static async findByRequestId(requestId) {
    const db = getDB();
    const requestsCollection = db.collection('requests');

    // Check if it's a sequential requestId (R1, R2, etc.)
    if (requestId.startsWith('R') && /^R\d+$/.test(requestId)) {
      return await requestsCollection.findOne({ requestId: requestId });
    }
    
    // Check if it's a MongoDB ObjectId (24 characters, hex)
    if (requestId.length === 24 && /^[a-fA-F0-9]{24}$/.test(requestId)) {
      return await requestsCollection.findOne({ _id: new ObjectId(requestId) });
    }

    // Invalid format
    return null;
  }

  /**
   * Update request status (accept/reject)
   * Accepts sequential requestId (R1, R2, etc.) or MongoDB ObjectId
   */
static async updateStatus(requestId, organiserId, status) {
  const db = getDB();
  const requestsCollection = db.collection('requests');

  const request = await this.findByRequestId(requestId);
  if (!request) {
    throw new Error('Request not found');
  }

  const organiserObjectId =
    typeof organiserId === 'string' ? new ObjectId(organiserId) : organiserId;

  if (request.organiserId.toString() !== organiserObjectId.toString()) {
    throw new Error('Not authorized to update this request');
  }

  if (request.status !== 'pending') {
    throw new Error('Request already processed');
  }

  if (!['accepted', 'rejected'].includes(status)) {
    throw new Error('Invalid status. Must be "accepted" or "rejected"');
  }

  // If accepting, ensure follow exists first
  if (status === 'accepted') {
    const Follow = require('./Follow');
    try {
      await Follow.create(request.userId, request.organiserId);
    } catch (error) {
      if (!error.message.includes('Already following')) {
        throw error;
      }
    }
  }

  const result = await requestsCollection.updateOne(
    { _id: request._id },
    {
      $set: {
        status,
        updatedAt: new Date(),
      },
    }
  );

  return result.modifiedCount > 0;
}

  /**
   * Check if user has pending request
   */
  static async hasPendingRequest(userId, organiserId) {
    const db = getDB();
    const requestsCollection = db.collection('requests');

    const request = await requestsCollection.findOne({
      userId: typeof userId === 'string' ? new ObjectId(userId) : userId,
      organiserId: typeof organiserId === 'string' ? new ObjectId(organiserId) : organiserId,
      status: 'pending',
    });

    return !!request;
  }

  /**
   * Get request count for organiser
   */
  static async getRequestCount(organiserId) {
    const db = getDB();
    const requestsCollection = db.collection('requests');

    const objectId = typeof organiserId === 'string' ? new ObjectId(organiserId) : organiserId;

    return await requestsCollection.countDocuments({
      organiserId: objectId,
      status: 'pending',
    });
  }

  /**
   * Get request by sequential requestId or MongoDB ObjectId
   */
  static async findById(requestId) {
    return await this.findByRequestId(requestId);
  }

  /**
   * Get accepted requests for an organiser
   */
  static async getAcceptedRequests(organiserId, limit = 100, skip = 0) {
    const db = getDB();
    const requestsCollection = db.collection('requests');
    const usersCollection = db.collection('users');

    const objectId = typeof organiserId === 'string' ? new ObjectId(organiserId) : organiserId;

    const requests = await requestsCollection
      .find({ organiserId: objectId, status: 'accepted' })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .skip(skip)
      .toArray();

    const userIds = requests.map((r) => r.userId);

    if (userIds.length === 0) {
      return [];
    }

    const users = await usersCollection.find({ _id: { $in: userIds } }).toArray();

    return requests.map((request) => {
      const user = users.find((u) => u._id.toString() === request.userId.toString());
      return {
        requestId: request.requestId || null, // Sequential request ID (R1, R2, R3, etc.)
        user: {
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
            sports: user.sports || [user.sport1, user.sport2].filter(Boolean),
          }),
          ...(user.userType === 'organiser' && {
            fullName: user.fullName,
            communityName: user.communityName,
            yourCity: user.yourCity,
          }),
        },
        status: request.status,
        acceptedAt: request.updatedAt,
        createdAt: request.createdAt,
      };
    });
  }

  /**
   * Get accepted requests count for organiser
   */
  static async getAcceptedCount(organiserId) {
    const db = getDB();
    const requestsCollection = db.collection('requests');

    const objectId = typeof organiserId === 'string' ? new ObjectId(organiserId) : organiserId;

    return await requestsCollection.countDocuments({
      organiserId: objectId,
      status: 'accepted',
    });
  }

  /**
   * Remove an accepted user (change status to 'removed')
   */
  static async removeAcceptedUser(userId, organiserId) {
    const db = getDB();
    const requestsCollection = db.collection('requests');
    const Follow = require('./Follow');

    const userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
    const organiserObjectId = typeof organiserId === 'string' ? new ObjectId(organiserId) : organiserId;

    // Find the accepted request
    const request = await requestsCollection.findOne({
      userId: userObjectId,
      organiserId: organiserObjectId,
      status: 'accepted',
    });

    if (!request) {
      throw new Error('Accepted request not found');
    }

    // Update status to 'removed'
    const result = await requestsCollection.updateOne(
      { _id: request._id },
      {
        $set: {
          status: 'removed',
          updatedAt: new Date(),
        },
      }
    );

    // Remove follow relationship if it exists
    try {
      await Follow.remove(userId, organiserId);
    } catch (error) {
      // If follow doesn't exist, that's okay - just continue
      console.error('Error removing follow after user removal:', error);
    }

    return result.modifiedCount > 0;
  }
}

module.exports = Request;

