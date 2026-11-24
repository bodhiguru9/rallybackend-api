/**
 * Organiser promo code API (/api/promo-codes). An organiser only ever sees and changes codes they own
 * (ownerType 'organiser', ownerId = themselves); anything else is a 404, never a 403, so ids can't be probed.
 * Contract: rallybackend-api/PROMO_API.md section 4.
 */
const { ObjectId } = require('mongodb');
const PromoCode = require('../../models/PromoCode');
const { getDB } = require('../../config/database');
const { getPaginationParams, createPaginationResponse } = require('../../utils/pagination');
const { toCsv } = require('../../utils/csv');
const queries = require('../../services/promoQueries.service');
const management = require('../../services/promoManagement.service');
const { notifyFollowersOfPromo } = require('../../services/promoNotification.service');

const NOTIFY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const ownerObjectId = (req) => new ObjectId(String(req.user.id));

const fail = (res, status, message, code) =>
  res.status(status).json({ success: false, message, error: message, ...(code ? { code } : {}) });

/** Load a code the caller owns, or answer 404. */
async function loadOwned(req, res) {
  const code = await queries.findCode(req.params.id, { ownerType: 'organiser', ownerId: ownerObjectId(req) });
  if (!code) {
    fail(res, 404, 'Promo code not found', 'NOT_FOUND');
    return null;
  }
  return code;
}

const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (error) {
    if (error instanceof management.ManagementError) {
      return fail(res, error.status, error.message, error.code);
    }
    if (error && error.message === 'Promo code already exists') {
      return fail(res, 409, error.message, 'CODE_EXISTS');
    }
    if (error && error.code === 'VALIDATION') {
      return fail(res, 400, error.message, 'VALIDATION');
    }
    return next(error);
  }
};

/** GET /summary -> { discountedTotal, activeCount, redeemedCount } */
const getSummary = handle(async (req, res) => {
  const col = getDB().collection('promoCodes');
  const mine = { ownerType: 'organiser', ownerId: ownerObjectId(req) };
  const now = new Date();
  const [ids, activeCount] = await Promise.all([
    col.find(mine, { projection: { _id: 1 } }).toArray(),
    col.countDocuments({ ...mine, ...queries.tabFilter('active', now), isActive: true }),
  ]);
  const totals = await queries.summaryForCodeIds(ids.map((d) => d._id));
  res.json({ success: true, data: { discountedTotal: totals.discountedTotal, activeCount, redeemedCount: totals.redeemedCount } });
});

/** GET /?tab=active|past&page&perPage */
const listCodes = handle(async (req, res) => {
  const tab = req.query.tab === 'past' ? 'past' : 'active';
  const { page, perPage, skip } = getPaginationParams(req.query.page, Math.min(parseInt(req.query.perPage, 10) || 20, 100));
  const now = new Date();
  const filter = { $and: [{ ownerType: 'organiser', ownerId: ownerObjectId(req) }, queries.tabFilter(tab, now)] };
  const col = getDB().collection('promoCodes');
  const [docs, total] = await Promise.all([
    col.find(filter).sort({ createdAt: -1 }).skip(skip).limit(perPage).toArray(),
    col.countDocuments(filter),
  ]);
  res.json({
    success: true,
    data: { promoCodes: docs.map((d) => queries.toPromoCodeDto(d, now)), pagination: createPaginationResponse(total, page, perPage) },
  });
});

/** POST / */
const createCode = handle(async (req, res) => {
  const ownerId = ownerObjectId(req);
  const data = await management.buildCreateData(req.body || {}, {
    fundedBy: 'organiser',
    ownerType: 'organiser',
    ownerId,
    createdBy: req.user.id,
  });
  const created = await PromoCode.create(data);

  let notified = null;
  if (created.notifyOnCreate) {
    notified = await notifyFollowersOfPromo({ organiserId: ownerId, promoCode: created });
    await getDB().collection('promoCodes').updateOne({ _id: created._id }, { $set: { lastNotifiedAt: new Date() } });
  }
  res.status(201).json({
    success: true,
    message: 'Promo code created',
    data: { promoCode: queries.toPromoCodeDto(created), ...(notified ? { notified } : {}) },
  });
});

/** GET /:id */
const getCode = handle(async (req, res) => {
  const code = await loadOwned(req, res);
  if (!code) {
    return;
  }
  const stats = await queries.codeStats(code._id);
  res.json({ success: true, data: { promoCode: queries.toPromoCodeDto(code), stats } });
});

/** PUT /:id (backend only for now) */
const editCode = handle(async (req, res) => {
  const code = await loadOwned(req, res);
  if (!code) {
    return;
  }
  if (code.archivedAt) {
    return fail(res, 409, 'Archived codes cannot be edited', 'ARCHIVED');
  }
  const set = await management.buildEditUpdate(code, req.body || {}, ownerObjectId(req));
  await getDB().collection('promoCodes').updateOne({ _id: code._id }, { $set: set });
  const updated = await queries.findCode(String(code._id));
  res.json({ success: true, message: 'Promo code updated', data: { promoCode: queries.toPromoCodeDto(updated) } });
});

