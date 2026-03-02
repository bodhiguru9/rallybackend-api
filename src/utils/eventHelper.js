const Event = require('../models/Event');
const { ObjectId } = require('mongodb');

/**
 * Find event by either sequential eventId (E1, E2, etc.) or MongoDB ObjectId
 * @param {string|ObjectId} eventId - Either sequential ID (E1, E2), MongoDB ObjectId string, or ObjectId object
 * @returns {Promise<Object|null>} Event object or null if not found
 */
const findEventById = async (eventId) => {
  if (!eventId) {
    return null;
  }

  // Handle MongoDB ObjectId objects - convert to string
  if (eventId instanceof ObjectId) {
    return await Event.findById(eventId.toString());
  }

  // Ensure eventId is a string for string operations
  const eventIdString = String(eventId);

  // Check if it's a sequential eventId (E1, E2, etc.)
  if (eventIdString.startsWith('E') && /^E\d+$/.test(eventIdString)) {
    return await Event.findByEventId(eventIdString);
  }
  
  // Check if it's a MongoDB ObjectId string (24 characters, hex)
  if (eventIdString.length === 24 && /^[a-fA-F0-9]{24}$/.test(eventIdString)) {
    return await Event.findById(eventIdString);
  }

  // Invalid format
  return null;
};

/**
 * Validate eventId format
 * @param {string|ObjectId} eventId - Event ID to validate
 * @returns {Object} Validation result with isValid and type
 */
const validateEventId = (eventId) => {
  if (!eventId) {
    return {
      isValid: false,
      type: null,
      error: 'Event ID is required',
    };
  }

  // Handle MongoDB ObjectId objects - convert to string
  if (eventId instanceof ObjectId) {
    return {
      isValid: true,
      type: 'objectId',
      error: null,
    };
  }

  // Ensure eventId is a string for string operations
  const eventIdString = String(eventId);

  // Check if it's a sequential eventId (E1, E2, etc.)
  if (eventIdString.startsWith('E') && /^E\d+$/.test(eventIdString)) {
    return {
      isValid: true,
      type: 'sequential',
      error: null,
    };
  }

  // Check if it's a MongoDB ObjectId string (24 characters, hex)
  if (eventIdString.length === 24 && /^[a-fA-F0-9]{24}$/.test(eventIdString)) {
    return {
      isValid: true,
      type: 'objectId',
      error: null,
    };
  }

  return {
    isValid: false,
    type: null,
    error: 'Invalid event ID format. Use either sequential ID (E1, E2, etc.) or MongoDB ObjectId (24 characters)',
  };
};

module.exports = {
  findEventById,
  validateEventId,
};

