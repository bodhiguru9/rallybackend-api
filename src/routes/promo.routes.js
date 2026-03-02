const express = require('express');
const router = express.Router();
const promoCodeController = require('../controllers/promo/promoCode.controller');
const { protect, optionalAuth } = require('../middleware/auth');
const organiserOnly = require('../middleware/organiserOnly');
const { parseFormData } = require('../middleware/formDataParser');

/**
 * PROMO CODE ROUTES
 */

/**
 * Create a new promo code
 * POST /api/promo-codes
 * Headers: Authorization: Bearer <token>
 * Body: {
 *   code: "SUMMER20",
 *   description: "Summer discount",
 *   discountType: "percentage" | "fixed",
 *   discountValue: 20,
 *   minPurchaseAmount: 100,
 *   maxDiscountAmount: 500 (optional, for percentage),
 *   eventIds: [] (optional, empty = all events),
 *   usageLimit: 100 (optional, null = unlimited),
 *   userUsageLimit: 1,
 *   validFrom: "2024-01-01" (optional),
 *   validUntil: "2024-12-31" (optional),
 *   isActive: true
 * }
 */
router.post('/', protect, organiserOnly, promoCodeController.createPromoCode);

/**
 * Get all promo codes
 * GET /api/promo-codes?isActive=true&eventId=xxx&limit=50&skip=0
 */
router.get('/', protect, organiserOnly, promoCodeController.getAllPromoCodes);

/**
 * Get promo code by ID
 * GET /api/promo-codes/:id
 */
router.get('/:id', protect, organiserOnly, promoCodeController.getPromoCodeById);

/**
 * Update promo code
 * PUT /api/promo-codes/:id
 * Content-Type: application/json OR multipart/form-data OR application/x-www-form-urlencoded
 */
router.put('/:id', protect, organiserOnly, parseFormData, promoCodeController.updatePromoCode);

/**
 * Delete promo code
 * DELETE /api/promo-codes/:id
 */
router.delete('/:id', protect, organiserOnly, promoCodeController.deletePromoCode);

/**
 * Validate promo code (Public - can be used by anyone, optional auth for user usage limit check)
 * POST /api/promo-codes/validate
 * Body: {
 *   code: "SUMMER20",
 *   eventId: "E1",
 *   amount: 500
 * }
 */
router.post('/validate', optionalAuth, promoCodeController.validatePromoCode);

module.exports = router;

