#!/usr/bin/env node
/**
 * Idempotent MongoDB index creation — single source of truth for all indexes.
 *
 * WHY: most collections currently have NO indexes, so queries do full collection
 * scans (slow, and they hold a pooled connection longer → fewer concurrent users).
 * Indexes let the database jump straight to matching documents.
 *
 * SAFE TO RE-RUN: createIndex is a no-op when the index already exists. A unique
 * index that would fail because the data already contains duplicates is SKIPPED
 * with a clear report (showing the duplicate values) instead of crashing the run —
 * so one dirty collection never blocks the rest.
 *
 * USAGE:
 *   node scripts/createIndexes.js        (or: npm run indexes)
 * Run it once now, and as part of every deploy. It is also invoked automatically
 * on standalone (non-serverless) server startup via src/index.js.
 *
 * Field/type notes baked into the spec below (see scan): some foreign keys are
 * stored inconsistently (ObjectId vs string vs Number), so a few logically-unique
 * keys are intentionally left NON-unique to avoid breaking on dirty data.
 */

require('dotenv').config();
const { connectDB, getDB, closeDB } = require('../src/config/database');

/**
 * Authoritative index specification, keyed by collection name (the exact string
 * passed to db.collection(...)). Each entry: { key, options? }.
 * Note the spelling split: 'organizerBankDetails' (z) vs 'organiserBankAccounts' (s).
 */
const INDEX_SPEC = {
  users: [
    { key: { userId: 1 }, options: { unique: true } },
    { key: { email: 1 }, options: { unique: true, sparse: true } },
    { key: { mobileNumber: 1 } }, // NON-unique: stored in several normalized forms
    { key: { resetPasswordToken: 1 }, options: { sparse: true } },
    { key: { userType: 1, communityName: 1 } },
    // getTopOrganisers: find({userType}).sort(followers/attendees/events)
    { key: { userType: 1, followersCount: -1, totalAttendees: -1, eventsCreated: -1 } },
  ],

  tokens: [
    { key: { refreshToken: 1 }, options: { unique: true } },
    { key: { userId: 1 } },
    // TTL: auto-purge expired refresh tokens (every findByToken filters expiresAt > now)
    { key: { expiresAt: 1 }, options: { expireAfterSeconds: 0 } },
  ],

  payments: [
    { key: { paymentId: 1 }, options: { unique: true } },
    { key: { stripePaymentIntentId: 1 }, options: { unique: true, sparse: true } },
    { key: { eventId: 1, status: 1 } },
    { key: { userId: 1, promoCodeId: 1, status: 1 } }, // per-user promo usage count
  ],

  notifications: [
    // recipientId stored as ObjectId (queried as {$in:[ObjectId,string]} — index serves the ObjectId branch)
    { key: { recipientId: 1, isRead: 1, createdAt: -1 } },
  ],

  eventReminders: [
    { key: { userId: 1, eventId: 1 } },
    { key: { userId: 1, reminderTime: 1 } },
    { key: { reminderTime: 1, notificationSent: 1 } }, // cron scan
  ],

  promoCodes: [
    { key: { code: 1 }, options: { unique: true } },
    { key: { promoCodeId: 1 }, options: { unique: true } },
    { key: { isActive: 1, createdAt: -1 } },
  ],

  favorites: [
    { key: { userId: 1, eventId: 1 }, options: { unique: true } },
    { key: { userId: 1, createdAt: -1 } },
    { key: { eventId: 1 } },
  ],

  requests: [
    { key: { userId: 1, organiserId: 1, status: 1 } },
    { key: { organiserId: 1, status: 1, createdAt: -1 } },
    { key: { requestId: 1 }, options: { unique: true, sparse: true } },
  ],

  waitlist: [
    { key: { userId: 1, eventId: 1, status: 1 } },
    { key: { eventId: 1, status: 1, createdAt: -1 } },
    { key: { waitlistId: 1 }, options: { sparse: true } }, // NON-unique (always scoped)
  ],

  packages: [
    { key: { packageId: 1 }, options: { unique: true } },
    { key: { organiserId: 1, createdAt: -1 } },
    { key: { isActive: 1, createdAt: -1 } },
  ],

  packagePurchases: [
    { key: { userId: 1, isActive: 1, expiryDate: 1 } },
    { key: { userId: 1, purchaseDate: -1 } },
    { key: { organiserId: 1, purchaseDate: -1 } },
    { key: { packageId: 1, purchaseDate: -1 } },
    { key: { joinedEventIds: 1 } }, // multikey
  ],

  sports: [
    { key: { sportId: 1 }, options: { unique: true } },
    // case-insensitive unique to match the app's regex-based uniqueness
    { key: { name: 1 }, options: { unique: true, collation: { locale: 'en', strength: 2 } } },
  ],

  organizerBankDetails: [
    // organizerId stored as Number (sequential userId); one record per organiser
    { key: { organizerId: 1 }, options: { unique: true } },
  ],

  organiserBankAccounts: [
    // organizerId stored as ObjectId here; many accounts per organiser → NOT unique
    { key: { organizerId: 1, createdAt: -1 } },
    { key: { bankAccountId: 1 } },
  ],

  follows: [
    { key: { followerId: 1, followingId: 1 }, options: { unique: true } },
    { key: { followingId: 1 } },
  ],

  events: [
    { key: { creatorId: 1 } }, // queried {$in:[ObjectId,string]} — serves ObjectId branch
    { key: { eventId: 1 }, options: { unique: true } },
    { key: { eventStatus: 1, eventDateTime: 1 } }, // public listing + date range/sort
  ],

  eventJoins: [
    { key: { eventId: 1, occurrenceStart: 1 } },
    { key: { userId: 1, eventId: 1, occurrenceStart: 1 }, options: { unique: true } },
    { key: { userId: 1, joinedAt: -1 } }, // user history
  ],

  bookings: [
    { key: { userId: 1, eventId: 1, status: 1 } },
    { key: { bookingId: 1 }, options: { unique: true } },
    { key: { paymentIntentId: 1 }, options: { sparse: true } },
    { key: { paymentId: 1 }, options: { sparse: true } },
    { key: { eventId: 1, status: 1 } },
  ],

  eventJoinRequests: [
    { key: { joinRequestId: 1 }, options: { unique: true } },
    { key: { eventId: 1, status: 1, createdAt: -1 } },
    { key: { userId: 1, status: 1, createdAt: -1 } },
    { key: { userId: 1, eventId: 1, status: 1 } },
  ],

  eventInvites: [
    { key: { inviteId: 1 }, options: { unique: true, sparse: true } },
    { key: { organiserId: 1, eventId: 1, createdAt: -1 } },
    { key: { playerId: 1, createdAt: -1 } },
  ],

  eventBlocks: [
    { key: { userId: 1, eventId: 1 }, options: { unique: true } },
    { key: { eventId: 1 } },
  ],

  blocks: [
    { key: { blockerId: 1, blockedId: 1 }, options: { unique: true } },
    { key: { blockedId: 1 } },
  ],

  savedCards: [
    { key: { cardId: 1 }, options: { unique: true } },
    { key: { userId: 1, stripePaymentMethodId: 1 }, options: { unique: true } },
    { key: { userId: 1, isDefault: 1 } },
  ],

  // OTP / signup-session store (MongoDB-backed). TTL auto-removes abandoned entries;
  // real expiry is enforced in signup-otp.service.js (TTL is only background GC).
  otpStore: [
    { key: { _expireAt: 1 }, options: { expireAfterSeconds: 0 } },
  ],
};

