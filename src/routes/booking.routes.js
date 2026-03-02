const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/booking/booking.controller');
const { protect } = require('../middleware/auth');
const { parseFormData } = require('../middleware/formDataParser');

/**
 * BOOKING ROUTES
 */

/**
 * Book event (creates booking and initiates Stripe payment for paid events)
 * 
 * POST /api/bookings/book-event/:eventId?promoCode=SUMMER20
 * 
 * Headers:
 *   Authorization: Bearer <token>
 *   Content-Type: application/json (optional)
 * 
 * URL Params:
 *   - eventId: Event ID (e.g., "E1", "E2")
 * 
 * Query Params (optional):
 *   - promoCode: Promo code string (optional)
 * 
 * Request Body (optional):
 *   {
 *     "promoCode": "SUMMER20"  // Optional, can also be in query params
 *   }
 * 
 * Response for Free Events (price = 0):
 *   {
 *     "success": true,
 *     "message": "Free event booked successfully",
 *     "data": {
 *       "booking": { "bookingId": "booking1", "status": "booked", ... },
 *       "isFreeEvent": true,
 *       "paymentRequired": false
 *     }
 *   }
 * 
 * Response for Paid Events (price > 0):
 *   {
 *     "success": true,
 *     "message": "Booking created. Please complete payment.",
 *     "data": {
 *       "booking": { "bookingId": "booking2", "status": "pending", ... },
 *       "paymentIntent": { "id": "pi_xxx", "clientSecret": "...", ... },
 *       "payment": { "paymentId": "PAY1", ... },
 *       "publishableKey": "pk_test_...",
 *       "isFreeEvent": false,
 *       "paymentRequired": true
 *     }
 *   }
 * 
 * Note: 
 *   - userId is automatically picked from logged-in user (no need to send)
 *   - For paid events, frontend should use paymentIntent.clientSecret with Stripe
 *   - After payment, call /api/payments/verify to confirm booking
 */
router.post('/book-event/:eventId', protect, parseFormData, bookingController.bookEvent);

/**
 * Get pending bookings
 * GET /api/bookings/pending?page=1&limit=20
 * Headers: Authorization: Bearer <token>
 */
router.get('/pending', protect, bookingController.getPendingBookings);

/**
 * Get booked (confirmed) bookings
 * GET /api/bookings/booked?page=1&limit=20
 * Headers: Authorization: Bearer <token>
 */
router.get('/booked', protect, bookingController.getBookedBookings);

/**
 * Get all bookings (with optional status filter)
 * GET /api/bookings?status=pending|booked|cancelled&page=1&limit=20
 * Headers: Authorization: Bearer <token>
 */
router.get('/', protect, bookingController.getAllBookings);

/**
 * Cancel a booking (pending or booked) before event starts
 * POST /api/bookings/:bookingId/cancel
 * Headers: Authorization: Bearer <token>
 * 
 * Allows cancellation of:
 * - Pending bookings (anytime)
 * - Booked bookings (only before event starts)
 * 
 * For booked bookings, user will be removed from EventJoin upon cancellation.
 */
router.post('/:bookingId/cancel', protect, bookingController.cancelBooking);

/**
 * Get booking details by ID
 * GET /api/bookings/:bookingId
 * Headers: Authorization: Bearer <token>
 */
router.get('/:bookingId', protect, bookingController.getBookingDetails);

module.exports = router;
