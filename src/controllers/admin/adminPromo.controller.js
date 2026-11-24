/**
 * Admin promo code API (/api/admin/promo-codes, /api/admin/promo-redemptions).
 * Mounted behind adminKeyAuth + adminAudit (X-Admin-Key / X-Admin-Email), so every call is audited.
 *
 * Admin codes are Rally-funded and app-wide (fundedBy 'rally', ownerType 'admin'). Organiser codes show up in the
 * list and detail views but are read-only here, except that any code can be paused or resumed.
 * Contract: rallybackend-api/PROMO_API.md section 5.
 */
const { ObjectId } = require('mongodb');
const PromoCode = require('../../models/PromoCode');
const { getDB } = require('../../config/database');
const { getPaginationParams, createPaginationResponse } = require('../../utils/pagination');
const { toCsv } = require('../../utils/csv');
const queries = require('../../services/promoQueries.service');
const management = require('../../services/promoManagement.service');

const MAX_PER_PAGE = 100;
const MAX_CSV_ROWS = 5000;

const fail = (res, status, message, code) =>
  res.status(status).json({ success: false, message, error: message, ...(code ? { code } : {}) });

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

const perPageOf = (req) => Math.min(parseInt(req.query.perPage, 10) || 20, MAX_PER_PAGE);

/** DTO for admin views: the shared DTO plus who owns/created the code. */
const toAdminDto = (code) => ({
  ...queries.toPromoCodeDto(code),
  ownerId: code.ownerId ? String(code.ownerId) : null,
  createdBy: code.createdBy ? String(code.createdBy) : null,
});

async function loadCode(req, res) {
  const code = await queries.findCode(req.params.id);
  if (!code) {
    fail(res, 404, 'Promo code not found', 'NOT_FOUND');
    return null;
  }
  return code;
}

/** Admin codes only: organiser codes are read-only here. */
function assertAdminCode(code) {
  if (code.ownerType !== 'admin') {
    throw new management.ManagementError(403, 'Organiser promo codes are read-only here; you can only pause or resume them', 'READ_ONLY');
  }
}

/** GET /promo-codes?fundedBy=rally|organiser&tab=active|past&search&page&perPage */
const listCodes = handle(async (req, res) => {
  const { page, perPage, skip } = getPaginationParams(req.query.page, perPageOf(req));
  const filter = {};
  if (req.query.fundedBy === 'rally' || req.query.fundedBy === 'organiser') {
    filter.fundedBy = req.query.fundedBy;
  }
  const clauses = [filter];
  if (req.query.tab === 'active' || req.query.tab === 'past') {
    clauses.push(queries.tabFilter(req.query.tab));
  }
  if (req.query.search && String(req.query.search).trim()) {
    clauses.push({ code: new RegExp(queries.escapeRegex(String(req.query.search).trim().slice(0, 30)), 'i') });
  }
  const query = { $and: clauses };
  const col = getDB().collection('promoCodes');
  const [docs, total] = await Promise.all([
    col.find(query).sort({ createdAt: -1 }).skip(skip).limit(perPage).toArray(),
    col.countDocuments(query),
  ]);
  res.json({ success: true, data: { promoCodes: docs.map(toAdminDto), pagination: createPaginationResponse(total, page, perPage) } });
});

/** POST /promo-codes -> a Rally-funded, app-wide code */
const createCode = handle(async (req, res) => {
  const body = { ...(req.body || {}), notifyOnCreate: false }; // subscribers are per organiser: nothing to notify
  const data = await management.buildCreateData(body, {
    fundedBy: 'rally',
    ownerType: 'admin',
    ownerId: null,
    createdBy: req.admin.email,
  });
  const created = await PromoCode.create(data);
  res.status(201).json({ success: true, message: 'Promo code created', data: { promoCode: toAdminDto(created) } });
});

/** GET /promo-codes/:id */
const getCode = handle(async (req, res) => {
  const code = await loadCode(req, res);
  if (!code) {
    return;
  }
  const stats = await queries.codeStats(code._id);
  const [due] = await getDB()
    .collection('promoRedemptions')
    .aggregate([{ $match: { promoCodeId: code._id, status: 'confirmed', fundedBy: 'rally' } }, { $group: { _id: null, total: { $sum: '$rallyDueAmount' } } }])
    .toArray();
  res.json({
    success: true,
    data: { promoCode: toAdminDto(code), stats: { ...stats, rallyFundedDiscountTotal: Math.round(((due && due.total) || 0) * 100) / 100 } },
  });
});

