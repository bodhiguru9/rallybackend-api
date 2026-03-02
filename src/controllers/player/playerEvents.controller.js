const { getDB } = require('../../config/database');
const { ObjectId } = require('mongodb');
const Event = require('../../models/Event');
const EventJoin = require('../../models/EventJoin');
const Waitlist = require('../../models/Waitlist');
const EventReminder = require('../../models/EventReminder');
const User = require('../../models/User');
const { formatEventResponse, calculateTimeUntilStart } = require('../../utils/eventFields');
const { getPaginationParams, createPaginationResponse } = require('../../utils/pagination');

/**
 * @desc    Get all player events (joined, waitlist, reminders) - Optimized single API
 * @route   GET /api/player/events?page=1
 * @access  Private
 * 
 * Returns all events related to the player:
 * - Joined events (events the player has joined)
 * - Waitlist events (events where player has pending join requests)
 * - Reminder events (events where player has set reminders)
 * 
 * Optimized with single query and efficient data aggregation
 */
const getPlayerEvents = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { page, perPage, skip } = getPaginationParams(req.query.page, 20);
    
    const db = getDB();
    const userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;

    // Parallel queries for optimization
    const [
      joinedEventsData,
      waitlistEventsData,
      reminderEventsData
    ] = await Promise.all([
      // 1. Get joined events
      EventJoin.getUserJoinedEvents(userId, 1000, 0),
      
      // 2. Get waitlist events (pending requests)
      (async () => {
        const waitlistCollection = db.collection('waitlist');
        const eventJoinRequestsCollection = db.collection('eventJoinRequests');
        const waitlistItems = await waitlistCollection
          .find({
            userId: userObjectId,
            status: 'pending',
          })
          .toArray();

        const pendingItems = await eventJoinRequestsCollection
          .find({
            userId: userObjectId,
            status: 'pending',
          })
          .toArray();

        const allItems = [
          ...pendingItems.map((i) => ({ ...i, requestType: 'pending-request' })),
          ...waitlistItems.map((i) => ({ ...i, requestType: 'waitlist' })),
        ];
        
        if (allItems.length === 0) return [];
        
        const eventIds = allItems.map(w => w.eventId);
        const eventsCollection = db.collection('events');
        const events = await eventsCollection
          .find({ _id: { $in: eventIds } })
          .toArray();
        
        return events.map(event => {
          const item = allItems.find(w => w.eventId.toString() === event._id.toString());
          return {
            event,
            requestType: item?.requestType || 'waitlist',
            joinRequestId: item?.requestType === 'pending-request' ? (item?.joinRequestId || null) : (item?.waitlistId || null),
            waitlistId: item?.requestType === 'waitlist' ? item?._id : null,
            requestedAt: item?.createdAt || null,
          };
        });
      })(),
      
      // 3. Get reminder events
      (async () => {
        // Get reminders directly from collection to get eventIds
        const reminderCollection = db.collection('eventReminders');
        const reminderDocs = await reminderCollection
          .find({ userId: userObjectId })
          .toArray();
        
        if (reminderDocs.length === 0) return [];
        
        const reminderEventIds = reminderDocs.map(r => r.eventId);
        const eventsCollection = db.collection('events');
        const events = await eventsCollection
          .find({ _id: { $in: reminderEventIds } })
          .toArray();
        
        return reminderDocs.map(reminderDoc => {
          const event = events.find(e => e._id.toString() === reminderDoc.eventId.toString());
          return {
            event: event || null,
            reminder: {
              reminderId: reminderDoc._id.toString(),
              reminderType: reminderDoc.reminderType || 'event_start',
              reminderTime: reminderDoc.reminderTime,
              notificationSent: reminderDoc.notificationSent || false,
            },
          };
        }).filter(item => item.event !== null);
      })(),
    ]);

    // Extract event IDs from all sources
    const joinedEventIds = joinedEventsData.map(e => e._id.toString());
    const waitlistEventIds = waitlistEventsData.map(w => w.event._id.toString());
    const reminderEventIds = reminderEventsData.map(r => r.event._id.toString());

    // Combine all unique event IDs
    const allEventIds = [...new Set([
      ...joinedEventIds,
      ...waitlistEventIds,
      ...reminderEventIds,
    ])];

    if (allEventIds.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'Player events retrieved successfully',
        data: {
          joinedEvents: [],
          waitlistEvents: [],
          reminderEvents: [],
          summary: {
            totalJoined: 0,
            totalWaitlist: 0,
            totalReminders: 0,
            totalUniqueEvents: 0,
          },
          pagination: createPaginationResponse(0, page, perPage),
        },
      });
    }

    // Get all unique events in one query
    const eventsCollection = db.collection('events');
    const allEvents = await eventsCollection
      .find({ _id: { $in: allEventIds.map(id => new ObjectId(id)) } })
      .toArray();

    // Process events with their relationships
    const processedEvents = await Promise.all(
      allEvents.map(async (event) => {
        const eventIdStr = event._id.toString();
        const isJoined = joinedEventIds.includes(eventIdStr);
        const isInWaitlist = waitlistEventIds.includes(eventIdStr);
        const hasReminder = reminderEventIds.includes(eventIdStr);

        // Get waitlist info if applicable
        let waitlistInfo = null;
        if (isInWaitlist) {
          const waitlistItem = waitlistEventsData.find(w => w.event._id.toString() === eventIdStr);
          waitlistInfo = {
            waitlistId: waitlistItem?.waitlistId?.toString(),
            requestedAt: waitlistItem?.waitlistCreatedAt,
            status: 'pending',
          };
        }

        // Get reminder info if applicable
        let reminderInfo = null;
        if (hasReminder) {
          const reminderItem = reminderEventsData.find(r => r.event._id.toString() === eventIdStr);
          if (reminderItem?.reminder) {
            reminderInfo = {
              reminderId: reminderItem.reminder.reminderId,
              reminderType: reminderItem.reminder.reminderType,
              reminderTime: reminderItem.reminder.reminderTime,
              notificationSent: reminderItem.reminder.notificationSent,
            };
          }
        }

        // Get creator details
        const creator = await User.findById(event.creatorId);
        const creatorData = creator ? {
          userId: creator.userId,
          fullName: creator.fullName,
          profilePic: creator.profilePic,
          communityName: creator.communityName,
        } : null;

        // Calculate spots info
        const isPrivate = event.IsPrivateEvent !== undefined ? event.IsPrivateEvent : false;
        const maxGuest = event.eventMaxGuest !== undefined ? event.eventMaxGuest : (event.gameSpots || 0);
        let participantsCount = 0;
        if (!isPrivate) {
          participantsCount = await EventJoin.getParticipantCount(event._id);
        }
        const spotsFull = participantsCount >= maxGuest;

        // Calculate time until start for upcoming events
        const eventDateTime = event.eventDateTime || event.gameStartDate;
        const eventStatus = event.eventStatus || 'upcoming';
        const timeUntilStart = eventStatus === 'upcoming' && eventDateTime 
          ? calculateTimeUntilStart(eventDateTime) 
          : null;

        return {
          ...formatEventResponse(event),
          creator: creatorData,
          timeUntilStart: timeUntilStart,
          spotsInfo: {
            totalSpots: maxGuest,
            spotsBooked: participantsCount,
            spotsLeft: Math.max(0, maxGuest - participantsCount),
            spotsFull: spotsFull,
          },
          playerStatus: {
            hasJoined: isJoined,
            inWaitlist: isInWaitlist,
            hasReminder: hasReminder,
            waitlistInfo: waitlistInfo,
            reminderInfo: reminderInfo,
          },
        };
      })
    );

    // Separate events by category
    const joinedEvents = processedEvents.filter(e => e.playerStatus.hasJoined);
    const waitlistEvents = processedEvents.filter(e => e.playerStatus.inWaitlist && !e.playerStatus.hasJoined);
    const reminderEvents = processedEvents.filter(e => e.playerStatus.hasReminder && !e.playerStatus.hasJoined && !e.playerStatus.inWaitlist);

    // Sort events by date (upcoming first)
    const sortByDate = (a, b) => {
      const dateA = new Date(a.eventDateTime || 0);
      const dateB = new Date(b.eventDateTime || 0);
      return dateA - dateB;
    };

    joinedEvents.sort(sortByDate);
    waitlistEvents.sort(sortByDate);
    reminderEvents.sort(sortByDate);

    // Apply pagination to combined results (or separate if needed)
    const allCombinedEvents = [...joinedEvents, ...waitlistEvents, ...reminderEvents];
    const paginatedEvents = allCombinedEvents.slice(skip, skip + perPage);
    const totalCount = allCombinedEvents.length;
    const pagination = createPaginationResponse(totalCount, page, perPage);

    res.status(200).json({
      success: true,
      message: 'Player events retrieved successfully',
      data: {
        joinedEvents: joinedEvents,
        waitlistEvents: waitlistEvents,
        reminderEvents: reminderEvents,
        allEvents: paginatedEvents, // Paginated combined list
        summary: {
          totalJoined: joinedEvents.length,
          totalWaitlist: waitlistEvents.length,
          totalReminders: reminderEvents.length,
          totalUniqueEvents: allEventIds.length,
        },
        pagination: pagination,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPlayerEvents,
};
