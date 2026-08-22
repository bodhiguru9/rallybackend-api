/**
 * admin.routes.js
 *
 * Routes for superadmin-only administrative actions.
 * All routes require authentication + superadmin role.
 */

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { createBroadcast } = require('../controllers/admin/broadcast.controller');

/**
 * Middleware: require superadmin user type
 */
const requireSuperadmin = (req, res, next) => {
  if (!req.user || req.user.userType !== 'superadmin') {
    return res.status(403).json({
      success: false,
      error: 'Access denied. Superadmin privileges required.',
    });
  }
  next();
};

/**
 * POST /api/admin/broadcasts
 *
 * Send a push and/or in-app broadcast to a segment of users.
 *
 * Body:
 * {
 *   audience: { type: "all" | "players" | "organisers" | "user_ids", userIds?: string[] },
 *   message:  { title: string, body: string, action?: { type, url } },
 *   metadata: { category?: "maintenance" | "update" | "promotion" | "security" | "announcement" },
 *   notification: { channel: "push" | "in_app" | "both", priority?: "high" | "normal" }
 * }
 *
 * Response: { broadcast_id: "brd_...", status: "queued" }
 */
router.post('/broadcasts', protect, requireSuperadmin, createBroadcast);

module.exports = router;
