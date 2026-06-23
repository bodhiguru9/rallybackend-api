const { MongoClient } = require('mongodb');

let client = null;
let db = null;

/**
 * Build MongoDB connection-pool options.
 *
 * A "connection" is a reusable TCP socket to the MongoDB server. The driver keeps
 * a pool of these open sockets and hands one to each in-flight query, then returns
 * it to the pool — this avoids paying the TCP + TLS handshake cost on every request.
 * `maxPoolSize` is therefore the number of queries that can run *in parallel per
 * Node process*; the (N+1)th query waits in a queue for a socket to free up.
 *
 * Sizing is environment-aware because our two deployments scale differently:
 *  - Long-running (Elastic Beanstalk / local): few processes → a LARGER pool each.
 *  - Serverless (Vercel): many short-lived instances, each with its own pool →
 *    keep the pool SMALL so (poolSize × instances) stays under the MongoDB server's
 *    connection limit (e.g. Atlas M10 ≈ 1500).
 *
 * Every value is overridable via env vars (12-factor) so we can tune in prod
 * without a code change. Total connections across all processes/instances must
 * stay below your MongoDB tier's limit.
 *
 * @returns {import('mongodb').MongoClientOptions}
 */
function buildConnectionOptions() {
  const isServerless = !!process.env.VERCEL;
  const num = (envVar, fallback) => {
    const parsed = Number(process.env[envVar]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };

  return {
    // Max parallel sockets per process. 50 on long-running hosts, 10 on serverless.
    maxPoolSize: num('DB_MAX_POOL_SIZE', isServerless ? 10 : 50),
    // Pre-warm sockets so the first requests don't pay connect latency.
    // 0 on serverless so idle instances don't hold connections open.
    minPoolSize: num('DB_MIN_POOL_SIZE', isServerless ? 0 : 5),
    // How many new sockets the pool may open in parallel during a burst.
    maxConnecting: num('DB_MAX_CONNECTING', 5),
    // Fail fast (throw) when no socket frees up in time, instead of hanging forever.
    waitQueueTimeoutMS: num('DB_WAIT_QUEUE_TIMEOUT_MS', 10000),
    // Close sockets that have been idle this long, to release server resources.
    maxIdleTimeMS: num('DB_MAX_IDLE_TIME_MS', 60000),
    // Existing safety timeouts.
    serverSelectionTimeoutMS: num('DB_SERVER_SELECTION_TIMEOUT_MS', 5000),
    socketTimeoutMS: num('DB_SOCKET_TIMEOUT_MS', 45000),
    // Cap the initial TCP/TLS handshake so a bad network fails fast instead of hanging.
    connectTimeoutMS: num('DB_CONNECT_TIMEOUT_MS', 10000),
  };
}

/**
 * Connect to MongoDB database
 * @returns {Promise<Object>} Database connection object
 */
async function connectDB() {
  try {
    const MONGODB_URL = process.env.MONGODB_URL;

    if (!MONGODB_URL) {
      throw new Error('MONGODB_URL is not defined in environment variables');
    }

    // If already connected, return existing connection
    if (client && db) {
      return { client, db };
    }

    // Create MongoDB client with a tuned connection pool.
    const options = buildConnectionOptions();
    client = new MongoClient(MONGODB_URL, options);

    // Connect to MongoDB
    await client.connect();
    console.log(
      `✅ Successfully connected to MongoDB (pool min=${options.minPoolSize} max=${options.maxPoolSize})`
    );

    // Get database name from URL or use default
    const dbName = process.env.DB_NAME || 'rally';
    db = client.db(dbName);

    return { client, db };
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    throw error;
  }
}

/**
 * Close MongoDB connection
 * @returns {Promise<void>}
 */
async function closeDB() {
  try {
    if (client) {
      await client.close();
      client = null;
      db = null;
      console.log('✅ MongoDB connection closed');
    }
  } catch (error) {
    console.error('❌ Error closing MongoDB connection:', error.message);
    throw error;
  }
}

/**
 * Get database instance
 * @returns {Object} Database instance
 */
function getDB() {
  if (!db) {
    throw new Error('Database not connected. Call connectDB() first.');
  }
  return db;
}

/**
 * Get MongoDB client
 * @returns {Object} MongoDB client
 */
function getClient() {
  if (!client) {
    throw new Error('MongoDB client not connected. Call connectDB() first.');
  }
  return client;
}

module.exports = {
  connectDB,
  closeDB,
  getDB,
  getClient,
};

