/**
 * Centralized ID Management Utility
 * Ensures unique sequential IDs even under high traffic
 * Validates uniqueness before returning IDs
 * Handles retries and prevents ID collisions
 */

const Counter = require('../models/Counter');
const User = require('../models/User');
const Event = require('../models/Event');
const Payment = require('../models/Payment');
const { getDB } = require('../config/database');

/**
 * Get next unique user ID with uniqueness verification
 * Retries if ID collision detected (high traffic scenario)
 */
const getNextUniqueUserId = async (maxRetries = 5) => {
  let attempts = 0;
  
  while (attempts < maxRetries) {
    try {
      // Get next ID from counter
      const userId = await Counter.getNextUserId();
      
      // Verify uniqueness in users collection
      const db = getDB();
      const usersCollection = db.collection('users');
      const existingUser = await usersCollection.findOne({ userId: userId });
      
      if (!existingUser) {
        // ID is unique, return it
        return userId;
      }
      
      // Collision detected - this should be extremely rare
      // Log warning and retry
      console.warn(`User ID collision detected: ${userId}. Retrying... (attempt ${attempts + 1})`);
      attempts++;
      
      // Small delay before retry to avoid immediate collision
      await new Promise(resolve => setTimeout(resolve, 10 * attempts));
    } catch (error) {
      console.error('Error getting unique user ID:', error);
      attempts++;
      if (attempts >= maxRetries) {
        throw new Error('Failed to generate unique user ID after retries');
      }
    }
  }
  
  throw new Error('Failed to generate unique user ID: maximum retries exceeded');
};

/**
 * Get next unique event ID with uniqueness verification
 * Retries if ID collision detected (high traffic scenario)
 */
const getNextUniqueEventId = async (maxRetries = 5) => {
  let attempts = 0;
  
  while (attempts < maxRetries) {
    try {
      // Get next sequence from counter
      const eventSequence = await Counter.getNextEventId();
      const eventId = `E${eventSequence}`;
      
      // Verify uniqueness in events collection
      const db = getDB();
      const eventsCollection = db.collection('events');
      const existingEvent = await eventsCollection.findOne({ eventId: eventId });
      
      if (!existingEvent) {
        // ID is unique, return it
        return { sequence: eventSequence, eventId: eventId };
      }
      
      // Collision detected - this should be extremely rare
      console.warn(`Event ID collision detected: ${eventId}. Retrying... (attempt ${attempts + 1})`);
      attempts++;
      
      // Small delay before retry
      await new Promise(resolve => setTimeout(resolve, 10 * attempts));
    } catch (error) {
      console.error('Error getting unique event ID:', error);
      attempts++;
      if (attempts >= maxRetries) {
        throw new Error('Failed to generate unique event ID after retries');
      }
    }
  }
  
  throw new Error('Failed to generate unique event ID: maximum retries exceeded');
};

/**
 * Get next unique payment ID with uniqueness verification
 * Retries if ID collision detected (high traffic scenario)
 */
const getNextUniquePaymentId = async (maxRetries = 5) => {
  let attempts = 0;
  
  while (attempts < maxRetries) {
    try {
      // Get next ID from counter
      const paymentId = await Counter.getNextPaymentId();
      
      // Verify uniqueness in payments collection
      const db = getDB();
      const paymentsCollection = db.collection('payments');
      const existingPayment = await paymentsCollection.findOne({ paymentId: paymentId });
      
      if (!existingPayment) {
        // ID is unique, return it
        return paymentId;
      }
      
      // Collision detected
      console.warn(`Payment ID collision detected: ${paymentId}. Retrying... (attempt ${attempts + 1})`);
      attempts++;
      
      await new Promise(resolve => setTimeout(resolve, 10 * attempts));
    } catch (error) {
      console.error('Error getting unique payment ID:', error);
      attempts++;
      if (attempts >= maxRetries) {
        throw new Error('Failed to generate unique payment ID after retries');
      }
    }
  }
  
  throw new Error('Failed to generate unique payment ID: maximum retries exceeded');
};

/**
 * Verify user ID uniqueness
 */
const verifyUserIdUniqueness = async (userId) => {
  const db = getDB();
  const usersCollection = db.collection('users');
  const existing = await usersCollection.findOne({ userId: userId });
  return !existing; // Returns true if unique
};