const describe = (key) => JSON.stringify(key);

/** Report up to 10 duplicate key-values so the operator can clean them. */
async function findDuplicates(col, key) {
  const groupId = {};
  for (const field of Object.keys(key)) {
    groupId[field.replace(/\./g, '_')] = `$${field}`;
  }
  try {
    return await col
      .aggregate([
        { $group: { _id: groupId, count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ])
      .toArray();
  } catch (e) {
    return [];
  }
}

/**
 * Create every index in INDEX_SPEC. Never throws — per-index failures are logged
 * and counted so the run always completes.
 * @param {import('mongodb').Db} db
 * @returns {Promise<{ensured:number, skippedDup:number, conflict:number, failed:number}>}
 */
async function createAllIndexes(db) {
  const summary = { ensured: 0, skippedDup: 0, conflict: 0, failed: 0 };

  for (const [collName, specs] of Object.entries(INDEX_SPEC)) {
    const col = db.collection(collName);
    for (const { key, options = {} } of specs) {
      try {
        await col.createIndex(key, options);
        summary.ensured++;
        console.log(`  ✓ ${collName} ${describe(key)}${options.unique ? ' (unique)' : ''}`);
      } catch (err) {
        const isDup = err.code === 11000 || /duplicate key/i.test(err.message || '');
        if (options.unique && isDup) {
          summary.skippedDup++;
          console.warn(`  ⚠ SKIPPED unique ${collName} ${describe(key)} — duplicate data exists:`);
          const dups = await findDuplicates(col, key);
          dups.forEach((d) => console.warn(`        ${JSON.stringify(d._id)} ×${d.count}`));
          console.warn('     → clean the duplicates, then re-run to enforce uniqueness.');
        } else if (err.code === 85 || err.code === 86) {
          // IndexOptionsConflict / IndexKeySpecsConflict: already exists, different spec.
          summary.conflict++;
          console.log(`  • ${collName} ${describe(key)} already exists with different options — left as-is`);
        } else {
          summary.failed++;
          console.error(`  ✗ ${collName} ${describe(key)} — ${err.message}`);
        }
      }
    }
  }
  return summary;
}

async function main() {
  await connectDB();
  console.log('\nCreating MongoDB indexes (idempotent — safe to re-run)...\n');
  const s = await createAllIndexes(getDB());
  console.log(
    `\nDone. ensured=${s.ensured} skipped(duplicates)=${s.skippedDup} conflicts=${s.conflict} failed=${s.failed}`
  );
  if (s.skippedDup > 0) {
    console.log('Some unique indexes were skipped due to duplicate data — see warnings above.');
  }
  await closeDB();
  process.exit(s.failed > 0 ? 1 : 0);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Index creation failed:', err);
    process.exit(1);
  });
}

module.exports = { createAllIndexes, INDEX_SPEC };
