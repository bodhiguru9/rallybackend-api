const Request = require('../../models/Request');
const User = require('../../models/User');
const Notification = require('../../models/Notification');
const { getPaginationParams, createPaginationResponse } = require('../../utils/pagination');
const { ObjectId } = require('mongodb');

/**
 * @desc    Request to join private organiser
 * @route   POST /api/request/:organiserId
 * @access  Private
 */
const requestToJoin = async (req, res, next) => {
  try {
    const { organiserId } = req.params;
    const userId = req.user.id;

    // Check if organiser exists and is private
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

    if (organiser.profileVisibility === 'public') {
      return res.status(400).json({
        success: false,
        error: 'Organiser is public. Please follow instead of requesting.',
      });
    }

    // Use MongoDB ObjectId for Request operations
    const organiserMongoId = organiser._id.toString();

    // Check if already has pending request (use MongoDB ObjectId)
    const hasPending = await Request.hasPendingRequest(userId, organiserMongoId);
    if (hasPending) {
      return res.status(400).json({
        success: false,
        error: 'Request already sent and pending',
      });
    }

    // Get user details before creating request
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Create join request (use MongoDB ObjectId)
    const requestResult = await Request.create(userId, organiserMongoId);

    // Create notification for organiser (use organiser._id directly as ObjectId, not string)
    try {
      const notificationResult = await Notification.create(
        organiser._id, // Use ObjectId directly, not string conversion
        'organiser_join_request',
        'New Join Request',
        `${user.fullName || 'A user'} requested to join your private community: ${organiser.communityName || organiser.fullName || 'your community'}`,
        {
          userId: userId,
          requestId: requestResult.requestId,
          organiserId: organiser._id.toString(),
          requestType: 'organiser-join',
        }
      );
      console.log('✅ Organiser join request notification created:', notificationResult._id.toString());
    } catch (error) {
      // Don't fail the request if notification creation fails
      console.error('❌ Error creating organiser join request notification:', error.message, error.stack);
    }

    // Prepare user data for response
    const userData = {
      userId: user.userId,
      userType: user.userType,
      email: user.email,
      profilePic: user.profilePic,
      ...(user.userType === 'player' && {
        fullName: user.fullName,
        sport1: user.sport1,
        sport2: user.sport2,
        sports: user.sports || [user.sport1, user.sport2].filter(Boolean),
      }),
      ...(user.userType === 'organiser' && {
        fullName: user.fullName,
      }),
    };

    res.status(201).json({
      success: true,
      message: 'Join request sent successfully',
      data: {
        requestId: requestResult.requestId, // Sequential request ID (R1, R2, R3, etc.)
        user: userData, // User details (profilePic, fullName, email, sports)
      },
    });
  } catch (error) {
    if (
      error.message === 'Request already sent and pending' ||
      error.message === 'Request already accepted'
    ) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
};

/**
 * @desc    Get pending requests for organiser
 * @route   GET /api/request/pending?organiserId=5&page=1
 * @access  Private (Organiser only)
 * 
 * Uses page-based pagination: 20 items per page
 * Query parameter: page (default: 1)
 * 
 * Note: The organiser ID is automatically taken from the logged-in user's token.
 * You can optionally specify a different organiserId in the query parameter,
 * but you must be that organiser to view their requests.
 */
const getPendingRequests = async (req, res, next) => {
  try {
    // Get organiser ID from query parameter (optional) or from logged-in user
    let organiserIdParam = req.query.organiserId || req.user.id;

    // Find organiser - handle both sequential userId and MongoDB ObjectId
    let organiser = null;
    
    // Check if it's a number (sequential userId)
    if (!isNaN(organiserIdParam) && parseInt(organiserIdParam).toString() === organiserIdParam) {
      organiser = await User.findByUserId(organiserIdParam);
    }
    
    // If not found by userId, try MongoDB ObjectId
    if (!organiser) {
      organiser = await User.findById(organiserIdParam);
    }

    // If still not found, use logged-in user
    if (!organiser) {
      organiser = await User.findById(req.user.id);
    }

    if (!organiser || organiser.userType !== 'organiser') {
      return res.status(403).json({
        success: false,
        error: 'Only organisers can view join requests',
      });
    }

    // Verify the organiser is the logged-in user (security check)
    if (organiser._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'You can only view your own requests',
      });
    }

    const { page, perPage, skip } = getPaginationParams(req.query.page, 20);

    // Use MongoDB ObjectId for Request operations
    const organiserMongoId = organiser._id; // Use ObjectId directly, not string

    const { getDB } = require('../../config/database');
    const db = getDB();
    const waitlistCollection = db.collection('waitlist');
    const eventJoinRequestsCollection = db.collection('eventJoinRequests');
    const eventsCollection = db.collection('events');
    const usersCollection = db.collection('users');

    // 1. Get organiser join requests (users requesting to join the organiser)
    const organiserJoinRequests = await Request.getPendingRequests(organiserMongoId, 1000, 0); // Get all, we'll paginate later
    
    // 2. Get event waitlist requests (users requesting to join events created by this organiser)
    const organiserEvents = await eventsCollection
      .find({ creatorId: organiserMongoId })
      .toArray();
    
    const eventIds = organiserEvents.map(e => e._id);

    // 2a. Pending requests for private events that still have available spots
    const eventPendingRequests = eventIds.length > 0
      ? await eventJoinRequestsCollection
          .find({
            eventId: { $in: eventIds },
            status: 'pending',
          })
          .sort({ createdAt: -1 })
          .toArray()
      : [];

    const eventWaitlistRequests = eventIds.length > 0
      ? await waitlistCollection
          .find({
            eventId: { $in: eventIds },
            status: 'pending',
          })
          .sort({ createdAt: -1 })
          .toArray()
      : [];

    // Combine both types of requests
    const allRequests = [
      ...organiserJoinRequests.map(r => ({ ...r, requestType: 'organiser-join' })),
      ...eventPendingRequests.map(r => ({ ...r, requestType: 'event-pending' })),
      ...eventWaitlistRequests.map(r => ({ ...r, requestType: 'event-waitlist' }))
    ];

    // Sort by creation date (newest first) and apply pagination
    allRequests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const totalCount = allRequests.length;
    const paginatedRequests = allRequests.slice(skip, skip + perPage);
    const pagination = createPaginationResponse(totalCount, page, perPage);

    // Get user details for event waitlist requests
    const eventRequestUserIds = [...eventPendingRequests, ...eventWaitlistRequests].map(r => r.userId);
    const eventRequestUsers = eventRequestUserIds.length > 0
      ? await usersCollection.find({ 
          _id: { $in: eventRequestUserIds.map(id => id instanceof ObjectId ? id : new ObjectId(id)) } 
        }).toArray()
      : [];

    // Process all requests
    const requestsWithDetails = await Promise.all(
      paginatedRequests.map(async (request) => {
        if (request.requestType === 'organiser-join') {
          // This is an organiser join request - already processed by Request.getPendingRequests
          return {
            type: 'organiser-join-request',
            ...request,
          };
        } else {
          // This is an event join request (pending or waitlist)
          const event = organiserEvents.find(e => e._id.toString() === request.eventId.toString());
          const user = eventRequestUsers.find(u => {
            const requestUserId = request.userId instanceof ObjectId ? request.userId : new ObjectId(request.userId);
            const userMongoId = u._id instanceof ObjectId ? u._id : new ObjectId(u._id);
            return requestUserId.toString() === userMongoId.toString();
          });

          return {
            type: 'event-join-request',
            requestSubtype: request.requestType === 'event-pending' ? 'pending-request' : 'waitlist',
            joinRequestId: request.requestType === 'event-pending' ? request.joinRequestId : (request.waitlistId || null),
            waitlistId: request.requestType === 'event-waitlist' ? request._id.toString() : null,
            requestId: request.requestType === 'event-waitlist' ? (request.requestId || null) : (request.joinRequestId || null),
            user: user ? {
              userId: user.userId,
              userType: user.userType,
              email: request.email || user.email,
              profilePic: request.profilePic || user.profilePic,
              fullName: request.fullName || user.fullName,
              ...(user.userType === 'player' && {
                sport1: user.sport1,
                sport2: user.sport2,
              }),
            } : {
              userId: null,
              email: request.email,
              profilePic: request.profilePic,
              fullName: request.fullName,
            },
            event: event ? {
              eventId: event.eventId,
              eventTitle: event.eventName || null,
              eventName: event.eventName || null,
              eventCategory: Array.isArray(event.eventSports) && event.eventSports.length > 0 ? event.eventSports[0] : null,
              eventType: event.eventType || null,
            } : null,
            status: request.status,
            createdAt: request.createdAt,
          };
        }
      })
    );

    // Calculate total counts
    const organiserJoinCount = await Request.getRequestCount(organiserMongoId);
    const eventPendingCount = eventIds.length > 0
      ? await eventJoinRequestsCollection.countDocuments({
          eventId: { $in: eventIds },
          status: 'pending',
        })
      : 0;
    const eventWaitlistCount = eventIds.length > 0
      ? await waitlistCollection.countDocuments({
          eventId: { $in: eventIds },
          status: 'pending',
        })
      : 0;

    res.status(200).json({
      success: true,
      data: {
        requests: requestsWithDetails,
        organiserJoinRequests: organiserJoinCount,
        eventPendingRequests: eventPendingCount,
        eventWaitlistRequests: eventWaitlistCount,
        pagination,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Accept join request
 * @route   POST /api/request/:requestId/accept
 * @access  Private (Organiser only)
 */
const acceptRequest = async (req, res, next) => {
  try {
    const { requestId } = req.params;
    const organiserId = req.user.id;

    // Verify user is organiser
    const organiser = await User.findById(organiserId);
    if (!organiser || organiser.userType !== 'organiser') {
      return res.status(403).json({
        success: false,
        error: 'Only organisers can accept requests',
      });
    }

    // Find request to verify it exists and get the sequential requestId
    const request = await Request.findByRequestId(requestId);
    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Request not found',
        requestId: requestId,
      });
    }

    // Verify the request belongs to this organiser
    if (request.organiserId.toString() !== organiserId) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to accept this request',
      });
    }

    // Update request status (use sequential requestId or MongoDB ObjectId)
    const updateResult = await Request.updateStatus(requestId, organiserId, 'accepted');

    // Notify the requesting user (player) that organiser accepted the request
    try {
      const organiserName = organiser.communityName || organiser.fullName || 'the organiser';

      // Resolve requester MongoDB ObjectId (supports legacy requests storing sequential userId)
      let requesterMongoId = request.userId;
      if (typeof requesterMongoId === 'string') {
        // If it's a valid ObjectId string, keep it; otherwise try sequential userId -> mongo _id
        if (requesterMongoId.length === 24 && /^[a-fA-F0-9]{24}$/.test(requesterMongoId)) {
          requesterMongoId = new ObjectId(requesterMongoId);
        } else if (!isNaN(requesterMongoId)) {
          const requesterUser = await User.findByUserId(requesterMongoId);
          requesterMongoId = requesterUser?._id || requesterMongoId;
        }
      } else if (typeof requesterMongoId === 'number') {
        const requesterUser = await User.findByUserId(requesterMongoId);
        requesterMongoId = requesterUser?._id || requesterMongoId;
      }

      await Notification.create(
        requesterMongoId,
        'organiser_request_accepted',
        'Request Accepted',
        `${organiserName} accepted your request to join their community.`,
        {
          organiserId: organiser._id.toString(),
          organiserName: organiserName,
          requestId: request.requestId || requestId,
          requestType: 'organiser-join',
        }
      );
    } catch (error) {
      // Don't fail the request if notification creation fails
      console.error('❌ Error creating organiser request accepted notification:', error.message, error.stack);
    }

    res.status(200).json({
      success: true,
      message: 'Request accepted successfully',
      data: {
        requestId: request.requestId || requestId, // Sequential request ID (R1, R2, R3, etc.)
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Reject join request
 * @route   POST /api/request/:requestId/reject
 * @access  Private (Organiser only)
 */
const rejectRequest = async (req, res, next) => {
  try {
    const { requestId } = req.params;
    const organiserId = req.user.id;

    // Verify user is organiser
    const organiser = await User.findById(organiserId);
    if (!organiser || organiser.userType !== 'organiser') {
      return res.status(403).json({
        success: false,
        error: 'Only organisers can reject requests',
      });
    }

    // Find request to verify it exists and get the sequential requestId
    const request = await Request.findByRequestId(requestId);
    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Request not found',
        requestId: requestId,
      });
    }

    // Verify the request belongs to this organiser
    if (request.organiserId.toString() !== organiserId) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to reject this request',
      });
    }

    // Update request status (use sequential requestId or MongoDB ObjectId)
    const updateResult = await Request.updateStatus(requestId, organiserId, 'rejected');

    // Notify the requesting user (player) that organiser rejected the request
    try {
      const organiserName = organiser.communityName || organiser.fullName || 'the organiser';

      // Resolve requester MongoDB ObjectId (supports legacy requests storing sequential userId)
      let requesterMongoId = request.userId;
      if (typeof requesterMongoId === 'string') {
        if (requesterMongoId.length === 24 && /^[a-fA-F0-9]{24}$/.test(requesterMongoId)) {
          requesterMongoId = new ObjectId(requesterMongoId);
        } else if (!isNaN(requesterMongoId)) {
          const requesterUser = await User.findByUserId(requesterMongoId);
          requesterMongoId = requesterUser?._id || requesterMongoId;
        }
      } else if (typeof requesterMongoId === 'number') {
        const requesterUser = await User.findByUserId(requesterMongoId);
        requesterMongoId = requesterUser?._id || requesterMongoId;
      }

      await Notification.create(
        requesterMongoId,
        'organiser_request_rejected',
        'Request Rejected',
        `${organiserName} rejected your request to join their community.`,
        {
          organiserId: organiser._id.toString(),
          organiserName: organiserName,
          requestId: request.requestId || requestId,
          requestType: 'organiser-join',
        }
      );
    } catch (error) {
      // Don't fail the request if notification creation fails
      console.error('❌ Error creating organiser request rejected notification:', error.message, error.stack);
    }

    res.status(200).json({
      success: true,
      message: 'Request rejected',
      data: {
        requestId: request.requestId || requestId, // Sequential request ID (R1, R2, R3, etc.)
      },
    });
  } catch (error) {
    next(error);
  }
};