/**
 * Verify event ID uniqueness
 */
const verifyEventIdUniqueness = async (eventId) => {
  const db = getDB();
  const eventsCollection = db.collection('events');
  const existing = await eventsCollection.findOne({ eventId: eventId });
  return !existing; // Returns true if unique
};

/**
 * Verify payment ID uniqueness
 */
const verifyPaymentIdUniqueness = async (paymentId) => {
  const db = getDB();
  const paymentsCollection = db.collection('payments');
  const existing = await paymentsCollection.findOne({ paymentId: paymentId });
  return !existing; // Returns true if unique
};

/**
 * Convert any ID format to sequential userId
 * Handles: sequential userId (number), MongoDB ObjectId, or string
 */
const toSequentialUserId = async (id) => {
  if (!id) return null;
  
  // If it's already a number, verify it exists
  if (typeof id === 'number' || (!isNaN(id) && parseInt(id).toString() === id.toString())) {
    const userId = parseInt(id);
    const user = await User.findByUserId(userId);
    return user ? userId : null;
  }
  
  // Try as MongoDB ObjectId
  try {
    const user = await User.findById(id);
    return user ? user.userId : null;
  } catch (error) {
    return null;
  }
};

/**
 * Convert any ID format to sequential eventId
 * Handles: sequential eventId (E1, E2), MongoDB ObjectId, or string
 */
const toSequentialEventId = async (id) => {
  if (!id) return null;
  
  // If it's already in E1, E2 format
  if (typeof id === 'string' && id.startsWith('E')) {
    const event = await Event.findByEventId(id);
    return event ? event.eventId : null;
  }
  
  // Try as MongoDB ObjectId
  try {
    const event = await Event.findById(id);
    return event ? event.eventId : null;
  } catch (error) {
    return null;
  }
};

/**
 * Get MongoDB ObjectId from sequential userId
 */
const userIdToMongoId = async (userId) => {
  if (!userId) return null;
  
  const user = await User.findByUserId(userId);
  return user ? user._id : null;
};

/**
 * Get MongoDB ObjectId from sequential eventId
 */
const eventIdToMongoId = async (eventId) => {
  if (!eventId) return null;
  
  // Handle E1, E2 format
  if (typeof eventId === 'string' && eventId.startsWith('E')) {
    const event = await Event.findByEventId(eventId);
    return event ? event._id : null;
  }
  
  // Try as MongoDB ObjectId
  try {
    const event = await Event.findById(eventId);
    return event ? event._id : null;
  } catch (error) {
    return null;
  }
};

/**
 * Get next unique favorite ID with uniqueness verification
 * Retries if ID collision detected (high traffic scenario)
 */
const getNextUniqueFavoriteId = async (maxRetries = 5) => {
  let attempts = 0;
  
  while (attempts < maxRetries) {
    try {
      // Get next ID from counter
      const favoriteId = await Counter.getNextFavoriteId();
      
      // Verify uniqueness in favorites collection
      const db = getDB();
      const favoritesCollection = db.collection('favorites');
      const existingFavorite = await favoritesCollection.findOne({ favoriteId: favoriteId });
      
      if (!existingFavorite) {
        // ID is unique, return it
        return favoriteId;
      }
      
      // Collision detected
      console.warn(`Favorite ID collision detected: ${favoriteId}. Retrying... (attempt ${attempts + 1})`);
      attempts++;
      
      await new Promise(resolve => setTimeout(resolve, 10 * attempts));
    } catch (error) {
      console.error('Error getting unique favorite ID:', error);
      attempts++;
      if (attempts >= maxRetries) {
        throw new Error('Failed to generate unique favorite ID after retries');
      }
    }
  }
  
  throw new Error('Failed to generate unique favorite ID: maximum retries exceeded');
};

/**
 * Get next unique card ID with uniqueness verification
 * Retries if ID collision detected (high traffic scenario)
 */
