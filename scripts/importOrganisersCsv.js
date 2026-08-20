/**
 * Import organiser CSV into Rally.
 *
 * DEFAULT = DRY RUN
 *
 * Dry run:
 *   node scripts/importOrganisersCsv.js "C:\Users\ARINDAM\Downloads\rally-organisers-db.csv"
 *
 * Execute:
 *   node scripts/importOrganisersCsv.js "C:\Users\ARINDAM\Downloads\rally-organisers-db.csv" --execute
 */

require('dotenv').config();

const fs = require('fs');
const bcrypt = require('bcryptjs');
const { parse } = require('csv-parse/sync');

const {
  connectDB,
  getDB,
  closeDB,
} = require('../src/config/database');

const {
  getNextUniqueUserId,
} = require('../src/utils/idManager');

const OrganiserBankAccount =
  require('../src/models/OrganiserBankAccount');

const csvPath = process.argv[2];
const execute = process.argv.includes('--execute');

const DEFAULT_PASSWORD = '1234Rally';

if (!csvPath) {
  console.error('CSV path is required.');
  process.exit(1);
}

if (!fs.existsSync(csvPath)) {
  console.error(`CSV file not found: ${csvPath}`);
  process.exit(1);
}

function clean(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).trim();

  return text === '' ? null : text;
}

function parseBoolean(value) {
  const text = clean(value);

  if (!text) return false;

  return ['t', 'true', '1', 'yes', 'y']
    .includes(text.toLowerCase());
}

function parseDate(value) {
  const text = clean(value);

  if (!text) return null;

  const date = new Date(text);

  return Number.isNaN(date.getTime())
    ? null
    : date;
}

function parseNumber(value) {
  const text = clean(value);

  if (!text) return null;

  const num = Number(text);

  return Number.isFinite(num)
    ? num
    : null;
}

function parseSports(primarySport, sportsText) {
  const sports = [];

  const primary = clean(primarySport);

  if (primary) {
    sports.push(primary);
  }

  const additional = clean(sportsText);

  if (additional) {
    additional
      .split('|')
      .map(item => item.trim())
      .filter(Boolean)
      .forEach(item => {
        if (
          !sports.some(
            existing =>
              existing.toLowerCase() === item.toLowerCase()
          )
        ) {
          sports.push(item);
        }
      });
  }

  return sports;
}

function normalizeVisibility(value) {
  const text = clean(value)?.toLowerCase();

  if (text === 'public') return 'public';

  return 'private';
}

async function findExistingUser(users, row) {
  const email = clean(row.email)?.toLowerCase();
  const phone = clean(row.whatsapp_number);

  const conditions = [];

  if (email) {
    conditions.push({ email });
  }

  if (phone) {
    const digits = phone.replace(/\D/g, '');

    conditions.push({ mobileNumber: phone });
    conditions.push({ mobileNumber: digits });
    conditions.push({ mobileNumber: `+${digits}` });

    conditions.push({ whatsappNumber: phone });
    conditions.push({ whatsappNumber: digits });
    conditions.push({ whatsappNumber: `+${digits}` });
  }

  // Makes rerunning the importer safe.
  const sourceId = clean(row.id);

  if (sourceId) {
    conditions.push({
      'legacyImport.organiserSourceId': sourceId,
    });
  }

  if (conditions.length === 0) {
    return null;
  }

  return await users.findOne({
    $or: conditions,
  });
}

