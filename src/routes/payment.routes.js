const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment/payment.controller');
const { protect } = require('../middleware/auth');
const { parseFormData } = require('../middleware/formDataParser');

/**
 * PAYMENT ROUTES
 */

/**
 * Create Stripe payment intent
 * POST /api/payments/create-order
 * Headers: Authorization: Bearer <token>
 * Content-Type: application/json OR multipart/form-data OR application/x-www-form-urlencoded
 * Body: {
 *   eventId: "E1",
 *   promoCode: "SUMMER20" (optional)
 * }
 */
router.post('/create-order', protect, parseFormData, paymentController.createPaymentOrder);

/**
 * Verify Stripe payment
 * POST /api/payments/verify
 * Headers: Authorization: Bearer <token>
 * Body: {
 *   payment_intent_id: "pi_xxx"
 * }
 */
router.post('/verify', protect, paymentController.verifyPayment);

/**
 * Get payment history for user
 * GET /api/payments/history?limit=50&skip=0
 */
router.get('/history', protect, paymentController.getPaymentHistory);

/**
 * Get payment by ID
 * GET /api/payments/:id
 */
router.get('/:id', protect, paymentController.getPaymentById);

module.exports = router;