/**
 * @desc    Get all accepted users for organiser
 * @route   GET /api/request/accepted?organiserId=5&page=1&perPage=10
 * @access  Private (Organiser only)
 * 
 * Returns list of all users who have been accepted by the organiser
 * Uses page-based pagination (page and perPage parameters)
 * 
 * Query Parameters (all optional):
 * - organiserId: Sequential userId (5, 6, etc.) or MongoDB ObjectId (default: logged-in user)
 * - page: Page number (default: 1)
 * - perPage: Items per page (default: 10)
 */
const getAcceptedUsers = async (req, res, next) => {
  try {
    // Get organiser ID from query parameter (optional) or from logged-in user
    let organiserId = req.query.organiserId || req.user.userId || req.user.id;

    // Find organiser by sequential userId or MongoDB ObjectId
    let organiser = null;
    
    // Check if it's a number (sequential userId)
    if (!isNaN(organiserId) && parseInt(organiserId).toString() === organiserId.toString()) {
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

    // Verify user is organiser
    if (organiser.userType !== 'organiser') {
      return res.status(403).json({
        success: false,
        error: 'Only organisers can view accepted users',
      });
    }

    // Verify the logged-in user is the organiser (security check)
    if (req.query.organiserId && organiser._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to view this organiser\'s accepted users',
      });
    }

    // Page-based pagination
    const { page, perPage, skip } = getPaginationParams(req.query.page, 20);

    // Use MongoDB ObjectId for Request operations
    const organiserMongoId = organiser._id.toString();

    const acceptedUsers = await Request.getAcceptedRequests(organiserMongoId, perPage, skip);
    const totalCount = await Request.getAcceptedCount(organiserMongoId);
    const pagination = createPaginationResponse(totalCount, page, perPage);

    res.status(200).json({
      success: true,
      data: {
        acceptedUsers,
        organiser: {
          userId: organiser.userId,
          fullName: organiser.fullName,
        },
        pagination,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Remove an accepted user
 * @route   DELETE /api/request/accepted/:userId
 * @access  Private (Organiser only)
 * 
 * Supports both sequential userId (5, 6, etc.) and MongoDB ObjectId
 */
const removeAcceptedUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const organiserId = req.user.id; // MongoDB ObjectId from token

    // Verify user is organiser
    const organiser = await User.findById(organiserId);
    if (!organiser || organiser.userType !== 'organiser') {
      return res.status(403).json({
        success: false,
        error: 'Only organisers can remove accepted users',
      });
    }

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

    // Use MongoDB ObjectId for Request operations
    const userMongoId = user._id.toString();
    const organiserMongoId = organiser._id.toString();

    // Remove accepted user
    await Request.removeAcceptedUser(userMongoId, organiserMongoId);

    res.status(200).json({
      success: true,
      message: 'Accepted user removed successfully',
      data: {
        userId: user.userId || user._id.toString(),
        fullName: user.fullName,
      },
    });
  } catch (error) {
    if (error.message === 'Accepted request not found') {
      return res.status(404).json({
        success: false,
        error: 'Accepted request not found for this user',
      });
    }
    next(error);
  }
};

module.exports = {
  requestToJoin,
  getPendingRequests,
  acceptRequest,
  rejectRequest,
  getAcceptedUsers,
  removeAcceptedUser,
};

