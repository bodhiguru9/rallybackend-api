/**
 * Read-side queries for promo codes, shared by the organiser API (/api/promo-codes) and the admin API.
 * Everything here is read-only. Numbers come from promoRedemptions (the source of truth).
 */
const { ObjectId } = require('mongodb');
const { getDB } = require('../config/database');

const escapeRegex = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toObjectId = (id) => {
  if (id instanceof ObjectId) {
    return id;
  }
  try {
    return new ObjectId(String(id));
  } catch (e) {
    return null;
  }
};

/** Find a code by Mongo _id or sequential PRO# id. */
async function findCode(idOrPro, extraFilter = {}) {
  const key = String(idOrPro);
  const filter = /^PRO\d+$/.test(key) ? { promoCodeId: key } : { _id: toObjectId(key) };
  if (!filter._id && !filter.promoCodeId) {
    return null;
  }
  return getDB().collection('promoCodes').findOne({ ...filter, ...extraFilter });
}

/** active | paused | expired | used_up | archived */
function computeState(code, now = new Date()) {
  if (code.archivedAt) {
    return 'archived';
  }
  if (code.validUntil && new Date(code.validUntil) < now) {
    return 'expired';
  }
  if (code.usageLimit !== null && code.usageLimit !== undefined && (code.usedCount || 0) >= code.usageLimit) {
    return 'used_up';
  }
  if (!code.isActive) {
    return 'paused';
  }
  return 'active';
}

function toPromoCodeDto(code, now = new Date()) {
  return {
    id: String(code._id),
    promoCodeId: code.promoCodeId,
    code: code.code,
    description: code.description || null,
    discountType: code.discountType,
    discountValue: code.discountValue,
    minPurchaseAmount: code.minPurchaseAmount || 0,
    maxDiscountAmount: code.maxDiscountAmount || null,
    usageLimit: code.usageLimit ?? null,
    usedCount: code.usedCount || 0,
    userUsageLimit: code.userUsageLimit ?? null,
    validFrom: code.validFrom || null,
    validUntil: code.validUntil || null,
    isActive: !!code.isActive,
    state: computeState(code, now),
    fundedBy: code.fundedBy,
    ownerType: code.ownerType,
    sports: code.sports || [],
    appliesTo: code.appliesTo || 'events',
    eventIds: (code.eventIds || []).map(String),
    packageIds: (code.packageIds || []).map(String),
    eligibility: code.eligibility || 'everyone',
    notifyOnCreate: !!code.notifyOnCreate,
    lastNotifiedAt: code.lastNotifiedAt || null,
    createdAt: code.createdAt,
    updatedAt: code.updatedAt,
  };
}

/** Mongo filter for the Active / Past tabs. Paused codes stay in Active (the card has a pause toggle). */
function tabFilter(tab, now = new Date()) {
  const expired = { validUntil: { $ne: null, $lt: now } };
  const usedUp = { $expr: { $and: [{ $ne: [{ $ifNull: ['$usageLimit', null] }, null] }, { $gte: ['$usedCount', '$usageLimit'] }] } };
  if (tab === 'past') {
    return { $or: [{ archivedAt: { $ne: null } }, expired, usedUp] };
  }
  return { $and: [{ archivedAt: null }, { $nor: [expired, usedUp] }] };
}

/** { discounted, collected, redeemed } for one code. collected = paid after discount, excluding VAT. */
async function codeStats(promoCodeId) {
  const [row] = await getDB()
    .collection('promoRedemptions')
    .aggregate([
      { $match: { promoCodeId, status: 'confirmed' } },
      {
        $group: {
          _id: null,
          discounted: { $sum: '$discountAmount' },
          collected: { $sum: '$paidAmount' },
          redeemed: { $sum: 1 },
        },
      },
    ])
    .toArray();
  const round2 = (n) => Math.round(((n || 0) + Number.EPSILON) * 100) / 100;
  return { discounted: round2(row && row.discounted), collected: round2(row && row.collected), redeemed: (row && row.redeemed) || 0 };
}

/** Totals across many codes (organiser header). */
async function summaryForCodeIds(codeIds) {
  if (codeIds.length === 0) {
    return { discountedTotal: 0, redeemedCount: 0 };
  }
  const [row] = await getDB()
    .collection('promoRedemptions')
    .aggregate([
      { $match: { promoCodeId: { $in: codeIds }, status: 'confirmed' } },
      { $group: { _id: null, discounted: { $sum: '$discountAmount' }, redeemed: { $sum: 1 } } },
    ])
    .toArray();
  return {
    discountedTotal: Math.round(((row && row.discounted) || 0) * 100) / 100,
    redeemedCount: (row && row.redeemed) || 0,
  };
}

