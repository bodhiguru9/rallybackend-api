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
const { listOrganisers, getOrganiserById, getOrganiserEvents, deleteOrganiser } = require('../controllers/admin/organiser.controller');
const { listAllEvents } = require('../controllers/admin/events.controller');

router.use(adminKeyAuth, adminAudit);

/**
 * GET /api/admin/bookings/:bookingId
 *
 * Look up a booking's details. No ownership check (admin-only).
 */
router.get('/bookings/:bookingId', getBookingDetails);

/**
 * GET /api/admin/organisers?search=&page=&perPage=
 *
 * Landing page for the events/sales tracker: paginated organiser list,
 * optionally filtered by name/email/community search.
 */
router.get('/organisers', listOrganisers);

/**
 * GET /api/admin/organisers/:userId
 *
 * Single organiser's full details, including bio and mobileNumber (the
 * list endpoint omits these). The delete confirmation modal fetches this
 * first so it can send a real confirm payload.
 */
router.get('/organisers/:userId', getOrganiserById);

/**
 * GET /api/admin/organisers/:organiserId/events?type=all|free|paid&page=&perPage=
 *
 * That organiser's events (free and paid, filterable by type) with
 * bookingCount, attendeeCount, and totalSales per event. Free events show
 * totalSales: 0 but real booking/attendee counts.
 */
router.get('/organisers/:organiserId/events', getOrganiserEvents);

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
/**
 * GET /api/admin/events?type=all|free|paid&search=&page=&perPage=
 *
 * Events tab: every event across all organisers, same shape as the
 * per-organiser events route plus an `organiser` summary per event.
 */
router.get('/events', listAllEvents);

router.post('/broadcasts', createBroadcast);

module.exports = router;
