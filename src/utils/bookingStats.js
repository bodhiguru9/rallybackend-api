const { getDB } = require('../config/database');
const { ObjectId } = require('mongodb');

const normalizeObjectIds = (ids) => {
  if (!Array.isArray(ids)) return [];
  return ids
    .map((id) => {
      if (!id) return null;
      if (id instanceof ObjectId) return id;
      try {
        return new ObjectId(id);
      } catch (error) {
        return null;
      }
    })
    .filter(Boolean);
};

const getBookingStatsByUsers = async (userIds, options = {}) => {
  const db = getDB();
  const bookingsCollection = db.collection('bookings');
  const userObjectIds = normalizeObjectIds(userIds);

  if (userObjectIds.length === 0) {
    return new Map();
  }

  const match = {
    status: 'booked',
    userId: { $in: userObjectIds },
  };

  if (options.eventIds) {
    const eventObjectIds = normalizeObjectIds(options.eventIds);
    if (eventObjectIds.length === 0) {
      return new Map();
    }
    match.eventId = { $in: eventObjectIds };
  }

  const stats = await bookingsCollection
    .aggregate([
      { $match: match },
      {
        $group: {
          _id: '$userId',
          bookedCount: { $sum: 1 },
          totalSpent: { $sum: { $ifNull: ['$finalAmount', { $ifNull: ['$amount', 0] }] } },
          lastBookedAt: { $max: '$bookedAt' },
        },
      },
    ])
    .toArray();

  const statsMap = new Map();
  stats.forEach((entry) => {
    statsMap.set(entry._id.toString(), {
      bookedCount: entry.bookedCount || 0,
      totalSpent: entry.totalSpent || 0,
      lastBookedAt: entry.lastBookedAt || null,
    });
  });

  return statsMap;
};

/**
 * Aggregate booking counts, attendee counts, and sales totals per event.
 * Free events naturally come back with totalSales: 0 but non-zero
 * bookingCount/attendeeCount — this is how admin tooling tracks free
 * events alongside paid ones.
 */
const getBookingStatsByEvents = async (eventIds) => {
  const db = getDB();
  const bookingsCollection = db.collection('bookings');
  const eventObjectIds = normalizeObjectIds(eventIds);

  if (eventObjectIds.length === 0) {
    return new Map();
  }

  const stats = await bookingsCollection
    .aggregate([
      { $match: { status: 'booked', eventId: { $in: eventObjectIds } } },
      {
        $group: {
          _id: '$eventId',
          bookingCount: { $sum: 1 },
          attendeeCount: { $sum: { $ifNull: ['$guestsCount', 1] } },
          totalSales: { $sum: { $ifNull: ['$finalAmount', { $ifNull: ['$amount', 0] }] } },
        },
      },
    ])
    .toArray();

  const statsMap = new Map();
  stats.forEach((entry) => {
    statsMap.set(entry._id.toString(), {
      bookingCount: entry.bookingCount || 0,
      attendeeCount: entry.attendeeCount || 0,
      totalSales: entry.totalSales || 0,
    });
  });

  return statsMap;
};

module.exports = {
  getBookingStatsByUsers,
  getBookingStatsByEvents,
};