const getNextUniqueCardId = async (maxRetries = 5) => {
  let attempts = 0;

  while (attempts < maxRetries) {
    try {
      const cardId = await Counter.getNextCardId();

      const db = getDB();
      const savedCardsCollection = db.collection('savedCards');
      const existing = await savedCardsCollection.findOne({ cardId: cardId });

      if (!existing) {
        return cardId;
      }

      console.warn(`Card ID collision detected: ${cardId}. Retrying... (attempt ${attempts + 1})`);
      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 10 * attempts));
    } catch (error) {
      console.error('Error getting unique card ID:', error);
      attempts++;
      if (attempts >= maxRetries) {
        throw new Error('Failed to generate unique card ID after retries');
      }
    }
  }

  throw new Error('Failed to generate unique card ID: maximum retries exceeded');
};

/**
 * Get next unique bank details ID with uniqueness verification
 */
const getNextUniqueBankDetailsId = async (maxRetries = 5) => {
  let attempts = 0;

  while (attempts < maxRetries) {
    try {
      const bankDetailsId = await Counter.getNextBankDetailsId();

      const db = getDB();
      const bankDetailsCollection = db.collection('organizerBankDetails');
      const existing = await bankDetailsCollection.findOne({ bankDetailsId });

      if (!existing) {
        return bankDetailsId;
      }

      console.warn(`BankDetails ID collision detected: ${bankDetailsId}. Retrying... (attempt ${attempts + 1})`);
      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 10 * attempts));
    } catch (error) {
      console.error('Error getting unique bankDetails ID:', error);
      attempts++;
      if (attempts >= maxRetries) {
        throw new Error('Failed to generate unique bankDetails ID after retries');
      }
    }
  }

  throw new Error('Failed to generate unique bankDetails ID: maximum retries exceeded');
};

/**
 * Get next unique private event join request ID with uniqueness verification
 */
const getNextUniqueEventJoinRequestId = async (maxRetries = 5) => {
  let attempts = 0;

  while (attempts < maxRetries) {
    try {
      const joinRequestId = await Counter.getNextEventJoinRequestId();

      const db = getDB();
      const col = db.collection('eventJoinRequests');
      const existing = await col.findOne({ joinRequestId });

      if (!existing) {
        return joinRequestId;
      }

      console.warn(`EventJoinRequest ID collision detected: ${joinRequestId}. Retrying... (attempt ${attempts + 1})`);
      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 10 * attempts));
    } catch (error) {
      console.error('Error getting unique eventJoinRequest ID:', error);
      attempts++;
      if (attempts >= maxRetries) {
        throw new Error('Failed to generate unique eventJoinRequest ID after retries');
      }
    }
  }

  throw new Error('Failed to generate unique eventJoinRequest ID: maximum retries exceeded');
};

/**
 * Get next unique event invite ID with uniqueness verification
 */
const getNextUniqueEventInviteId = async (maxRetries = 5) => {
  let attempts = 0;

  while (attempts < maxRetries) {
    try {
      const inviteId = await Counter.getNextEventInviteId();

      const db = getDB();
      const col = db.collection('eventInvites');
      const existing = await col.findOne({ inviteId });

      if (!existing) {
        return inviteId;
      }

      console.warn(`EventInvite ID collision detected: ${inviteId}. Retrying... (attempt ${attempts + 1})`);
      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 10 * attempts));
    } catch (error) {
      console.error('Error getting unique eventInvite ID:', error);
      attempts++;
      if (attempts >= maxRetries) {
        throw new Error('Failed to generate unique eventInvite ID after retries');
      }
    }
  }

  throw new Error('Failed to generate unique eventInvite ID: maximum retries exceeded');
};

/**
 * Verify favorite ID uniqueness
 */
const verifyFavoriteIdUniqueness = async (favoriteId) => {
  const db = getDB();
  const favoritesCollection = db.collection('favorites');
  const existing = await favoritesCollection.findOne({ favoriteId: favoriteId });
  return !existing; // Returns true if unique
};

module.exports = {
  getNextUniqueUserId,
  getNextUniqueEventId,
  getNextUniquePaymentId,
  getNextUniqueFavoriteId,
  getNextUniqueCardId,
  getNextUniqueBankDetailsId,
  getNextUniqueEventJoinRequestId,
  getNextUniqueEventInviteId,
  verifyUserIdUniqueness,
  verifyEventIdUniqueness,
  verifyPaymentIdUniqueness,
  verifyFavoriteIdUniqueness,
  toSequentialUserId,
  toSequentialEventId,
  userIdToMongoId,
  eventIdToMongoId,
};