async function main() {
  console.log('');
  console.log('======================================');
  console.log('Rally Organiser CSV Import');
  console.log('======================================');
  console.log(`CSV: ${csvPath}`);
  console.log(
    `Mode: ${execute ? 'EXECUTE' : 'DRY RUN'}`
  );
  console.log('');

  const rows = parse(
    fs.readFileSync(csvPath, 'utf8'),
    {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
      relax_column_count: true,
    }
  );

  console.log(`CSV rows found: ${rows.length}`);

  await connectDB();

  const db = getDB();
  const users = db.collection('users');

  let newOrganisers = 0;
  let skippedExisting = 0;
  let skippedExistingPlayers = 0;
  let invalid = 0;
  let imported = 0;
  let failed = 0;

  let bankAccountsPlanned = 0;
  let bankAccountsCreated = 0;
  let bankAccountsFailed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    const communityName = clean(row.name);
    const email = clean(row.email)?.toLowerCase();
    const whatsapp = clean(row.whatsapp_number);

    if (!communityName) {
      invalid++;

      console.log(
        `[${i + 1}] INVALID - missing organiser name`
      );

      continue;
    }

    const existing = await findExistingUser(
      users,
      row
    );

    if (existing) {
      skippedExisting++;

      if (existing.userType === 'player') {
        skippedExistingPlayers++;

        console.log(
          `[${i + 1}] SKIP EXISTING PLAYER - ` +
          `${communityName} - userId=${existing.userId}`
        );
      } else {
        console.log(
          `[${i + 1}] SKIP EXISTING USER - ` +
          `${communityName} - userId=${existing.userId}`
        );
      }

      continue;
    }

    const sports = parseSports(
      row.primary_sport,
      row.sports
    );

    const hasCompleteBankDetails =
      !!clean(row.account_name) &&
      !!clean(row.iban) &&
      !!clean(row.bank_name);

    if (hasCompleteBankDetails) {
      bankAccountsPlanned++;
    }

    newOrganisers++;

    if (!execute) {
      console.log(
        `[${i + 1}] WOULD IMPORT - ${communityName}` +
        `${email ? ` - ${email}` : ''}` +
        `${whatsapp ? ` - ${whatsapp}` : ''}` +
        `${hasCompleteBankDetails ? ' - BANK ACCOUNT' : ''}`
      );

      continue;
    }

    try {
      const userId =
        await getNextUniqueUserId();

      const passwordHash =
        await bcrypt.hash(
          DEFAULT_PASSWORD,
          10
        );

      const now = new Date();

      const originalCreatedAt =
        parseDate(row.registered_at) ||
        parseDate(row.created_at) ||
        now;

      const originalUpdatedAt =
        parseDate(row.created_at) ||
        originalCreatedAt;

      /*
       * IMPORTANT:
       * Construct the document manually so email/mobile
       * fields are COMPLETELY OMITTED when unavailable.
       */
      const userDoc = {
        userId,
        userType: 'organiser',

        password: passwordHash,

        fullName:
          clean(row.contact_name) ||
          communityName,

        communityName,

        yourBest: 'Organiser',

        yourCity: clean(row.city),

        sport1: sports[0] || null,
        sport2: sports[1] || null,
        sports,

        bio: clean(row.bio),

        instagramLink:
          clean(row.instagram_handle),

        profileVisibility:
          normalizeVisibility(row.visibility),

        profilePic: null,

        stripeCustomerId: null,

        isEmailVerified: false,
        isMobileVerified: false,

        followersCount: 0,
        followingCount: 0,
        eventsCreated: 0,
        totalAttendees: 0,

        oauthProviders: [],

        createdAt: originalCreatedAt,
        updatedAt: originalUpdatedAt,

        legacyImport: {
          organiserSourceId: clean(row.id),

          externalUserId:
            clean(row.external_user_id),

          isInternal:
            parseBoolean(row.is_internal),

          needsReview:
            parseBoolean(row.needs_review),

          registeredAt:
            parseDate(row.registered_at),

          originalCreatedAt:
            parseDate(row.created_at),

          payout: {
            mode:
              clean(row.payout_mode),

            type:
              clean(row.payout_type),

            commissionRate:
              parseNumber(row.commission_rate),

            flatSessionAmount:
              parseNumber(row.flat_session_amount),

            revenueSharePercent:
              parseNumber(row.revshare_pct),

            rates:
              clean(row.payout_rates),

            days:
              clean(row.payout_days),
          },

          /*
           * Keep account_number because the current
           * OrganiserBankAccount model does not store it.
           */
          legacyBankData: {
            accountNumber:
              clean(row.account_number),
          },

          importSource:
            'rally-organisers-db.csv',
        },
      };

      /*
       * Add these fields ONLY when they exist.
       * Do not use null for missing sparse-index fields.
       */
      if (email) {
        userDoc.email = email;
      }

      if (whatsapp) {
        userDoc.mobileNumber = whatsapp;
        userDoc.whatsappNumber = whatsapp;
      }

      const result =
        await users.insertOne(userDoc);

      imported++;

      console.log(
        `[${i + 1}] IMPORTED - ` +
        `userId=${userId} - ${communityName}`
      );

      /*
       * Bank account is created only when all fields
       * required by OrganiserBankAccount are present.
       */
      if (hasCompleteBankDetails) {
        try {
          const bankAccount =
            await OrganiserBankAccount.create(
              result.insertedId,
              {
                accountHolderName:
                  clean(row.account_name),

                iban:
                  clean(row.iban),

                bankName:
                  clean(row.bank_name),
              }
            );

          bankAccountsCreated++;

          console.log(
            `        BANK IMPORTED - ` +
            `${bankAccount.bankAccountId}`
          );
        } catch (bankError) {
          bankAccountsFailed++;

          console.error(
            `        BANK FAILED - ` +
            `${bankError.message}`
          );
        }
      }
    } catch (error) {
      failed++;

      console.error(
        `[${i + 1}] FAILED - ` +
        `${communityName} - ${error.message}`
      );
    }
  }

  console.log('');
  console.log('======================================');
  console.log('IMPORT SUMMARY');
  console.log('======================================');

  console.log(
    `CSV rows:                   ${rows.length}`
  );

  console.log(
    `New organisers:             ${newOrganisers}`
  );

  console.log(
    `Existing users skipped:     ${skippedExisting}`
  );

  console.log(
    `Existing players skipped:   ${skippedExistingPlayers}`
  );

  console.log(
    `Invalid rows:               ${invalid}`
  );

  console.log(
    `Organisers imported:        ${imported}`
  );

  console.log(
    `Organiser failures:         ${failed}`
  );

  console.log(
    `Bank accounts planned:      ${bankAccountsPlanned}`
  );

  console.log(
    `Bank accounts created:      ${bankAccountsCreated}`
  );

  console.log(
    `Bank account failures:      ${bankAccountsFailed}`
  );

  console.log(
    `Mode:                       ${execute ? 'EXECUTE' : 'DRY RUN'}`
  );

  console.log('======================================');
  console.log('');

  await closeDB();
}

main().catch(async error => {
  console.error(
    'Organiser import failed:',
    error
  );

  try {
    await closeDB();
  } catch (_) {}

  process.exit(1);
});