/** PUT /promo-codes/:id (admin codes only) */
const editCode = handle(async (req, res) => {
  const code = await loadCode(req, res);
  if (!code) {
    return;
  }
  assertAdminCode(code);
  if (code.archivedAt) {
    return fail(res, 409, 'Archived codes cannot be edited', 'ARCHIVED');
  }
  const set = await management.buildEditUpdate(code, req.body || {}, null);
  if (set.eligibility === 'subscribers') {
    return fail(res, 400, 'Admin codes can\'t use \'subscribers\' eligibility', 'VALIDATION');
  }
  await getDB().collection('promoCodes').updateOne({ _id: code._id }, { $set: set });
  const updated = await queries.findCode(String(code._id));
  res.json({ success: true, message: 'Promo code updated', data: { promoCode: toAdminDto(updated) } });
});

/** PATCH /promo-codes/:id/status  { isActive } (any code) */
const setStatus = handle(async (req, res) => {
  const code = await loadCode(req, res);
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
  res.json({ success: true, data: { promoCode: toAdminDto(updated) } });
});

/** DELETE /promo-codes/:id -> archive (admin codes only; never hard-delete) */
const archiveCode = handle(async (req, res) => {
  const code = await loadCode(req, res);
  if (!code) {
    return;
  }
  assertAdminCode(code);
  const now = new Date();
  await getDB().collection('promoCodes').updateOne({ _id: code._id }, { $set: { archivedAt: now, isActive: false, updatedAt: now } });
  res.json({ success: true, message: 'Promo code archived' });
});

/** GET /promo-codes/:id/purchases */
const listPurchases = handle(async (req, res) => {
  const code = await loadCode(req, res);
  if (!code) {
    return;
  }
  const { page, perPage } = getPaginationParams(req.query.page, perPageOf(req));
  const { rows, total } = await queries.groupedPurchases(code._id, {
    search: req.query.search,
    gender: req.query.gender,
    sort: req.query.sort === 'uses' ? 'uses' : 'recent',
    page,
    perPage,
  });
  res.json({ success: true, data: { purchases: rows, pagination: createPaginationResponse(total, page, perPage) } });
});

const REDEMPTION_HEADERS = [
  'Redemption', 'Code', 'Funded by', 'Status', 'Player', 'Phone', 'Email', 'Organiser id', 'Booking', 'Event',
  'Event name', 'Occurrence', 'Original AED', 'Discount AED', 'Paid AED (excl. VAT)', 'VAT AED',
  'Rally-funded discount AED', 'Stripe payment intent', 'Reserved', 'Confirmed', 'Updated',
];

const redemptionCsvRow = (r) => [
  r.redemptionId, r.code, r.fundedBy, r.status, r.playerName, r.playerPhone, r.playerEmail, r.organiserId,
  r.bookingNumber, r.eventNumber, r.eventName, r.occurrenceStart, r.originalAmount, r.discountAmount, r.paidAmount,
  r.vatAmount, r.rallyDueAmount, r.stripePaymentIntentId, r.reservedAt, r.confirmedAt, r.updatedAt,
];

