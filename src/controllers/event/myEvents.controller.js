const { getDB } = require('../../config/database');
const { ObjectId } = require('mongodb');
const Event = require('../../models/Event');
const EventJoin = require('../../models/EventJoin');
const User = require('../../models/User');
const { formatEventResponse } = require('../../utils/eventFields');

/**
 * @desc    Get user's events categorized by status (upcoming, ongoing, past, cancelled)
 * @route   GET /api/events/my-events-status
 * @access  Private
 */
const getMyEventsByStatus = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const db = getDB();
    const eventsCollection = db.collection('events');
    const joinsCollection = db.collection('eventJoins');
    const now = new Date();

    // Get all events user has joined
    const joinedEvents = await joinsCollection
      .find({
        userId: typeof userId === 'string' ? new ObjectId(userId) : userId,
      })
      .toArray();

    const joinedEventIds = joinedEvents.map((join) => join.eventId);

    // Get all events user has created
    const createdEvents = await Event.findByCreator(userId, 1000, 0);
    const createdEventIds = createdEvents.map((event) => event._id);

    // Combine all event IDs (remove duplicates)
    const allEventIds = [
      ...new Set([
        ...joinedEventIds.map((id) => id.toString()),
        ...createdEventIds.map((id) => id.toString()),
      ]),
    ];

    if (allEventIds.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          upcoming: [],
          ongoing: [],
          past: [],
          cancelled: [],
          summary: {
            total: 0,
            upcoming: 0,
            ongoing: 0,
            past: 0,
            cancelled: 0,
          },
        },
      });
    }

    // Fetch all events
    const events = await eventsCollection
      .find({
        _id: { $in: allEventIds.map((id) => new ObjectId(id)) },
      })
      .toArray();

    // Categorize events
    const upcoming = [];
    const ongoing = [];
    const past = [];
    const cancelled = [];

    for (const event of events) {
      // Get creator details
      const creator = await User.findById(event.creatorId);
      
      const eventData = {
        ...formatEventResponse(event),
        gameCreatorEmail: event.gameCreatorEmail || (creator ? creator.email : null),
        gameCreatorProfilePic: event.gameCreatorProfilePic || (creator ? creator.profilePic : null),
        isCreator: event.creatorId.toString() === userId.toString(),
        hasJoined: joinedEventIds.some((id) => id.toString() === event._id.toString()),
      };

      // Categorize based on status and date
      const eventStartDate = event.gameStartDate ? new Date(event.gameStartDate) : null;
      
      // Priority 1: Check if event is cancelled
      if (event.status === 'cancelled') {
        cancelled.push(eventData);
      }
      // Priority 2: Check if event is currently running (status ongoing)
      else if (event.status === 'ongoing') {
        ongoing.push(eventData);
      }
      // Priority 3: Check if event is completed
      else if (event.status === 'completed') {
        past.push(eventData);
      }
      // Priority 4: Check if event is upcoming (status upcoming)
      else if (event.status === 'upcoming') {
        upcoming.push(eventData);
      }
      // Priority 5: Categorize based on date if status is not set or unclear
      else {
        if (eventStartDate) {
          if (eventStartDate > now) {
            // Future date - upcoming
            upcoming.push(eventData);
          } else {
            // Past date - completed/past
            past.push(eventData);
          }
        } else {
          // No date information, default to upcoming
          upcoming.push(eventData);
        }
      }
    }

    // Sort events
    upcoming.sort((a, b) => new Date(a.gameStartDate) - new Date(b.gameStartDate));
    ongoing.sort((a, b) => new Date(a.gameStartDate) - new Date(b.gameStartDate));
    past.sort((a, b) => new Date(b.gameStartDate) - new Date(a.gameStartDate));
    cancelled.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    res.status(200).json({
      success: true,
      data: {
        upcoming,
        ongoing,
        past,
        cancelled,
        summary: {
          total: events.length,
          upcoming: upcoming.length,
          ongoing: ongoing.length,
          past: past.length,
          cancelled: cancelled.length,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMyEventsByStatus,
};

