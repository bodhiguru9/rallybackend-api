/**
 * Promo codes migration (additive, idempotent).
 *
 *   node scripts/migratePromoCodes.js                      -> DRY RUN: prints what would change
 *   node scripts/migratePromoCodes.js --apply              -> applies defaults + drops the old unique code_1 index
 *   node scripts/migratePromoCodes.js --apply --archive-existing
 *                                                          -> also archives every code that exists today (leftover test codes)
 *
 * After --apply, run `npm run indexes` to create the new partial-unique code index and the promoRedemptions indexes.
 * Always point DB_NAME / MONGODB_URI at the intended database first. Never run against production without a backup.
 */
require('dotenv').config();
const { connectDB, closeDB, getDB } = require('../src/config/database');

const DEFAULTS = {
  fundedBy: 'rally',
  ownerType: 'admin',
  ownerId: null,
  sports: [],
  appliesTo: 'events',
  packageIds: [],
  eligibility: 'everyone',
  notifyOnCreate: false,
  lastNotifiedAt: null,
  stackable: false,
  priority: 0,
  archivedAt: null,
};

async function main() {
  const apply = process.argv.includes('--apply');
  const archiveExisting = process.argv.includes('--archive-existing');

  await connectDB();
  const db = getDB();
  const codes = db.collection('promoCodes');

  console.log(`\nPromo codes migration — ${apply ? 'APPLY' : 'DRY RUN'}  (db: ${db.databaseName})\n`);

  const total = await codes.countDocuments({});
  console.log(`Existing promo codes: ${total}`);

  // 1. Fill each missing field with its default (never overwrites existing values)
  for (const [field, value] of Object.entries(DEFAULTS)) {
    const missing = await codes.countDocuments({ [field]: { $exists: false } });
    console.log(`  ${field}: ${missing} document(s) missing`);
    if (apply && missing > 0) {
      await codes.updateMany({ [field]: { $exists: false } }, { $set: { [field]: value } });
    }
  }

  // 2. Optionally archive today's codes (leftover test codes)
  if (archiveExisting) {
    const toArchive = await codes.countDocuments({ archivedAt: { $in: [null] } });
    console.log(`  archive-existing: ${toArchive} code(s) would be archived`);
    if (apply && toArchive > 0) {
      const now = new Date();
      await codes.updateMany({ archivedAt: null }, { $set: { archivedAt: now, isActive: false, updatedAt: now } });
    }
  }

  // 3. Drop the old plain-unique index on code (replaced by the partial-unique one in createIndexes.js)
  const indexes = await codes.indexes();
  const old = indexes.find((i) => i.name === 'code_1');
  console.log(`  old unique index code_1: ${old ? 'present' : 'absent'}`);
  if (apply && old) {
    await codes.dropIndex('code_1');
    console.log('  dropped code_1');
  }

  console.log(apply ? '\nDone. Now run: npm run indexes\n' : '\nDry run only. Re-run with --apply to write changes.\n');
  await closeDB();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
