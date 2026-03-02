const User = require('../../models/User');
const Follow = require('../../models/Follow');
const Favorite = require('../../models/Favorite');
const { getDB } = require('../../config/database');
const { ObjectId } = require('mongodb');

/**
 * @desc    Get player following organizers, favorite events, joined events, and private event requests
 * @route   GET /api/users/player/profile
 * @access  Private (Player only)
 * 
 * Returns:
 * - Following count (number of organizers they follow)
 * - List of organizers they follow (with profile picture, full name, email)
 * - Favorite events count (how many events they've added to their list)
 * - List of event IDs they've added to favorites
 * - Joined events count (how many events they've joined)
 * - List of joined events (event names and IDs)
 * - Private event requests count (how many private events they've requested to join)
 * - List of private event requests (event names and IDs)
 * 
 * Based on the signed-in user's JWT token
 */
const getPlayerProfile = async (req, res, next) => {
  try {
    const userId = req.user.id; // MongoDB ObjectId from auth middleware
    const userSequentialId = req.user.userId; // Sequential userId

    // Get user details
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Verify user is a player
    if (user.userType !== 'player') {
      return res.status(403).json({
        success: false,
        error: 'This endpoint is only available for players',
      });
    }

    // Get following count and list of organizers they follow (optimized query)
    const followingCount = await Follow.getFollowingCount(userId);
    
    // Get following organizers with their profile details (optimized direct query)
    const db = getDB();
    const followsCollection = db.collection('follows');
    const usersCollection = db.collection('users');

    const follows = await followsCollection
      .find({ followerId: new ObjectId(userId) })
      .sort({ createdAt: -1 })
      .toArray();

    const followingIds = follows.map((f) => f.followingId);

    let organizersList = [];
    if (followingIds.length > 0) {
      const followingOrganizers = await usersCollection
        .find({ _id: { $in: followingIds }, userType: 'organiser' })
        .toArray();

      // Format organizers with required fields
      organizersList = followingOrganizers.map((organizer) => ({
        userId: organizer.userId,
        mongoId: organizer._id.toString(),
        fullName: organizer.fullName || null,
        email: organizer.email || null,
        profilePic: organizer.profilePic || null,
        communityName: organizer.communityName || null,
        yourCity: organizer.yourCity || null,
        profileVisibility: organizer.profileVisibility || 'private',
      }));
    }

    // Get favorite events count and event IDs (optimized query)
    const favoritesCollection = db.collection('favorites');
    const eventsCollection = db.collection('events');
    const eventJoinsCollection = db.collection('eventJoins');
    const waitlistCollection = db.collection('waitlist');

    // Get all favorite event IDs for this user
    const favorites = await favoritesCollection
      .find({ userId: new ObjectId(userId) })
      .toArray();

    const favoriteEventIds = favorites.map((fav) => fav.eventId);
    const favoriteEventsCount = favoriteEventIds.length;

    // Get event details to extract sequential eventIds for favorites
    let favoriteEventIdsList = [];
    if (favoriteEventIds.length > 0) {
      const events = await eventsCollection
        .find({ _id: { $in: favoriteEventIds } })
        .project({ eventId: 1, eventName: 1, _id: 0 }) // Get eventId and eventName
        .toArray();

      favoriteEventIdsList = events.map((event) => event.eventId).filter(Boolean);
    }

    // Get joined events (events user has joined)
    const joinedEvents = await eventJoinsCollection
      .find({ userId: new ObjectId(userId) })
      .toArray();

    const joinedEventIds = joinedEvents.map((join) => join.eventId);
    const joinedEventsCount = joinedEventIds.length;

    // Get event details for joined events (event names and IDs)
    let joinedEventsList = [];
    if (joinedEventIds.length > 0) {
      const joinedEventsData = await eventsCollection
        .find({ _id: { $in: joinedEventIds } })
        .project({ eventId: 1, eventName: 1, _id: 0 })
        .toArray();

      joinedEventsList = joinedEventsData.map((event) => ({
        eventId: event.eventId,
        eventName: event.eventName || null,
        eventTitle: event.eventName || null,
      }));
    }

    // Get private event requests (waitlist with status 'pending')
    const privateEventRequests = await waitlistCollection
      .find({ 
        userId: new ObjectId(userId),
        status: 'pending'
      })
      .toArray();

    const privateRequestEventIds = privateEventRequests.map((req) => req.eventId);
    const privateEventRequestsCount = privateRequestEventIds.length;

    // Get event details for private event requests (event names and IDs)
    let privateEventRequestsList = [];
    if (privateRequestEventIds.length > 0) {
      const privateEventsData = await eventsCollection
        .find({ _id: { $in: privateRequestEventIds } })
        .project({ eventId: 1, eventName: 1, _id: 0 })
        .toArray();

      privateEventRequestsList = privateEventsData.map((event) => ({
        eventId: event.eventId,
        eventName: event.eventName || null,
        eventTitle: event.eventName || null,
      }));
    }

    // Build response with all requested data
    const responseData = {
      followingCount: followingCount,
      followingOrganizers: organizersList,
      favoriteEventsCount: favoriteEventsCount,
      favoriteEventIds: favoriteEventIdsList,
      joinedEventsCount: joinedEventsCount,
      joinedEvents: joinedEventsList,
      privateEventRequestsCount: privateEventRequestsCount,
      privateEventRequests: privateEventRequestsList,
    };

    res.status(200).json({
      success: true,
      message: 'Player profile data retrieved successfully',
      data: responseData,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPlayerProfile,
};

