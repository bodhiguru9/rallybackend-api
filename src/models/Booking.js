const { getDB } = require('../config/database');
const { ObjectId } = require('mongodb');
const Counter = require('./Counter');

/**
 * Booking Model
 * Handles event bookings after payment
 */
class Booking {
  constructor(data) {
    this.bookingId = data.bookingId; // Sequential booking ID (booking1, booking2, etc.)
    this.userId = data.userId; // User who made the booking
    this.eventId = data.eventId; // Event being booked
    this.paymentId = data.paymentId; // Payment ID (PAY1, PAY2, etc.)
    this.paymentIntentId = data.paymentIntentId; // Stripe Payment Intent ID
    this.status = data.status || 'pending'; // 'pending', 'booked', 'cancelled', 'failed'
    this.amount = data.amount; // Booking amount
    this.discountAmount = data.discountAmount || 0; // Discount amount
    this.finalAmount = data.finalAmount; // Final amount after discount
    this.promoCode = data.promoCode || null; // Promo code used (if any)
    this.bookedAt = data.bookedAt || null; // When booking was confirmed
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  /**
   * Create a new booking
   */
  static async create(bookingData) {
    const db = getDB();
    const bookingsCollection = db.collection('bookings');

    // Generate sequential booking ID
    const bookingId = await Counter.getNextBookingId();

    // Convert IDs to ObjectIds
    let userId, eventId;
    try {
      userId = typeof bookingData.userId === 'string' ? new ObjectId(bookingData.userId) : bookingData.userId;
      eventId = typeof bookingData.eventId === 'string' ? new ObjectId(bookingData.eventId) : bookingData.eventId;
    } catch (error) {
      throw new Error('Invalid ID format');
    }

    const booking = new Booking({
      ...bookingData,
      bookingId: bookingId,
      userId,
      eventId,
    });

    const result = await bookingsCollection.insertOne(booking);

    return {
      _id: result.insertedId,
      ...booking,
    };
  }

  /**
   * Find booking by ID (sequential ID like booking1, booking2, etc. or MongoDB ObjectId)
   */
  static async findById(bookingId) {
    const db = getDB();
    const bookingsCollection = db.collection('bookings');

    // Check if it's a sequential ID (booking1, booking2, etc.)
    if (typeof bookingId === 'string' && bookingId.startsWith('booking')) {
      return await bookingsCollection.findOne({ bookingId: bookingId });
    }

    // Otherwise, treat as MongoDB ObjectId
    let objectId;
    try {
      objectId = typeof bookingId === 'string' ? new ObjectId(bookingId) : bookingId;
    } catch (error) {
      return null;
    }

    return await bookingsCollection.findOne({ _id: objectId });
  }

  /**
   * Find booking by payment intent ID
   */
  static async findByPaymentIntentId(paymentIntentId) {
    const db = getDB();
    const bookingsCollection = db.collection('bookings');

    return await bookingsCollection.findOne({
      paymentIntentId: paymentIntentId,
    });
  }

  /**
   * Find booking by payment ID
   */
  static async findByPaymentId(paymentId) {
    const db = getDB();
    const bookingsCollection = db.collection('bookings');

    return await bookingsCollection.findOne({
      paymentId: paymentId,
    });
  }

  /**
   * Update booking status
   */
  static async updateStatus(bookingId, status, additionalData = {}) {
    const db = getDB();
    const bookingsCollection = db.collection('bookings');

    let query;
    // Check if it's a sequential ID (booking1, booking2, etc.)
    if (typeof bookingId === 'string' && bookingId.startsWith('booking')) {
      query = { bookingId: bookingId };
    } else {
      // Otherwise, treat as MongoDB ObjectId
      let objectId;
      try {
        objectId = typeof bookingId === 'string' ? new ObjectId(bookingId) : bookingId;
      } catch (error) {
        return false;
      }
      query = { _id: objectId };
    }

    const updateData = {
      status,
      updatedAt: new Date(),
      ...additionalData,
    };

    // If status is 'booked', set bookedAt timestamp
    if (status === 'booked' && !additionalData.bookedAt) {
      updateData.bookedAt = new Date();
    }

    const result = await bookingsCollection.updateOne(
      query,
      { $set: updateData }
    );

    return result.modifiedCount > 0;
  }

  /**
   * Get bookings by user
   * Accepts sequential userId (1, 2, 3, etc.) or MongoDB ObjectId
   */
  static async findByUser(userId, status = null, limit = 50, skip = 0) {
    const db = getDB();
    const bookingsCollection = db.collection('bookings');
    const usersCollection = db.collection('users');

    let userObjectId;

    // Check if it's a sequential userId (number)
    if (!isNaN(userId) && parseInt(userId).toString() === userId.toString()) {
      // Find user by sequential userId
      const user = await usersCollection.findOne({ userId: parseInt(userId) });
      if (!user) {
        return [];
      }
      userObjectId = user._id;
    } else {
      // Treat as MongoDB ObjectId
      try {
        userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
      } catch (error) {
        return [];
      }
    }

    const query = { userId: userObjectId };
    if (status) {
      query.status = status;
    }

    return await bookingsCollection
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .toArray();
  }

  /**
   * Get bookings by event
   */
  static async findByEvent(eventId, status = null, limit = 50, skip = 0) {
    const db = getDB();
    const bookingsCollection = db.collection('bookings');

    let eventObjectId;
    try {
      eventObjectId = typeof eventId === 'string' ? new ObjectId(eventId) : eventId;
    } catch (error) {
      return [];
    }

    const query = { eventId: eventObjectId };
    if (status) {
      query.status = status;
    }

    return await bookingsCollection
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .toArray();
  }

  /**
   * Get pending bookings
   */
  static async getPendingBookings(userId = null, limit = 50, skip = 0) {
    const db = getDB();
    const bookingsCollection = db.collection('bookings');
    const usersCollection = db.collection('users');

    const query = { status: 'pending' };

    if (userId) {
      let userObjectId;
      // Check if it's a sequential userId (number)
      if (!isNaN(userId) && parseInt(userId).toString() === userId.toString()) {
        const user = await usersCollection.findOne({ userId: parseInt(userId) });
        if (!user) {
          return [];
        }
        userObjectId = user._id;
      } else {
        try {
          userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
        } catch (error) {
          return [];
        }
      }
      query.userId = userObjectId;
    }

    return await bookingsCollection
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .toArray();
  }

  /**
   * Get booked (confirmed) bookings
   */
  static async getBookedBookings(userId = null, limit = 50, skip = 0) {
    const db = getDB();
    const bookingsCollection = db.collection('bookings');
    const usersCollection = db.collection('users');

    const query = { status: 'booked' };

    if (userId) {
      let userObjectId;
      // Check if it's a sequential userId (number)
      if (!isNaN(userId) && parseInt(userId).toString() === userId.toString()) {
        const user = await usersCollection.findOne({ userId: parseInt(userId) });
        if (!user) {
          return [];
        }
        userObjectId = user._id;
      } else {
        try {
          userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
        } catch (error) {
          return [];
        }
      }
      query.userId = userObjectId;
    }

    return await bookingsCollection
      .find(query)
      .sort({ bookedAt: -1 })
      .limit(limit)
      .skip(skip)
      .toArray();
  }
}

module.exports = Booking;
