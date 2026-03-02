// Serverless function wrapper for Vercel
// This file can be easily removed later - it's isolated from the main codebase
// To remove: delete this file and revert vercel.json changes

try {
  require('dotenv').config();
  
  // Set Vercel environment flag for serverless mode
  process.env.VERCEL = 'true';
  
  // Import and export the Express app directly
  // Vercel's @vercel/node builder automatically handles Express apps
  // The DB connection middleware is already in src/index.js
  const app = require('../src/index');
  
  // Export the app directly - Vercel expects this format
  module.exports = app;
} catch (error) {
  console.error('❌ Failed to initialize serverless function:', error);
  
  // Export a minimal error handler
  const express = require('express');
  const errorApp = express();
  
  errorApp.use((req, res) => {
    res.status(500).json({
      success: false,
      error: 'Server initialization failed',
      message: error.message || 'Failed to start serverless function',
    });
  });
  
  module.exports = errorApp;
}
