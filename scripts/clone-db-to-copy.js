/**
 * clone-db-to-copy.js
 *
 * Copies every collection from a source database into a target database,
 * using the same `mongodb` driver the app already depends on — no
 * mongodump/mongorestore binary required.
 *
 * Usage:
 *   SOURCE_MONGODB_URL="<read-only prod connection string>" \
 *   SOURCE_DB_NAME=rally \
 *   TARGET_MONGODB_URL="<connection string for the copy — can be the same cluster>" \
 *   TARGET_DB_NAME=rally_copy \
 *   node scripts/clone-db-to-copy.js
 *
 * Safety:
 *   - Never writes to SOURCE. Only reads.
 *   - Refuses to run if SOURCE_DB_NAME === TARGET_DB_NAME and the two
 *     connection strings point at the same host, so you can't accidentally
 *     wipe prod by copying it into itself.
 *   - Drops each target collection before copying so re-runs are safe and
 *     idempotent (the copy is meant to be disposable test data).
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');

const BATCH_SIZE = 500;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

function hostOf(connectionString) {
  try {
    return new URL(connectionString).host;
  } catch (_) {
    return connectionString;
  }
}

async function main() {
  const sourceUrl = requireEnv('SOURCE_MONGODB_URL');
  const targetUrl = requireEnv('TARGET_MONGODB_URL');
  const sourceDbName = process.env.SOURCE_DB_NAME || 'rally';
  const targetDbName = process.env.TARGET_DB_NAME || 'rally_copy';

  if (sourceDbName === targetDbName && hostOf(sourceUrl) === hostOf(targetUrl)) {
    console.error(
      `Refusing to run: source and target are the same database ` +
      `(${hostOf(sourceUrl)}/${sourceDbName}). This would overwrite prod with itself.`
    );
    process.exit(1);
  }

  console.log(`Source: ${hostOf(sourceUrl)} / ${sourceDbName}`);
  console.log(`Target: ${hostOf(targetUrl)} / ${targetDbName}`);

  const sourceClient = new MongoClient(sourceUrl);
  const targetClient = sourceUrl === targetUrl ? sourceClient : new MongoClient(targetUrl);

  await sourceClient.connect();
  if (targetClient !== sourceClient) await targetClient.connect();

  const sourceDb = sourceClient.db(sourceDbName);
  const targetDb = targetClient.db(targetDbName);

  const collections = await sourceDb.listCollections({}, { nameOnly: true }).toArray();
  console.log(`Found ${collections.length} collections to copy.`);

  for (const { name } of collections) {
    if (name.startsWith('system.')) continue;

    const sourceColl = sourceDb.collection(name);
    const targetColl = targetDb.collection(name);

    const total = await sourceColl.countDocuments();
    console.log(`\n${name}: ${total} documents`);

    await targetColl.drop().catch(() => {}); // fine if it doesn't exist yet

    if (total === 0) continue;

    const cursor = sourceColl.find({});
    let batch = [];
    let copied = 0;

    for await (const doc of cursor) {
      batch.push(doc);
      if (batch.length >= BATCH_SIZE) {
        await targetColl.insertMany(batch, { ordered: false });
        copied += batch.length;
        process.stdout.write(`\r  ${copied}/${total}`);
        batch = [];
      }
    }
    if (batch.length > 0) {
      await targetColl.insertMany(batch, { ordered: false });
      copied += batch.length;
    }
    console.log(`\r  ${copied}/${total} done`);

    // Recreate indexes so the copy behaves like the real thing (query plans, uniqueness, etc).
    const indexes = await sourceColl.indexes();
    const nonDefaultIndexes = indexes.filter((idx) => idx.name !== '_id_');
    if (nonDefaultIndexes.length > 0) {
      await targetColl.createIndexes(
        nonDefaultIndexes.map(({ key, ...rest }) => ({ key, ...rest }))
      );
    }
  }

  console.log('\nDone.');
  await sourceClient.close();
  if (targetClient !== sourceClient) await targetClient.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
