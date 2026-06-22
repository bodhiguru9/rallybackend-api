const { getDB } = require('../config/database');

/**
 * MongoDB-backed OTP / signup-session store.
 *
 * Replaces the old in-memory `Map` so OTP state is SHARED across PM2 cluster
 * workers and horizontally-scaled instances (the in-memory Map broke both:
 * "send OTP" and "verify OTP" could hit different workers). No Redis required —
 * uses the existing MongoDB.
 *
 * Each entry is one document: { _id: <storeKey>, ...value, _expireAt: Date }.
 * A TTL index on `_expireAt` (see scripts/createIndexes.js) garbage-collects
 * abandoned entries. IMPORTANT: TTL deletion is NOT instant (~60s sweep), so the
 * REAL expiry is still enforced by the numeric `expiresAt` / token-expire checks
 * in signup-otp.service.js — exactly as before. `_expireAt` is set well beyond the
 * longest token life (1h) so a doc is never TTL-deleted while still in use.
 */

const COLLECTION = 'otpStore';
const TTL_BUFFER_MS = 2 * 60 * 60 * 1000; // 2h — longer than any OTP (10m) or token (1h)

const col = () => getDB().collection(COLLECTION);

// Escape a string for safe use inside a RegExp.
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Remove internal fields so the returned object matches the original Map value shape.
const strip = (doc) => {
  if (!doc) return null;
  const clean = { ...doc };
  delete clean._id;
  delete clean._expireAt;
  return clean;
};

/** Get the stored value object for a key (or null). Mirrors Map.get. */
async function get(key) {
  return strip(await col().findOne({ _id: key }));
}

/** Upsert the value object for a key. Mirrors Map.set. */
async function set(key, value) {
  const clean = { ...(value || {}) };
  delete clean._id;
  delete clean._expireAt;
  await col().updateOne(
    { _id: key },
    { $set: { ...clean, _expireAt: new Date(Date.now() + TTL_BUFFER_MS) } },
    { upsert: true }
  );
}

/** Delete a key. Mirrors Map.delete. (Named export `delete`.) */
async function del(key) {
  await col().deleteOne({ _id: key });
}

/**
 * Find the first entry whose `field` equals `value` (optionally scoped to keys
 * starting with `keyPrefix`). Replaces the old `for (entries)` token scans.
 * @returns {Promise<{key:string, value:object}|null>}
 */
async function getByField(field, value, keyPrefix = null) {
  const filter = { [field]: value };
  if (keyPrefix) filter._id = { $regex: '^' + escapeRegex(keyPrefix) };
  const doc = await col().findOne(filter);
  return doc ? { key: doc._id, value: strip(doc) } : null;
}

/**
 * Partial mobile match: find a 'mobile:' entry (optionally under `keyPrefix`)
 * whose key ends with the given last-10 digits. Replaces the old last-10-digit
 * scan in findStoredData.
 * @returns {Promise<{key:string, value:object}|null>}
 */
async function getMobileByLast10(keyPrefix, last10) {
  const regex = '^' + escapeRegex(keyPrefix || '') + '.*mobile:.*' + escapeRegex(last10) + '$';
  const doc = await col().findOne({ _id: { $regex: regex } });
  return doc ? { key: doc._id, value: strip(doc) } : null;
}

module.exports = { get, set, delete: del, getByField, getMobileByLast10, COLLECTION };
