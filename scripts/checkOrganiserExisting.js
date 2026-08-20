require('dotenv').config();

const fs = require('fs');
const { parse } = require('csv-parse/sync');
const { connectDB, getDB, closeDB } = require('../src/config/database');

async function main() {
  await connectDB();

  const csvPath =
    process.env.USERPROFILE +
    '/Downloads/rally-organisers-db.csv';

  const rows = parse(
    fs.readFileSync(csvPath, 'utf8'),
    {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    }
  );

  const users = getDB().collection('users');

  let found = 0;

  for (const row of rows) {
    const email = (row.email || '').trim().toLowerCase();
    const phone = (row.whatsapp_number || '').trim();

    if (!email && !phone) {
      continue;
    }

    const conditions = [];

    if (email) {
      conditions.push({ email });
    }

    if (phone) {
      const digits = phone.replace(/\D/g, '');

      conditions.push({ mobileNumber: phone });
      conditions.push({ mobileNumber: digits });
      conditions.push({ mobileNumber: '+' + digits });

      conditions.push({ whatsappNumber: phone });
      conditions.push({ whatsappNumber: digits });
      conditions.push({ whatsappNumber: '+' + digits });
    }

    const existing = await users.findOne({
      $or: conditions,
    });

    if (existing) {
      found++;

      console.log(
        'EXISTS | CSV:',
        row.name,
        '| email:',
        email || '-',
        '| whatsapp:',
        phone || '-',
        '| DB userId:',
        existing.userId,
        '| DB type:',
        existing.userType
      );
    }
  }

  console.log('');
  console.log('Existing organiser matches:', found);

  await closeDB();
}

main().catch(async (error) => {
  console.error(error);

  try {
    await closeDB();
  } catch (_) {}

  process.exit(1);
});