/** GET /promo-codes/:id/purchases/export -> CSV, one row per redemption */
const exportPurchases = handle(async (req, res) => {
  const code = await loadCode(req, res);
  if (!code) {
    return;
  }
  const rows = await queries.redemptionRows(
    { promoCodeId: code._id, status: { $in: ['confirmed', 'refunded'] } },
    { sort: { createdAt: -1 }, limit: MAX_CSV_ROWS }
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="promo-${code.code}-redemptions.csv"`);
  res.send(toCsv(REDEMPTION_HEADERS, rows.map(redemptionCsvRow)));
});

const parseDate = (value, name) => {
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) {
    throw new management.ManagementError(400, `${name} must be a valid date`, 'VALIDATION');
  }
  return d;
};

const parseObjectId = (value, name) => {
  try {
    return new ObjectId(String(value));
  } catch (e) {
    throw new management.ManagementError(400, `${name} must be a valid id`, 'VALIDATION');
  }
};

/** Event by Mongo id or sequential E# */
async function resolveEventId(value) {
  if (/^E\d+$/i.test(String(value))) {
    const ev = await getDB().collection('events').findOne({ eventId: String(value).toUpperCase() }, { projection: { _id: 1 } });
    return ev ? ev._id : null;
  }
  return parseObjectId(value, 'eventId');
}

/** Package by Mongo id or sequential PKG# */
async function resolvePackageId(value) {
  if (/^PKG\d+$/i.test(String(value))) {
    const pkg = await getDB().collection('packages').findOne({ packageId: String(value).toUpperCase() }, { projection: { _id: 1 } });
    return pkg ? pkg._id : null;
  }
  return parseObjectId(value, 'packageId');
}

/**
 * GET /promo-redemptions
 * Filters: code, organiserId, eventId, packageId, fundedBy, status, from, to (reservedAt range), updatedSince.
 * perPage <= 100; csv=true downloads up to 5000 rows. With updatedSince the feed is ordered by updatedAt ascending
 * so a syncing client can page forward; otherwise newest first.
 */
const listRedemptions = handle(async (req, res) => {
  const q = req.query;
  const match = {};

  if (q.code) {
    match.codeSnapshot = String(q.code).trim().toUpperCase();
  }
  if (q.organiserId) {
    match.organiserId = parseObjectId(q.organiserId, 'organiserId');
  }
  if (q.eventId) {
    const id = await resolveEventId(q.eventId);
    if (!id) {
      return res.json({ success: true, data: { redemptions: [], pagination: createPaginationResponse(0, 1, perPageOf(req)) } });
    }
    match.eventId = id;
  }
  if (q.packageId) {
    const id = await resolvePackageId(q.packageId);
    if (!id) {
      return res.json({ success: true, data: { redemptions: [], pagination: createPaginationResponse(0, 1, perPageOf(req)) } });
    }
    match.packageId = id;
  }
  if (q.fundedBy) {
    if (!['rally', 'organiser'].includes(q.fundedBy)) {
      return fail(res, 400, 'fundedBy must be \'rally\' or \'organiser\'', 'VALIDATION');
    }
    match.fundedBy = q.fundedBy;
  }
  if (q.status) {
    const statuses = String(q.status).split(',').map((s) => s.trim());
    if (!statuses.every((s) => ['reserved', 'confirmed', 'released', 'refunded'].includes(s))) {
      return fail(res, 400, 'status must be reserved, confirmed, released or refunded (comma separated)', 'VALIDATION');
    }
    match.status = statuses.length === 1 ? statuses[0] : { $in: statuses };
  }
  if (q.from || q.to) {
    match.reservedAt = {};
    if (q.from) {
      match.reservedAt.$gte = parseDate(q.from, 'from');
    }
    if (q.to) {
      match.reservedAt.$lte = parseDate(q.to, 'to');
    }
  }
  if (q.updatedSince) {
    match.updatedAt = { $gt: parseDate(q.updatedSince, 'updatedSince') };
  }

  const sort = q.updatedSince ? { updatedAt: 1, _id: 1 } : { createdAt: -1 };
  const col = getDB().collection('promoRedemptions');

  if (q.csv === 'true' || q.csv === '1') {
    const rows = await queries.redemptionRows(match, { sort, limit: MAX_CSV_ROWS });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="promo-redemptions.csv"');
    return res.send(toCsv(REDEMPTION_HEADERS, rows.map(redemptionCsvRow)));
  }

  const { page, perPage, skip } = getPaginationParams(q.page, perPageOf(req));
  const [rows, total] = await Promise.all([queries.redemptionRows(match, { sort, skip, limit: perPage }), col.countDocuments(match)]);
  res.json({ success: true, data: { redemptions: rows, pagination: createPaginationResponse(total, page, perPage) } });
});

module.exports = {
  listCodes,
  createCode,
  getCode,
  editCode,
  setStatus,
  archiveCode,
  listPurchases,
  exportPurchases,
  listRedemptions,
};