/** PATCH /:id/status  { isActive } */
const setStatus = handle(async (req, res) => {
  const code = await loadOwned(req, res);
  if (!code) {
    return;
  }
  if (typeof (req.body || {}).isActive !== 'boolean') {
    return fail(res, 400, 'isActive must be true or false', 'VALIDATION');
  }
  if (code.archivedAt) {
    return fail(res, 409, 'Archived codes cannot be changed', 'ARCHIVED');
  }
  await getDB().collection('promoCodes').updateOne({ _id: code._id }, { $set: { isActive: req.body.isActive, updatedAt: new Date() } });
  const updated = await queries.findCode(String(code._id));
  res.json({ success: true, data: { promoCode: queries.toPromoCodeDto(updated) } });
});

/** DELETE /:id -> archive (never hard-delete: redemptions refer to the code) */
const archiveCode = handle(async (req, res) => {
  const code = await loadOwned(req, res);
  if (!code) {
    return;
  }
  const now = new Date();
  await getDB().collection('promoCodes').updateOne({ _id: code._id }, { $set: { archivedAt: now, isActive: false, updatedAt: now } });
  res.json({ success: true, message: 'Promo code archived' });
});

/** GET /:id/purchases?search&gender&sort=recent|uses&page&perPage */
const listPurchases = handle(async (req, res) => {
  const code = await loadOwned(req, res);
  if (!code) {
    return;
  }
  const { page, perPage } = getPaginationParams(req.query.page, Math.min(parseInt(req.query.perPage, 10) || 20, 100));
  const { rows, total } = await queries.groupedPurchases(code._id, {
    search: req.query.search,
    gender: req.query.gender,
    sort: req.query.sort === 'uses' ? 'uses' : 'recent',
    page,
    perPage,
  });
  res.json({ success: true, data: { purchases: rows, pagination: createPaginationResponse(total, page, perPage) } });
});

const CSV_HEADERS = [
  'Redemption', 'Status', 'Date', 'Player', 'Phone', 'Email', 'Gender', 'Booking', 'Event', 'Event name',
  'Occurrence', 'Original AED', 'Discount AED', 'Paid AED (excl. VAT)', 'VAT AED',
];

/** GET /:id/purchases/export -> CSV, one row per redemption (readable booking and event numbers, not raw ids) */
const exportPurchases = handle(async (req, res) => {
  const code = await loadOwned(req, res);
  if (!code) {
    return;
  }
  const rows = await queries.redemptionRows(
    { promoCodeId: code._id, status: { $in: ['confirmed', 'refunded'] } },
    { sort: { createdAt: -1 } }
  );
  const csv = toCsv(
    CSV_HEADERS,
    rows.map((r) => [
      r.redemptionId, r.status, r.confirmedAt, r.playerName, r.playerPhone, r.playerEmail, r.playerGender,
      r.bookingNumber, r.eventNumber, r.eventName, r.occurrenceStart,
      r.originalAmount, r.discountAmount, r.paidAmount, r.vatAmount,
    ])
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="promo-${code.code}-purchases.csv"`);
  res.send(csv);
});

/** POST /:id/notify -> push to followers, max once per 24h per code */
const notifyFollowers = handle(async (req, res) => {
  const code = await loadOwned(req, res);
  if (!code) {
    return;
  }
  if (queries.computeState(code) !== 'active') {
    return fail(res, 409, 'Only active promo codes can be announced', 'NOT_ACTIVE');
  }
  // Atomic claim of the 24h slot, so two quick taps send one notification
  const now = new Date();
  const claimed = await getDB().collection('promoCodes').findOneAndUpdate(
    { _id: code._id, $or: [{ lastNotifiedAt: null }, { lastNotifiedAt: { $lt: new Date(now.getTime() - NOTIFY_COOLDOWN_MS) } }] },
    { $set: { lastNotifiedAt: now, updatedAt: now } },
    { returnDocument: 'after' }
  );
  const claimedDoc = claimed && claimed._id ? claimed : claimed && claimed.value;
  if (!claimedDoc) {
    return fail(res, 429, 'This code was already announced in the last 24 hours', 'NOTIFY_COOLDOWN');
  }
  const result = await notifyFollowersOfPromo({ organiserId: ownerObjectId(req), promoCode: code });
  res.json({ success: true, data: { notified: result, lastNotifiedAt: now } });
});

module.exports = {
  getSummary,
  listCodes,
  createCode,
  getCode,
  editCode,
  setStatus,
  archiveCode,
  listPurchases,
  exportPurchases,
  notifyFollowers,
};
