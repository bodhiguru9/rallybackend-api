const Waitlist = require('../../models/Waitlist');
const EventJoinRequest = require('../../models/EventJoinRequest');
const Event = require('../../models/Event');
const User = require('../../models/User');
const { getPaginationParams, createPaginationResponse } = require('../../utils/pagination');

/**
 * @desc    Get my join requests (for players)
 * @route   GET /api/private-events/my-requests?page=1
 * @access  Private
 * 
 * Returns all join requests made by the logged-in user for private events.
 */
const getMyJoinRequests = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { page, perPage, skip } = getPaginationParams(req.query.page, 20);

    const { getDB } = require('../../config/database');
    const { ObjectId } = require('mongodb');
    const db = getDB();
    const waitlistCollection = db.collection('waitlist');
    const pendingCollection = db.collection('eventJoinRequests');
    const eventsCollection = db.collection('events');

    // Convert userId string to ObjectId
    let userObjectId;
    try {
      userObjectId = new ObjectId(userId);
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID format',
      });
    }
    
    // Pending requests (private events with available spots at request time)
    const pendingItems = await pendingCollection
      .find({
        userId: userObjectId,
        status: 'pending',
      })
      .sort({ createdAt: -1 })
      .toArray();

    // Waitlist requests (private events that were full at request time)
    const waitlistItems = await waitlistCollection
      .find({
        userId: userObjectId,
        status: 'pending',
      })
      .sort({ createdAt: -1 })
      .toArray();

    const allItems = [
      ...pendingItems.map((i) => ({ ...i, requestType: 'pending-request' })),
      ...waitlistItems.map((i) => ({ ...i, requestType: 'waitlist' })),
    ];
    allItems.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // Get total count
    const totalCount = allItems.length;
    
    // Apply pagination
    const paginatedRequests = allItems.slice(skip, skip + perPage);
    const pagination = createPaginationResponse(totalCount, page, perPage);

    // Get event IDs from join requests
    const eventIds = paginatedRequests.map((r) => r.eventId);
    const events = eventIds.length > 0 
      ? await eventsCollection.find({ _id: { $in: eventIds } }).toArray()
      : [];

    // Get current user details
    const currentUser = await User.findById(userId);
    
    // Process all requests with event details
    const requestsWithDetails = await Promise.all(
      paginatedRequests.map(async (request) => {
        const event = events.find((e) => e._id.toString() === request.eventId.toString());
        
        // Get creator details
        let creator = null;
        let creatorEmail = null;
        let creatorProfilePic = null;
        if (event) {
          creator = await User.findById(event.creatorId);
          creatorEmail = creator ? creator.email : null;
          creatorProfilePic = creator ? creator.profilePic : null;
        }
        
        // Use stored user details from join request if available, otherwise fallback to current user document
        const userData = {
          userId: currentUser ? currentUser.userId : null,
          profilePic: request.profilePic || (currentUser ? currentUser.profilePic : null),
          fullName: request.fullName || (currentUser ? currentUser.fullName : null),
          email: request.email || (currentUser ? currentUser.email : null),
        };
        
        return {
          requestType: request.requestType,
          requestId: request.requestType === 'pending-request' ? (request.joinRequestId || null) : (request.requestId || null),
          joinRequestId: request.requestType === 'pending-request' ? request.joinRequestId : request.waitlistId, // Sequential ID for reference
          user: userData,
          event: event
            ? {
                eventId: event.eventId,
                eventName: event.eventName || event.gameTitle,
                eventType: event.eventType || event.gameType,
                eventDateTime: event.eventDateTime || event.gameStartDate,
                eventLocation: event.eventLocation || event.gameLocationArena,
                gameCreatorName: event.gameCreatorName || event.eventCreatorName,
                gameCreatorEmail: event.gameCreatorEmail || creatorEmail,
                gameCreatorProfilePic: event.gameCreatorProfilePic || creatorProfilePic,
                IsPrivateEvent: event.IsPrivateEvent !== undefined ? event.IsPrivateEvent : (event.visibility === 'private'),
              }
            : null,
          status: request.status,
          requestedAt: request.createdAt,
        };
      })
    );

    res.status(200).json({
      success: true,
      message: 'My join requests retrieved successfully',
      data: {
        requests: requestsWithDetails,
        totalRequests: totalCount,
        pagination,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMyJoinRequests,
};
