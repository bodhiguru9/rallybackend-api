#!/usr/bin/env node
/**
 * One-off cleanup for the duplicate data that blocks the unique indexes
 * (users.email, eventJoins {userId,eventId,occurrenceStart}).
 *
 * SAFE BY DEFAULT: runs as a DRY RUN (reports only, changes nothing).
 * Pass --apply to actually delete duplicate eventJoins.
 *
 *   node scripts/cleanupDuplicates.js            # dry run (report only)
 *   node scripts/cleanupDuplicates.js --apply    # delete duplicate eventJoins
 *
 * NOTES:
 *  - Duplicate eventJoins: keeps the EARLIEST row per (userId,eventId,occurrenceStart),
 *    deletes the rest. (After applying, re-run `npm run indexes` to enforce the unique index.)
 *  - Duplicate users.email: only REPORTED, never auto-deleted — merging/removing real user
 *    accounts (which own bookings, payments, joins) is a manual decision. Review the list,
 *    decide which to keep, then clean up via your own process.
 *  - eventTotalAttendNumber may be slightly over-counted after removing duplicate joins;
 *    run an attendee recount afterwards if exact counts matter.
 */
require('dotenv').config();
const { connectDB, getDB, closeDB } = require('../src/config/database');

const APPLY = process.argv.includes('--apply');

async function reportDuplicateEmails(db) {
  const dups = await db.collection('users').aggregate([
    { $match: { email: { $type: 'string', $ne: '' } } },
    { $group: { _id: '$email', count: { $sum: 1 }, ids: { $push: '$_id' } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
  ]).toArray();

  console.log(`\n=== Duplicate emails: ${dups.length} email(s) with >1 account (REPORT ONLY) ===`);
  dups.slice(0, 50).forEach((d) => console.log(`  ${d._id} ×${d.count}`));
  if (dups.length > 50) console.log(`  ... and ${dups.length - 50} more`);
  if (dups.length) console.log('  → Review manually; do NOT auto-delete accounts (they own bookings/payments).');
  return dups.length;
}

async function dedupeEventJoins(db) {
  const col = db.collection('eventJoins');
  const groups = await col.aggregate([
    {
      $group: {
        _id: { userId: '$userId', eventId: '$eventId', occurrenceStart: '$occurrenceStart' },
        ids: { $push: '$_id' },
        count: { $sum: 1 },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ]).toArray();

  let toDelete = 0;
  const idsToDelete = [];
  for (const g of groups) {
    // keep the earliest _id (ObjectIds are time-ordered), delete the rest
    const sorted = g.ids.slice().sort((a, b) => (a.toString() < b.toString() ? -1 : 1));
    const extras = sorted.slice(1);
    toDelete += extras.length;
    idsToDelete.push(...extras);
  }

  console.log(`\n=== Duplicate eventJoins: ${groups.length} group(s), ${toDelete} extra row(s) to remove ===`);
  groups.slice(0, 20).forEach((g) =>
    console.log(`  user=${g._id.userId} event=${g._id.eventId} occ=${g._id.occurrenceStart} ×${g.count}`)
  );
  if (groups.length > 20) console.log(`  ... and ${groups.length - 20} more`);

  if (!APPLY) {
    console.log('  (dry run — pass --apply to delete these extras)');
    return 0;
  }
  if (idsToDelete.length === 0) return 0;
  const res = await col.deleteMany({ _id: { $in: idsToDelete } });
  console.log(`  ✅ deleted ${res.deletedCount} duplicate eventJoins`);
  return res.deletedCount;
}

async function main() {
  await connectDB();
  console.log(APPLY ? '\nMODE: APPLY (will delete duplicate eventJoins)' : '\nMODE: DRY RUN (no changes)');
  const db = getDB();
  await reportDuplicateEmails(db);
  await dedupeEventJoins(db);
  console.log('\nDone.' + (APPLY ? ' Re-run `npm run indexes` to enforce the unique indexes.' : ''));
  await closeDB();
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => { console.error('Cleanup failed:', err); process.exit(1); });
}

module.exports = { reportDuplicateEmails, dedupeEventJoins };
