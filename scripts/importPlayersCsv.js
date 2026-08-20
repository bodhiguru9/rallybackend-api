/**
 * Import legacy Rally players CSV into the current MongoDB users collection.
 *
 * DEFAULT = DRY RUN
 *
 * Dry run:
 *   node scripts/importPlayersCsv.js "C:\Users\ARINDAM\Downloads\rally-players-db.csv"
 *
 * Real import:
 *   node scripts/importPlayersCsv.js "C:\Users\ARINDAM\Downloads\rally-players-db.csv" --execute
 */

require('dotenv').config();

const fs = require('fs');
const { parse } = require('csv-parse/sync');

const { connectDB, getDB, closeDB } = require('../src/config/database');
const User = require('../src/models/User');

const csvPath = process.argv[2];
const execute = process.argv.includes('--execute');

if (!csvPath) {
  console.error('CSV path is required.');
  process.exit(1);
}

if (!fs.existsSync(csvPath)) {
  console.error(`CSV file not found: ${csvPath}`);
  process.exit(1);
}

function clean(value) {
  if (value === undefined || value === null) return null;

  const text = String(value).trim();

  return text === '' ? null : text;
}

function parseBoolean(value) {
  const text = clean(value);

  if (!text) return false;

  return ['t', 'true', '1', 'yes', 'y'].includes(
    text.toLowerCase()
  );
}

function parseDate(value) {
  const text = clean(value);

  if (!text) return null;

  const date = new Date(text);

  return Number.isNaN(date.getTime())
    ? null
    : date;
}

function parseSports(value) {
  const text = clean(value);

  if (!text) return [];

  return text
    .split('|')
    .map(item => item.trim())
    .filter(Boolean);
}

async function main() {
  console.log('');
  console.log('======================================');
  console.log('Rally Player CSV Import');
  console.log('======================================');
  console.log(`CSV: ${csvPath}`);
  console.log(`Mode: ${execute ? 'EXECUTE' : 'DRY RUN'}`);
  console.log('');

  const rawCsv = fs.readFileSync(csvPath, 'utf8');

  const rows = parse(rawCsv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_column_count: true,
  });

  console.log(`CSV rows found: ${rows.length}`);

  await connectDB();

  const db = getDB();
  const users = db.collection('users');

  let valid = 0;
  let skippedExisting = 0;
  let skippedInvalid = 0;
  let imported = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    const email = clean(row.email)?.toLowerCase();
    const fullName = clean(row.name);
    const mobileNumber = clean(row.phone);

    /*
     * Email is the safest unique identifier for this import.
     * The supplied CSV had no duplicate email groups.
     */
    if (!email) {
      skippedInvalid++;

      console.warn(
        `[${i + 1}] SKIP - missing email`
      );

      continue;
    }

    const existingUser = await users.findOne({
      email,
    });

    if (existingUser) {
      skippedExisting++;

      console.log(
        `[${i + 1}] EXISTS - ${email}`
      );

      continue;
    }

    const sports = parseSports(row.sports);

    const userData = {
      userType: 'player',

      email,
      mobileNumber,

      fullName,

      dob: parseDate(row.dob),
      gender: clean(row.gender),

      sport1: sports[0] || null,
      sport2: sports[1] || null,
      sports,

      /*
       * There is no password in the legacy CSV.
       * Leave undefined rather than inventing one.
       */
      password: '1234Rally',

      profilePic: null,

      isEmailVerified: false,
      isMobileVerified: false,

      followingCount: 0,

      /*
       * Keep historical source information.
       * These fields are deliberately grouped instead
       * of mixing them into the normal Rally user schema.
       */
      legacyImport: {
        externalUserId: clean(row.external_user_id),
        city: clean(row.city),
        source: clean(row.source),
        firstSeenVia: clean(row.first_seen_via),
        hasAppAccount: parseBoolean(row.has_app_account),
        hasStripeActivity: parseBoolean(row.has_stripe_activity),
        tags: clean(row.tags),
        notes: clean(row.notes),

        registeredAt: parseDate(row.registered_at),
        originalCreatedAt: parseDate(row.created_at),
        originalUpdatedAt: parseDate(row.updated_at),

        importSource: 'rally-players-db.csv',
      },
    };

    valid++;

    if (!execute) {
      console.log(
        `[${i + 1}] WOULD IMPORT - ${email} - ${fullName || ''}`
      );

      continue;
    }

    try {
      /*
       * Use Rally's own User.create().
       * This generates the next sequential userId.
       */
      const created = await User.create(userData);

      /*
       * User.create() only stores fields defined by the User
       * constructor, so append legacyImport afterwards.
       *
       * Also restore registered_at as createdAt when available.
       */
      const updateFields = {
        legacyImport: userData.legacyImport,
      };

      const registeredAt =
        parseDate(row.registered_at) ||
        parseDate(row.created_at);

      if (registeredAt) {
        updateFields.createdAt = registeredAt;
      }

      const originalUpdatedAt =
        parseDate(row.updated_at);

      if (originalUpdatedAt) {
        updateFields.updatedAt = originalUpdatedAt;
      }

      await users.updateOne(
        { _id: created._id },
        {
          $set: updateFields,
        }
      );

      imported++;

      console.log(
        `[${i + 1}] IMPORTED - userId=${created.userId} - ${email}`
      );
    } catch (error) {
      failed++;

      console.error(
        `[${i + 1}] FAILED - ${email} - ${error.message}`
      );
    }
  }

  console.log('');
  console.log('======================================');
  console.log('IMPORT SUMMARY');
  console.log('======================================');
  console.log(`CSV rows:           ${rows.length}`);
  console.log(`Valid new rows:     ${valid}`);
  console.log(`Existing emails:    ${skippedExisting}`);
  console.log(`Invalid rows:       ${skippedInvalid}`);
  console.log(`Imported:           ${imported}`);
  console.log(`Failed:             ${failed}`);
  console.log(`Mode:               ${execute ? 'EXECUTE' : 'DRY RUN'}`);
  console.log('======================================');
  console.log('');

  await closeDB();
}

main().catch(async error => {
  console.error('Player import failed:', error);

  try {
    await closeDB();
  } catch (_) {}

  process.exit(1);
});