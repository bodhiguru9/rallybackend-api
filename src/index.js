const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
require('dotenv').config();

// Import database connection
const { connectDB, closeDB } = require('./config/database');

// Import routes
const apiRoutes = require('./routes');

// Import middleware
const errorHandler = require('./middleware/errorHandler');
const notFound = require('./middleware/notFound');

// Initialize Express app
const app = express();

// Get port from environment or default to 3000
const PORT = Number(process.env.PORT) || 8080;

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

app.get("/", (req, res) => {
  res.status(200).json({
    message: "Backend is live 🚀",
  });
});

// Middleware
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS
app.use(morgan('dev')); // Logging
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Serve static files
app.use('/public', express.static('public'));
app.use('/uploads', express.static('uploads'));

// Health check route (no DB required)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    serverless: !!process.env.VERCEL,
  });
});

// Database connection middleware for serverless mode
// This MUST run before routes to ensure DB is connected
if (process.env.VERCEL || require.main !== module) {
  let dbConnectionPromise = null;
  let dbConnected = false;
  let dbConnectionError = null;
  
  // Try to connect DB when module loads (non-blocking)
  (async () => {
    try {
      await connectDB();
      dbConnected = true;
      console.log('✅ Database pre-connected for serverless');
    } catch (error) {
      console.error('❌ Database pre-connection failed:', error.message);
      dbConnectionError = error;
      // Will retry on first request
    }
  })();
  
  app.use(async (req, res, next) => {
    try {
      // Skip DB check for static files and health check
      if (req.path.startsWith('/public') || req.path.startsWith('/uploads') || req.path === '/health') {
        return next();
      }
      
      // Ensure DB connection
      if (!dbConnected) {
        if (!dbConnectionPromise) {
          dbConnectionPromise = connectDB()
            .then(() => {
              dbConnected = true;
              dbConnectionError = null;
              console.log('✅ Database connected in serverless middleware');
              return true;
            })
            .catch((error) => {
              console.error('❌ Database connection error:', error.message);
              dbConnectionPromise = null;
              dbConnected = false;
              dbConnectionError = error;
              throw error;
            });
        }
        
        try {
          await dbConnectionPromise;
        } catch (error) {
          console.error('❌ Failed to connect to database:', error.message);
          return res.status(500).json({
            success: false,
            error: 'Database connection failed',
            message: error.message || 'Unable to connect to database. Please check your configuration.',
          });
        }
      }
      
      next();
    } catch (error) {
      console.error('❌ Middleware error:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message || 'An unexpected error occurred',
      });
    }
  });
}

// API routes
app.use('/api', apiRoutes);

// 404 handler
app.use(notFound);

// Error handler (must be last)
app.use(errorHandler);

// Start server and connect to database
async function startServer() {
  try {
    // Connect to MongoDB
    await connectDB();

    // Start Express server
    app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);

  const { startReminderCronJob } = require('./services/eventReminderCron.service');
  startReminderCronJob();
});
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n⚠️  Shutting down gracefully...');
  await closeDB();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n⚠️  Shutting down gracefully...');
  await closeDB();
  process.exit(0);
});

// Start the server only if not in serverless mode (Vercel)
// Check if running as a module (serverless) or directly (standalone server)
if (require.main === module && !process.env.VERCEL) {
  startServer();
}

module.exports = app;

