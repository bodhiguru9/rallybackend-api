/**
 * admin.routes.js
 *
 * Routes for the Lovable admin panel. Authenticated by a shared
 * ADMIN_API_KEY (adminKeyAuth) forwarded by Supabase Edge Functions — the
 * panel itself never holds this key. Every call is logged to
 * adminAuditLog by adminAudit (auth failures are logged by adminKeyAuth
 * itself, since adminAudit never sees a request adminKeyAuth rejected).
 */

const express = require('express');
const router = express.Router();
const adminKeyAuth = require('../middleware/adminKeyAuth');
const adminAudit = require('../middleware/adminAudit');
const { createBroadcast } = require('../controllers/admin/broadcast.controller');
const { getBookingDetails } = require('../controllers/admin/booking.controller');
const { deleteOrganiser } = require('../controllers/admin/organiser.controller');

router.use(adminKeyAuth, adminAudit);

/**
 * GET /api/admin/bookings/:bookingId
 *
 * Look up a booking's details. No ownership check (admin-only).
 */
router.get('/bookings/:bookingId', getBookingDetails);

/**
 * DELETE /api/admin/organisers/:userId
 *
 * Body: { confirm: { email, mobileNumber, bio } } — must match the target
 * organiser's current record. 400 if the target isn't an organiser.
 */
router.delete('/organisers/:userId', deleteOrganiser);

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
 *   notification: { channel: "push" | "in_app" | "both", priority?: "high" | "normal" },
 *   dryRun?: boolean
 * }
 *
 * Response: { broadcast_id: "brd_...", status: "queued" }, or
 * { dryRun: true, recipientCount } when dryRun is true.
 */
router.post('/broadcasts', createBroadcast);

module.exports = router;
