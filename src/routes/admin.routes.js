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
const { createBroadcast, getBroadcastStatus, listBroadcasts } = require('../controllers/admin/broadcast.controller');
const { getBookingDetails } = require('../controllers/admin/booking.controller');
const { listOrganisers, getOrganiserById, getOrganiserEvents, deleteOrganiser } = require('../controllers/admin/organiser.controller');
const { listAllEvents, getEventDetails } = require('../controllers/admin/events.controller');
const { searchUsers, deleteUser } = require('../controllers/admin/userSearch.controller');
const { createUser } = require('../controllers/admin/createUser.controller');
const { getAdminUsers } = require('../controllers/user/getAllUsers.controller');

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
 * GET /api/admin/events?type=all|free|paid&search=&page=&perPage=
 *
 * Events tab: every event across all organisers, same shape as the
 * per-organiser events route plus an `organiser` summary per event.
 */
router.get('/events', listAllEvents);

/**
 * GET /api/admin/events/:eventId?status=all|booked|cancelled|pending|failed&page=&perPage=
 *
 * Full event detail page: event info, organiser, revenue/attendee summary
 * (booked bookings only), and the booking list (filterable by status).
 * :eventId accepts either the sequential id (E428) or the Mongo _id.
 */
router.get('/events/:eventId', getEventDetails);

/**
 * GET /api/admin/search-user?search=&page=&perPage=
 *
 * Search users of any type (player or organiser) by name, email, or
 * phone (any format). Matching the same email/phone across multiple
 * accounts surfaces all of them together, with join date, last booking,
 * and (for organisers) event stats to tell accounts apart.
 */
router.get('/search-user', searchUsers);

/**
 * GET /api/admin/users?page=&perPage=&userType=player|organiser
 *
 * Full user list for the panel's user export and the empty-search view:
 * same shape as the legacy public GET /api/users, including email,
 * mobileNumber, dob, gender, verification flags and booking stats.
 * perPage 1-100 (default 20). Newest first.
 */
router.get('/users', getAdminUsers);

/**
 * DELETE /api/admin/users/:userId
 *
 * Body: { confirm: { email, mobileNumber, bio?, createdAt? } } — bio for
 * organisers, createdAt (exact join timestamp) for everyone else, since
 * bio doesn't exist for non-organisers. Works for any user type.
 */
router.delete('/users/:userId', deleteUser);

/**
 * POST /api/admin/create-user
 *
 * Create a player or organiser account directly — bypasses the OTP
 * signup flow; the admin vouches for the account. Body: { userType,
 * fullName, email?, mobileNumber? (E.164), password?, ...type-specific }.
 * At least one of email/mobileNumber is required.
 */
router.post('/create-user', createUser);

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
 *
 * The response is a fire-and-forget ack, sent before the broadcast is
 * actually processed — poll GET /broadcasts/:broadcastId afterward to see
 * the real outcome (sent/failed, recipient and per-channel counts).
 */
router.post('/broadcasts', createBroadcast);

/**
 * GET /api/admin/broadcasts?page=&perPage=
 *
 * Broadcast history, most recent first.
 */
router.get('/broadcasts', listBroadcasts);

/**
 * GET /api/admin/broadcasts/:broadcastId
 *
 * A single broadcast's current status — poll this after POSTing a
 * broadcast until status moves off "queued" to "sent" or "failed".
 */
router.get('/broadcasts/:broadcastId', getBroadcastStatus);

module.exports = router;
