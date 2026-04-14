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

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    serverless: !!process.env.VERCEL,
  });
});

app.get("/", (req, res) => {
  res.status(200).json({
    message: "Backend is live 🚀",
  });
});

// Middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'", "'unsafe-inline'"],
        "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        "img-src": ["'self'", "data:", "https://upload.wikimedia.org", "https://*.rallysports.ae", "*"],
        "font-src": ["'self'", "https://fonts.gstatic.com"],
        "connect-src": ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
); // Security headers
app.use(cors()); // Enable CORS
app.use(morgan('dev')); // Logging
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Serve static files
app.use('/public', express.static('public'));
app.use('/uploads', express.static('uploads'));



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
// API routes
app.use('/api', apiRoutes);

// ✅ ADD THIS HERE
app.get('/event/:eventId', async (req, res) => {
  const { eventId } = req.params;
  const Event = require('./models/Event');

  try {
    // Fetch event details for rich preview
    const event = await Event.findByEventId(eventId);

    const eventName = event ? event.eventName : 'Join the Event on Rally';
    const eventDescription = event ? `${event.eventCreatorName} invited you to join ${event.eventName}. Click to open in the Rally app.` : 'Open this invitation in the Rally app.';
    const eventImage = (event && event.eventImages && event.eventImages.length > 0)
      ? event.eventImages[0]
      : 'https://backend2.rallysports.ae/public/rally-logo-bg.png'; // Fallback logo

    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        
        <!-- Open Graph / Social Media Meta Tags -->
        <title>${eventName} | Rally</title>
        <meta name="title" content="${eventName} | Rally">
        <meta name="description" content="${eventDescription}">
        
        <meta property="og:type" content="website">
        <meta property="og:url" content="https://backend2.rallysports.ae/event/${eventId}">
        <meta property="og:title" content="${eventName}">
        <meta property="og:description" content="${eventDescription}">
        <meta property="og:image" content="${eventImage}">

        <meta property="twitter:card" content="summary_large_image">
        <meta property="twitter:url" content="https://backend2.rallysports.ae/event/${eventId}">
        <meta property="twitter:title" content="${eventName}">
        <meta property="twitter:description" content="${eventDescription}">
        <meta property="twitter:image" content="${eventImage}">

        <style>
          :root {
            --rally-blue: #3b82f6;
            --rally-blue-dark: #2563eb;
            --bg-color: #f1f5f9;
            --card-bg: #ffffff;
            --text-main: #0f172a;
            --text-muted: #64748b;
          }
          body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background-color: var(--bg-color);
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            color: var(--text-main);
            overflow-x: hidden;
          }
          .background-blobs {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: -1;
            overflow: hidden;
            background: #f8fafc;
          }
          .blob {
            position: absolute;
            filter: blur(80px);
            opacity: 0.4;
            border-radius: 50%;
            z-index: -1;
          }
          .blob-1 {
            width: 400px;
            height: 400px;
            background: #3b82f6;
            top: -100px;
            right: -100px;
          }
          .blob-2 {
            width: 300px;
            height: 300px;
            background: #60a5fa;
            bottom: -50px;
            left: -50px;
          }
          .card {
            background: var(--card-bg);
            padding: 2.5rem 2rem;
            border-radius: 2rem;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.1);
            max-width: 420px;
            width: 90%;
            text-align: center;
            border: 1px solid rgba(255, 255, 255, 0.1);
          }
          .hero-image {
            width: 120px;
            height: 120px;
            margin: 0 auto 1.5rem;
            border-radius: 1.5rem;
            object-fit: cover;
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
            background: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
          }
          .hero-image svg {
            width: 60%;
            height: 60%;
          }
          h1 {
            font-size: 1.75rem;
            font-weight: 800;
            margin-bottom: 0.75rem;
            letter-spacing: -0.025em;
          }
          p {
            color: var(--text-muted);
            line-height: 1.6;
            margin-bottom: 2.5rem;
            font-size: 1.05rem;
          }
          .btn-primary {
            display: inline-block;
            background-color: var(--rally-blue);
            color: white;
            font-weight: 700;
            padding: 1rem 2.5rem;
            border-radius: 1rem;
            text-decoration: none;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 0 10px 15px -3px rgba(59, 130, 246, 0.4);
            font-size: 1.1rem;
          }
          .btn-primary:hover {
            background-color: var(--rally-blue-dark);
            transform: translateY(-2px);
            box-shadow: 0 20px 25px -5px rgba(59, 130, 246, 0.4);
          }
          .btn-primary:active {
            transform: translateY(0);
          }
          .footer {
            margin-top: 2.5rem;
            padding-top: 1.5rem;
            border-top: 1px solid #f1f5f9;
            font-size: 0.95rem;
            color: var(--text-muted);
          }
          .link {
            color: var(--rally-blue);
            text-decoration: none;
            font-weight: 600;
          }
          .store-links {
            display: flex;
            justify-content: center;
            gap: 0.75rem;
            margin-top: 1.25rem;
          }
          .store-badge {
            height: 40px;
            transition: transform 0.2s ease;
          }
          .store-badge:hover {
            transform: scale(1.05);
          }
        </style>
      </head>
      <body>
        <div class="background-blobs">
          <div class="blob blob-1"></div>
          <div class="blob blob-2"></div>
        </div>
        <div class="card">
          <div class="hero-image">
            ${event && event.eventImages && event.eventImages.length > 0
        ? `<img src="${event.eventImages[0]}" alt="${eventName}" style="width: 100%; height: 100%; object-fit: cover;">`
        : `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M2 17L12 22L22 17" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M2 12L12 17L22 12" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                 </svg>`
      }
          </div>
          <h1>Join the Game!</h1>
          <p>You've been invited to <strong>${eventName}</strong>. Open the app to view details and book your spot.</p>
          
          <a href="rally-app://event/${eventId}" class="btn-primary" id="openBtn">
            Open in Rally
          </a>

          <div class="footer">
            Don't have the app yet? <br/>
            <div class="store-links">
              <a href="https://apps.apple.com/in/app/rally-sports/id6526470249?platform=ipad" target="_blank">
                <img src="https://upload.wikimedia.org/wikipedia/commons/3/3c/Download_on_the_App_Store_Badge.svg" alt="Download on the App Store" class="store-badge">
              </a>
              <a href="https://play.google.com/store/apps/details?id=com.rallysports.app&pcampaignid=web_share" target="_blank">
                <img src="https://upload.wikimedia.org/wikipedia/commons/7/78/Google_Play_Store_badge_EN.svg" alt="Get it on Google Play" class="store-badge">
              </a>
            </div>
          </div>
        </div>

        <script>
          // Automatic redirection attempt
          window.onload = function() {
            // Small delay to ensure browser handles the redirect properly
            setTimeout(function() {
              window.location.href = "rally-app://event/${eventId}";
            }, 500);

            // Optional: Detect if app didn't open and show a message
            // Browsers don't reliably signal if a custom scheme failed, 
            // but we can check if the page is still focused.
          };

          // Manual click handler for the button
          document.getElementById('openBtn').addEventListener('click', function(e) {
            // Native anchor behavior will handle the redirect
            console.log('Manually opening deep link...');
          });
        </script>
      </body>
      </html>
    `;

    res.send(html);
  } catch (error) {
    console.error('Error serving event landing page:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Account deletion page for Google Play compliance
app.get('/account-deletion', (req, res) => {
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Account Deletion | Rally</title>
      <meta name="description" content="Request account and data deletion for your Rally Sports app account.">
      <style>
        :root {
          --rally-blue: #3b82f6;
          --rally-blue-dark: #2563eb;
          --bg-color: #f1f5f9;
          --card-bg: #ffffff;
          --text-main: #0f172a;
          --text-muted: #64748b;
        }
        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          background-color: var(--bg-color);
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          margin: 0;
          color: var(--text-main);
          padding: 1.5rem;
          box-sizing: border-box;
        }
        .card {
          background: var(--card-bg);
          padding: 2.5rem 2.5rem;
          border-radius: 1.5rem;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.1);
          max-width: 550px;
          width: 100%;
          text-align: left;
          border: 1px solid rgba(255, 255, 255, 0.5);
        }
        .logo-container {
          display: flex;
          justify-content: center;
          margin-bottom: 1.5rem;
        }
        .logo {
          width: 64px;
          height: 64px;
          background: var(--rally-blue);
          border-radius: 1rem;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .logo svg {
          width: 36px;
          height: 36px;
        }
        h1 {
          font-size: 1.75rem;
          font-weight: 800;
          margin-bottom: 1rem;
          text-align: center;
          letter-spacing: -0.025em;
        }
        p {
          color: var(--text-muted);
          line-height: 1.6;
          margin-bottom: 1.5rem;
          font-size: 1.05rem;
        }
        .instructions {
          background: #f8fafc;
          padding: 1.5rem;
          border-radius: 1rem;
          border: 1px solid #e2e8f0;
          margin-bottom: 2rem;
        }
        .instructions h3 {
          margin-top: 0;
          color: var(--text-main);
          font-size: 1.15rem;
          margin-bottom: 1rem;
        }
        ol {
          padding-left: 1.25rem;
          color: var(--text-muted);
          margin: 0;
        }
        ol li {
          margin-bottom: 0.75rem;
          line-height: 1.5;
        }
        ol li:last-child {
          margin-bottom: 0;
        }
        .btn-primary {
          display: block;
          text-align: center;
          background-color: var(--rally-blue);
          color: white;
          font-weight: 600;
          padding: 1rem 1.5rem;
          border-radius: 0.75rem;
          text-decoration: none;
          transition: all 0.2s ease;
          box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.3);
          font-size: 1.05rem;
        }
        .btn-primary:hover {
          background-color: var(--rally-blue-dark);
          transform: translateY(-1px);
          box-shadow: 0 6px 8px -1px rgba(59, 130, 246, 0.4);
        }
        .footer-note {
          margin-top: 2rem;
          font-size: 0.9rem;
          color: #94a3b8;
          text-align: center;
          border-top: 1px solid #e2e8f0;
          padding-top: 1.5rem;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="logo-container">
          <div class="logo">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M2 17L12 22L22 17" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M2 12L12 17L22 12" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
        </div>
        
        <h1>Account Deletion</h1>
        <p>If you wish to delete your Rally account and all associated personal data, you can do so directly from within the app. This action is permanent and cannot be undone.</p>
        
        <div class="instructions">
          <h3>How to delete your account:</h3>
          <ol>
            <li>Open the Rally Sports app on your device.</li>
            <li>Log in to your account.</li>
            <li>Navigate to your <strong>Profile</strong>.</li>
            <li>Tap on the <strong>Settings</strong> icon (gear).</li>
            <li>Scroll down and select <strong>Delete Account</strong>.</li>
            <li>Follow the prompts to confirm deletion.</li>
          </ol>
        </div>

        <p>If you no longer have access to the app, you can request manual account and data deletion by contacting our support team.</p>
        <a href="mailto:support@rallysports.ae?subject=Account%20Deletion%20Request" class="btn-primary">Request Deletion via Email</a>
        
        <div class="footer-note">
          Data deletion requests may take up to 7 business days to process. All associated data including profile information, bookings, and history will be permanently removed.
        </div>
      </div>
    </body>
    </html>
  `;
  res.send(html);
});

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

