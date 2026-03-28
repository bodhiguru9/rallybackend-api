const { getDB } = require('../config/database');
const { ObjectId } = require('mongodb');
const Counter = require('./Counter');

/**
 * Booking Model
 * Handles event bookings after payment
 */
class Booking {
  constructor(data) {
    this.bookingId = data.bookingId; // Sequential booking ID
    this.userId = data.userId;
    this.eventId = data.eventId; // Parent event Mongo _id
    this.parentEventId = data.parentEventId || null; // Sequential eventId like E95
    this.occurrenceStart = data.occurrenceStart || null; // ISO date of selected occurrence
    this.occurrenceEnd = data.occurrenceEnd || null; // ISO end date of selected occurrence
    this.paymentId = data.paymentId;
    this.paymentIntentId = data.paymentIntentId;
    this.status = data.status || 'pending'; // 'pending', 'booked', 'cancelled', 'failed'
    this.amount = data.amount;
    this.discountAmount = data.discountAmount || 0;
    this.finalAmount = data.finalAmount;
    this.promoCode = data.promoCode || null;
    this.bookedAt = data.bookedAt || null;
    this.cancelledAt = data.cancelledAt || null;
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  static async create(bookingData) {
    const db = getDB();
    const bookingsCollection = db.collection('bookings');

    const bookingId = await Counter.getNextBookingId();

    let userId, eventId;
    try {
      userId = typeof bookingData.userId === 'string' ? new ObjectId(bookingData.userId) : bookingData.userId;
      eventId = typeof bookingData.eventId === 'string' ? new ObjectId(bookingData.eventId) : bookingData.eventId;
    } catch (error) {
      throw new Error('Invalid ID format');
    }

    const booking = new Booking({
      ...bookingData,
      bookingId,
      userId,
      eventId,
      occurrenceStart: bookingData.occurrenceStart ? new Date(bookingData.occurrenceStart).toISOString() : null,
      occurrenceEnd: bookingData.occurrenceEnd ? new Date(bookingData.occurrenceEnd).toISOString() : null,
    });

    const result = await bookingsCollection.insertOne(booking);

    return {
      _id: result.insertedId,
      ...booking,
    };
  }

  static async findById(bookingId) {
    const db = getDB();
    const bookingsCollection = db.collection('bookings');

    if (typeof bookingId === 'string' && bookingId.startsWith('booking')) {
      return await bookingsCollection.findOne({ bookingId });
    }

    let objectId;
    try {
      objectId = typeof bookingId === 'string' ? new ObjectId(bookingId) : bookingId;
    } catch (error) {
      return null;
    }

    return await bookingsCollection.findOne({ _id: objectId });
  }

  static async findByPaymentIntentId(paymentIntentId) {
    const db = getDB();
    const bookingsCollection = db.collection('bookings');

    return await bookingsCollection.findOne({ paymentIntentId });
  }

  static async findByPaymentId(paymentId) {
    const db = getDB();
    const bookingsCollection = db.collection('bookings');

    return await bookingsCollection.findOne({ paymentId });
  }

  static async findPendingByUserEventOccurrence(userId, eventId, occurrenceStart) {
    const db = getDB();
    const bookingsCollection = db.collection('bookings');

    let userObjectId;
    let eventObjectId;

    try {
      userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
      eventObjectId = typeof eventId === 'string' ? new ObjectId(eventId) : eventId;
    } catch (error) {
      return null;
    }

    return await bookingsCollection.findOne({
      userId: userObjectId,
      eventId: eventObjectId,
      occurrenceStart: occurrenceStart ? new Date(occurrenceStart).toISOString() : null,
      status: 'pending',
    });
  }

  static async updateStatus(bookingId, status, additionalData = {}) {
    const db = getDB();
    const bookingsCollection = db.collection('bookings');

    let query;
    if (typeof bookingId === 'string' && bookingId.startsWith('booking')) {
      query = { bookingId };
    } else {
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

    if (status === 'booked' && !additionalData.bookedAt) {
      updateData.bookedAt = new Date();
    }

    if (status === 'cancelled' && !additionalData.cancelledAt) {
      updateData.cancelledAt = new Date();
    }

    const result = await bookingsCollection.updateOne(query, { $set: updateData });
    return result.modifiedCount > 0;
  }

  static async findByUser(userId, status = null, limit = 50, skip = 0) {
    const db = getDB();
    const bookingsCollection = db.collection('bookings');
    const usersCollection = db.collection('users');

    let userObjectId;

    if (!isNaN(userId) && parseInt(userId).toString() === userId.toString()) {
      const user = await usersCollection.findOne({ userId: parseInt(userId) });
      if (!user) return [];
      userObjectId = user._id;
    } else {
      try {
        userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
      } catch (error) {
        return [];
      }
    }

    const query = { userId: userObjectId };
    if (status) query.status = status;

    return await bookingsCollection
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .toArray();
  }
}

module.exports = Booking;