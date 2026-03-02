const { MongoClient } = require('mongodb');

let client = null;
let db = null;

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

    // Create MongoDB client
    client = new MongoClient(MONGODB_URL, {
      // Connection options
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    // Connect to MongoDB
    await client.connect();
    console.log('✅ Successfully connected to MongoDB');

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

