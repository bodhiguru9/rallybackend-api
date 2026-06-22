const { getDB } = require('../config/database');
const { ObjectId } = require('mongodb');

/**
 * Batch-loading helpers to kill N+1 query patterns.
 *
 * Instead of calling `User.findById(x)` / `Event.findById(x)` once per item inside
 * a loop (N round-trips that each hold a pooled connection), collect the ids and
 * fetch them all in ONE `find({ _id: { $in: [...] } })`, returning a Map keyed by
 * the id string. Look-ups in the loop then become instant in-memory `map.get(...)`.
 *
 * Best practice per MongoDB docs: replace per-item findById in a loop with a single
 * $in query. One query instead of N → far less pool pressure and latency.
 */

/** Coerce a value to ObjectId, or null if it isn't a valid id. */
function toObjectId(id) {
  if (!id) return null;
  if (id instanceof ObjectId) return id;
  try {
    return new ObjectId(id);
  } catch (e) {
    return null;
  }
}

/**
 * Fetch many documents from a collection by _id in a single query.
 * @param {string} collectionName
 * @param {Array<string|ObjectId>} ids
 * @returns {Promise<Map<string, object>>} Map keyed by _id.toString()
 */
async function getByIds(collectionName, ids) {
  const map = new Map();
  if (!Array.isArray(ids) || ids.length === 0) return map;

  // Dedupe + coerce, dropping invalid/null ids.
  const seen = new Set();
  const objectIds = [];
  for (const id of ids) {
    if (!id) continue;
    const key = id.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    const oid = toObjectId(id);
    if (oid) objectIds.push(oid);
  }
  if (objectIds.length === 0) return map;

  const docs = await getDB()
    .collection(collectionName)
    .find({ _id: { $in: objectIds } })
    .toArray();
  for (const doc of docs) map.set(doc._id.toString(), doc);
  return map;
}

/**
 * Fetch many documents by an arbitrary (non-_id) field in a single query.
 * Used e.g. for payments keyed by the business id `paymentId` ('PAY...').
 * @param {string} collectionName
 * @param {string} field
 * @param {Array<string|number>} values
 * @returns {Promise<Map<string, object>>} Map keyed by String(field value)
 */
async function getByField(collectionName, field, values) {
  const map = new Map();
  if (!Array.isArray(values) || values.length === 0) return map;
  const unique = [...new Set(values.filter((v) => v !== null && v !== undefined).map(String))];
  if (unique.length === 0) return map;

  const docs = await getDB()
    .collection(collectionName)
    .find({ [field]: { $in: unique } })
    .toArray();
  for (const doc of docs) map.set(String(doc[field]), doc);
  return map;
}

/** Batch-fetch users by _id → Map keyed by id string. Replaces N User.findById calls. */
function getUsersByIds(ids) {
  return getByIds('users', ids);
}

/** Batch-fetch events by _id → Map keyed by id string. Replaces N Event.findById calls. */
function getEventsByIds(ids) {
  return getByIds('events', ids);
}

/**
 * Batch-fetch events referenced by EITHER the Mongo _id OR the business id ('E123'),
 * mirroring Event.findById's dual resolution. The returned Map is keyed by BOTH forms,
 * so `.get(String(storedId))` resolves regardless of which form was stored.
 * Use this when the stored reference type is inconsistent (e.g. notification.data.eventId).
 * @param {Array<string|ObjectId>} ids
 * @returns {Promise<Map<string, object>>}
 */
async function getEventsByAnyId(ids) {
  const map = new Map();
  if (!Array.isArray(ids) || ids.length === 0) return map;

  const objectIds = [];
  const businessIds = [];
  const seen = new Set();
  for (const id of ids) {
    if (!id) continue;
    const s = id.toString();
    if (seen.has(s)) continue;
    seen.add(s);
    const oid = toObjectId(id);
    if (oid) objectIds.push(oid);
    else businessIds.push(s); // not a valid ObjectId → treat as business id ('E123')
  }

  const or = [];
  if (objectIds.length) or.push({ _id: { $in: objectIds } });
  if (businessIds.length) or.push({ eventId: { $in: businessIds } });
  if (or.length === 0) return map;

  const docs = await getDB().collection('events').find({ $or: or }).toArray();
  for (const doc of docs) {
    map.set(doc._id.toString(), doc);
    if (doc.eventId) map.set(String(doc.eventId), doc);
  }
  return map;
}

module.exports = {
  getByIds,
  getByField,
  getUsersByIds,
  getEventsByIds,
  getEventsByAnyId,
  toObjectId,
};
