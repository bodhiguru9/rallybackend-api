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
          totalSpent: { $sum: { $ifNull: ['$finalAmount', 0] } },
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

module.exports = {
  getBookingStatsByUsers,
};