const JOINS = [
  { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
  { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
];

/**
 * Purchases grouped per player: { userId, name, photo, phone, email, gender, uses, lastUsedAt }.
 * @param {ObjectId} promoCodeId
 * @param {{search?, gender?, sort?: 'recent'|'uses', page?, perPage?}} opts
 */
async function groupedPurchases(promoCodeId, { search, gender, sort = 'recent', page = 1, perPage = 20 } = {}) {
  const userFilters = [];
  if (search && String(search).trim()) {
    const rx = new RegExp(escapeRegex(String(search).trim().slice(0, 60)), 'i');
    userFilters.push({ $or: [{ 'user.fullName': rx }, { 'user.mobileNumber': rx }, { 'user.email': rx }] });
  }
  if (gender && String(gender).trim()) {
    userFilters.push({ 'user.gender': new RegExp(`^${escapeRegex(String(gender).trim().slice(0, 20))}$`, 'i') });
  }

  const sortStage = sort === 'uses' ? { uses: -1, lastUsedAt: -1 } : { lastUsedAt: -1 };
  const skip = (Math.max(1, page) - 1) * perPage;

  const pipeline = [
    { $match: { promoCodeId, status: 'confirmed' } },
    { $group: { _id: '$userId', uses: { $sum: 1 }, lastUsedAt: { $max: '$confirmedAt' } } },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    ...(userFilters.length ? [{ $match: { $and: userFilters } }] : []),
    { $sort: sortStage },
    {
      $facet: {
        rows: [{ $skip: skip }, { $limit: perPage }],
        total: [{ $count: 'n' }],
      },
    },
  ];

  const [result] = await getDB().collection('promoRedemptions').aggregate(pipeline).toArray();
  const rows = (result.rows || []).map((r) => ({
    userId: String(r._id),
    name: (r.user && (r.user.fullName || r.user.communityName)) || null,
    photo: (r.user && r.user.profilePic) || null,
    phone: (r.user && r.user.mobileNumber) || null,
    email: (r.user && r.user.email) || null,
    gender: (r.user && r.user.gender) || null,
    uses: r.uses,
    lastUsedAt: r.lastUsedAt,
  }));
  const total = (result.total[0] && result.total[0].n) || 0;
  return { rows, total };
}

/**
 * One row per redemption with human-readable joins (player name, sequential booking id, event E-number),
 * for CSV export and the admin feed. `match` is a promoRedemptions filter.
 */
async function redemptionRows(match, { sort = { createdAt: -1 }, skip = 0, limit = 5000 } = {}) {
  const pipeline = [
    { $match: match },
    { $sort: sort },
    { $skip: skip },
    { $limit: limit },
    ...JOINS,
    { $lookup: { from: 'bookings', localField: 'bookingId', foreignField: '_id', as: 'booking' } },
    { $unwind: { path: '$booking', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'events', localField: 'eventId', foreignField: '_id', as: 'event' } },
    { $unwind: { path: '$event', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'payments', localField: 'paymentId', foreignField: '_id', as: 'payment' } },
    { $unwind: { path: '$payment', preserveNullAndEmptyArrays: true } },
  ];
  const docs = await getDB().collection('promoRedemptions').aggregate(pipeline).toArray();
  return docs.map((d) => ({
    redemptionId: d.redemptionId,
    code: d.codeSnapshot,
    fundedBy: d.fundedBy,
    status: d.status,
    userId: d.userId ? String(d.userId) : null,
    playerName: (d.user && (d.user.fullName || d.user.communityName)) || null,
    playerPhone: (d.user && d.user.mobileNumber) || null,
    playerEmail: (d.user && d.user.email) || null,
    playerGender: (d.user && d.user.gender) || null,
    organiserId: d.organiserId ? String(d.organiserId) : null,
    targetType: d.targetType,
    eventId: d.eventId ? String(d.eventId) : null,
    eventNumber: (d.event && d.event.eventId) || d.parentEventId || null,
    eventName: (d.event && d.event.eventName) || null,
    occurrenceStart: d.occurrenceStart || null,
    packageId: d.packageId ? String(d.packageId) : null,
    bookingId: d.bookingId ? String(d.bookingId) : null,
    bookingNumber: (d.booking && d.booking.bookingId) || null,
    paymentId: d.paymentId ? String(d.paymentId) : null,
    paymentNumber: (d.payment && d.payment.paymentId) || null,
    stripePaymentIntentId: d.stripePaymentIntentId && !String(d.stripePaymentIntentId).startsWith('free_') ? d.stripePaymentIntentId : null,
    originalAmount: d.originalAmount,
    discountAmount: d.discountAmount,
    paidAmount: d.paidAmount,
    vatAmount: d.vatAmount,
    rallyDueAmount: d.rallyDueAmount || 0,
    reservedAt: d.reservedAt || null,
    confirmedAt: d.confirmedAt || null,
    releasedAt: d.releasedAt || null,
    updatedAt: d.updatedAt || null,
  }));
}

module.exports = {
  findCode,
  computeState,
  toPromoCodeDto,
  tabFilter,
  codeStats,
  summaryForCodeIds,
  groupedPurchases,
  redemptionRows,
  escapeRegex,
  toObjectId,
};
