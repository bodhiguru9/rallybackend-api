const EventBlock = require('../../models/EventBlock');
const Event = require('../../models/Event');
const { getPaginationParams, createPaginationResponse } = require('../../utils/pagination');
const { formatEventResponse } = require('../../utils/eventFields');

/**
 * Helper function to find event by sequential eventId or MongoDB ObjectId
 */
const findEventById = async (eventId) => {
  let event = null;
  
  // Check if it's a sequential eventId (E1, E2, etc.)
  if (typeof eventId === 'string' && eventId.startsWith('E')) {
    event = await Event.findByEventId(eventId);
  }
  
  // If not found by eventId, try MongoDB ObjectId
  if (!event) {
    event = await Event.findById(eventId);
  }
  
  return event;
};

/**
 * @desc    Block an event
 * @route   POST /api/event-block/:eventId
 * @access  Private
 */
const blockEvent = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.id;

    // Find event to block
    const eventToBlock = await findEventById(eventId);

    if (!eventToBlock) {
      return res.status(404).json({
        success: false,
        error: 'Event not found',
        suggestion: 'Please provide a valid event ID (sequential eventId like E1, or MongoDB ObjectId)',
      });
    }

    // Use MongoDB ObjectId for EventBlock operations
    const eventToBlockMongoId = eventToBlock._id.toString();

    // Check if already blocked
    const isAlreadyBlocked = await EventBlock.isBlocked(userId, eventToBlockMongoId);
    if (isAlreadyBlocked) {
      return res.status(400).json({
        success: false,
        error: 'Event is already blocked',
      });
    }

    // Create block relationship
    await EventBlock.create(userId, eventToBlockMongoId);

    // Get updated counts
    const blockedCount = await EventBlock.getBlockedCount(userId);

    res.status(200).json({
      success: true,
      message: 'Event blocked successfully',
      data: {
        blockedEvent: {
          eventId: eventToBlock.eventId,
          mongoId: eventToBlock._id.toString(),
          eventTitle: eventToBlock.eventName || null,
          eventName: eventToBlock.eventName || null,
          eventCategory: Array.isArray(eventToBlock.eventSports) && eventToBlock.eventSports.length > 0 ? eventToBlock.eventSports[0] : null,
          eventType: eventToBlock.eventType || null,
          gameCreatorName: eventToBlock.gameCreatorName,
        },
        blockedCount,
        isBlocked: true,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Unblock an event
 * @route   DELETE /api/event-block/:eventId
 * @access  Private
 */
const unblockEvent = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.id;

    // Find event to unblock
    const eventToUnblock = await findEventById(eventId);

    if (!eventToUnblock) {
      return res.status(404).json({
        success: false,
        error: 'Event not found',
        suggestion: 'Please provide a valid event ID (sequential eventId like E1, or MongoDB ObjectId)',
      });
    }

    // Use MongoDB ObjectId for EventBlock operations
    const eventToUnblockMongoId = eventToUnblock._id.toString();

    // Remove block relationship
    const removed = await EventBlock.remove(userId, eventToUnblockMongoId);

    if (!removed) {
      return res.status(400).json({
        success: false,
        error: 'Event is not blocked',
      });
    }

    // Get updated counts
    const blockedCount = await EventBlock.getBlockedCount(userId);

    res.status(200).json({
      success: true,
      message: 'Event unblocked successfully',
      data: {
        unblockedEvent: {
          eventId: eventToUnblock.eventId,
          mongoId: eventToUnblock._id.toString(),
          eventTitle: eventToUnblock.eventName || null,
          eventName: eventToUnblock.eventName || null,
          eventCategory: Array.isArray(eventToUnblock.eventSports) && eventToUnblock.eventSports.length > 0 ? eventToUnblock.eventSports[0] : null,
          eventType: eventToUnblock.eventType || null,
          gameCreatorName: eventToUnblock.gameCreatorName,
        },
        blockedCount,
        isBlocked: false,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get list of events blocked by the logged-in user
 * @route   GET /api/event-block/blocked?page=1
 * @access  Private
 * 
 * Uses page-based pagination: 20 items per page
 * Query parameter: page (default: 1)
 */
const getBlockedEvents = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { page, perPage, skip } = getPaginationParams(req.query.page, 20);

    const blockedEvents = await EventBlock.getBlockedEvents(userId, perPage, skip);
    const totalCount = await EventBlock.getBlockedCount(userId);
    const pagination = createPaginationResponse(totalCount, page, perPage);

    res.status(200).json({
      success: true,
      data: {
        blockedEvents,
        totalCount,
        pagination,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get list of users who blocked an event
 * @route   GET /api/event-block/:eventId/blocked-by?page=1
 * @access  Private (Organiser only - event creator can see who blocked their event)
 * 
 * Uses page-based pagination: 20 items per page
 * Query parameter: page (default: 1)
 */
const getBlockedByUsers = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.id;

    // Find event
    const event = await findEventById(eventId);

    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found',
        suggestion: 'Please provide a valid event ID (sequential eventId like E1, or MongoDB ObjectId)',
      });
    }

    // Check if user is the event creator (only creator can see who blocked their event)
    const eventCreatorId = event.creatorId.toString();
    const currentUserId = userId.toString();

    if (eventCreatorId !== currentUserId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized. Only the event creator can view who blocked this event',
      });
    }

    const { page, perPage, skip } = getPaginationParams(req.query.page, 20);
    const eventMongoId = event._id.toString();

    const blockedByUsers = await EventBlock.getBlockedByUsers(eventMongoId, perPage, skip);
    const totalCount = await EventBlock.getBlockedByCount(eventMongoId);
    const pagination = createPaginationResponse(totalCount, page, perPage);

    res.status(200).json({
      success: true,
      data: {
        event: {
          eventId: event.eventId,
          mongoId: event._id.toString(),
          eventTitle: event.eventName || null,
          eventName: event.eventName || null,
          eventCategory: Array.isArray(event.eventSports) && event.eventSports.length > 0 ? event.eventSports[0] : null,
          eventType: event.eventType || null,
        },
        blockedByUsers,
        totalCount,
        pagination,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Check if an event is blocked by the logged-in user
 * @route   GET /api/event-block/:eventId/status
 * @access  Private
 */
const getBlockStatus = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.id;

    // Find event to check
    const eventToCheck = await findEventById(eventId);

    if (!eventToCheck) {
      return res.status(404).json({
        success: false,
        error: 'Event not found',
        suggestion: 'Please provide a valid event ID (sequential eventId like E1, or MongoDB ObjectId)',
      });
    }

    // Use MongoDB ObjectId for EventBlock operations
    const eventToCheckMongoId = eventToCheck._id.toString();

    const isBlocked = await EventBlock.isBlocked(userId, eventToCheckMongoId);

    res.status(200).json({
      success: true,
      data: {
        isBlocked,
        event: {
          eventId: eventToCheck.eventId,
          mongoId: eventToCheck._id.toString(),
          eventTitle: eventToCheck.eventName || null,
          eventName: eventToCheck.eventName || null,
          eventCategory: Array.isArray(eventToCheck.eventSports) && eventToCheck.eventSports.length > 0 ? eventToCheck.eventSports[0] : null,
          eventType: eventToCheck.eventType || null,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Check block status for multiple events
 * @route   POST /api/event-block/status/batch
 * @access  Private
 * 
 * Body: { eventIds: ["E1", "E2", "mongoid1", "mongoid2"] }
 */
const getBatchBlockStatus = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Check if request body exists
    if (!req.body) {
      return res.status(400).json({
        success: false,
        error: 'Request body is required',
        details: 'Please send a JSON body with eventIds array',
        example: {
          eventIds: ['E1', 'E2', '507f1f77bcf86cd799439011']
        }
      });
    }

    const { eventIds } = req.body;

    // Validate eventIds
    if (!eventIds) {
      return res.status(400).json({
        success: false,
        error: 'eventIds is required in request body',
        details: 'Please provide eventIds as an array in the request body',
        example: {
          eventIds: ['E1', 'E2', '507f1f77bcf86cd799439011']
        },
        received: {
          body: req.body,
          bodyKeys: Object.keys(req.body || {})
        }
      });
    }

    if (!Array.isArray(eventIds)) {
      return res.status(400).json({
        success: false,
        error: 'eventIds must be an array',
        details: `Received type: ${typeof eventIds}`,
        example: {
          eventIds: ['E1', 'E2', '507f1f77bcf86cd799439011']
        }
      });
    }

    if (eventIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'eventIds array must not be empty',
        details: 'Please provide at least one event ID',
        example: {
          eventIds: ['E1', 'E2']
        }
      });
    }

    if (eventIds.length > 100) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 100 event IDs allowed per request',
      });
    }

    // Convert all eventIds to MongoDB ObjectIds (optimized - single pass)
    const { ObjectId } = require('mongodb');
    const eventMongoIds = [];
    const eventIdToMongoIdMap = {}; // Map original eventId to mongoId string

    // Process all eventIds in parallel for better performance
    const eventPromises = eventIds.map(async (eventId) => {
      let event = null;
      
      // Try sequential eventId first
      if (typeof eventId === 'string' && eventId.startsWith('E')) {
        event = await Event.findByEventId(eventId);
      }
      
      // If not found, try MongoDB ObjectId
      if (!event) {
        try {
          const objectId = new ObjectId(eventId);
          event = await Event.findById(objectId);
        } catch (error) {
          // Invalid ObjectId format, skip
        }
      }

      if (event) {
        const mongoIdStr = event._id.toString();
        eventMongoIds.push(event._id);
        eventIdToMongoIdMap[eventId] = mongoIdStr;
      }
      
      return { eventId, event };
    });

    await Promise.all(eventPromises);

    if (eventMongoIds.length === 0) {
      // Return all false if no valid events found
      const statusMap = {};
      eventIds.forEach(id => {
        statusMap[id] = false;
      });
      return res.status(200).json({
        success: true,
        data: {
          blockStatus: statusMap,
        },
      });
    }

    // Get blocked events map (single query for all events)
    const blockedMap = await EventBlock.getBlockedEventsMap(userId, eventMongoIds);

    // Map back to original eventIds using cached mapping
    const statusMap = {};
    eventIds.forEach(eventId => {
      const mongoIdStr = eventIdToMongoIdMap[eventId];
      if (mongoIdStr) {
        statusMap[eventId] = blockedMap[mongoIdStr] || false;
      } else {
        statusMap[eventId] = false;
      }
    });

    res.status(200).json({
      success: true,
      data: {
        blockStatus: statusMap,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  blockEvent,
  unblockEvent,
  getBlockedEvents,
  getBlockedByUsers,
  getBlockStatus,
  getBatchBlockStatus,
};

