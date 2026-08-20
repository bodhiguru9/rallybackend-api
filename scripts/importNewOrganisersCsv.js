require('dotenv').config();

const fs = require('fs');
const { parse } = require('csv-parse/sync');

const {
  connectDB,
  getDB,
  closeDB,
} = require('../src/config/database');

const User = require('../src/models/User');

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
  if (value === undefined || value === null) return '';

  return String(value).trim();
}

function normalizePhone(value) {
  const phone = clean(value);

  if (!phone) return '';

  const digits = phone.replace(/\D/g, '');

  if (!digits) return '';

  return `+${digits}`;
}

async function findExistingUser(users, email, phone) {
  const conditions = [];

  if (email) {
    conditions.push({
      email: email.toLowerCase(),
    });
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

  if (!conditions.length) return null;

  return users.findOne({
    $or: conditions,
  });
}

async function main() {
  console.log('');
  console.log('======================================');
  console.log('NEW ORGANISER CSV IMPORT');
  console.log('======================================');
  console.log(`CSV: ${csvPath}`);
  console.log(`Mode: ${execute ? 'EXECUTE' : 'DRY RUN'}`);
  console.log('');

  const rows = parse(
    fs.readFileSync(csvPath, 'utf8'),
    {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    }
  );

  await connectDB();

  const users = getDB().collection('users');

  let validNew = 0;
  let existing = 0;
  let existingPlayers = 0;
  let existingOrganisers = 0;
  let invalid = 0;
  let imported = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    const fullName = clean(row['Full Name']);
    const communityName = clean(row['Community Name']);
    const email = clean(row['Email']).toLowerCase();
    const mobileNumber = normalizePhone(row['Mobile Number']);

    if (!fullName || !communityName || (!email && !mobileNumber)) {
      invalid++;

      console.log(
        `[${i + 1}] INVALID | ${communityName || fullName || 'Unnamed row'}`
      );

      continue;
    }

    const existingUser = await findExistingUser(
      users,
      email,
      mobileNumber
    );

    if (existingUser) {
      existing++;

      if (existingUser.userType === 'player') {
        existingPlayers++;
      }

      if (existingUser.userType === 'organiser') {
        existingOrganisers++;
      }

      console.log(
        `[${i + 1}] EXISTS | ${communityName}` +
        ` | CSV email: ${email || '-'}` +
        ` | CSV mobile: ${mobileNumber || '-'}` +
        ` | DB userId: ${existingUser.userId}` +
        ` | DB type: ${existingUser.userType}`
      );

      continue;
    }

    validNew++;

    if (!execute) {
      console.log(
        `[${i + 1}] WOULD IMPORT | ${communityName}` +
        ` | ${fullName}` +
        ` | ${email || '-'}` +
        ` | ${mobileNumber || '-'}`
      );

      continue;
    }

    try {
      const newUser = await User.create({
        userType: 'organiser',

        fullName,
        communityName,

        email: email || undefined,
        mobileNumber: mobileNumber || undefined,
        whatsappNumber: mobileNumber || undefined,

        password: DEFAULT_PASSWORD,

        yourBest: 'Organiser',
        yourCity: null,

        sport1: null,
        sport2: null,
        sports: [],

        bio: null,
        instagramLink: null,
        profileVisibility: 'private',

        profilePic: null,

        isEmailVerified: false,
        isMobileVerified: false,

        followersCount: 0,
        followingCount: 0,
        eventsCreated: 0,
        totalAttendees: 0,

        oauthProviders: [],
      });

      imported++;

      console.log(
        `[${i + 1}] IMPORTED | userId=${newUser.userId}` +
        ` | ${communityName}`
      );
    } catch (error) {
      failed++;

      console.error(
        `[${i + 1}] FAILED | ${communityName}` +
        ` | ${error.message}`
      );
    }
  }

  console.log('');
  console.log('======================================');
  console.log('IMPORT SUMMARY');
  console.log('======================================');
  console.log(`CSV rows:             ${rows.length}`);
  console.log(`Valid new rows:       ${validNew}`);
  console.log(`Existing users:       ${existing}`);
  console.log(`Existing players:     ${existingPlayers}`);
  console.log(`Existing organisers:  ${existingOrganisers}`);
  console.log(`Invalid rows:         ${invalid}`);
  console.log(`Imported:             ${imported}`);
  console.log(`Failed:               ${failed}`);
  console.log(`Mode:                 ${execute ? 'EXECUTE' : 'DRY RUN'}`);
  console.log('======================================');

  await closeDB();
}

main().catch(async (error) => {
  console.error(error);

  try {
    await closeDB();
  } catch (_) {}

  process.exit(1);
});