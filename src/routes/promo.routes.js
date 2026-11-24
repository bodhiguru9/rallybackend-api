const express = require('express');
const router = express.Router();
const playerPromo = require('../controllers/promo/promoCode.controller');
const organiserPromo = require('../controllers/promo/organiserPromo.controller');
const { protect, optionalAuth } = require('../middleware/auth');
const organiserOnly = require('../middleware/organiserOnly');

/**
 * PROMO CODE ROUTES (/api/promo-codes). Contract: PROMO_API.md
 * Fixed paths are declared before /:id so they are never read as an id.
 */

// --- Player ---------------------------------------------------------------------------------------------
// Server-side price quote (event or package) with promo codes
router.post('/quote', protect, playerPromo.quotePromo);
// Legacy validate (older app builds). Optional auth: eligibility is only checked when signed in.
router.post('/validate', optionalAuth, playerPromo.validatePromoCode);

// --- Organiser (a caller only ever sees and changes codes they own) -----------------------------------
router.get('/summary', protect, organiserOnly, organiserPromo.getSummary);
router.get('/', protect, organiserOnly, organiserPromo.listCodes);
router.post('/', protect, organiserOnly, organiserPromo.createCode);
router.get('/:id', protect, organiserOnly, organiserPromo.getCode);
router.put('/:id', protect, organiserOnly, organiserPromo.editCode);
router.patch('/:id/status', protect, organiserOnly, organiserPromo.setStatus);
router.delete('/:id', protect, organiserOnly, organiserPromo.archiveCode);
router.get('/:id/purchases', protect, organiserOnly, organiserPromo.listPurchases);
router.get('/:id/purchases/export', protect, organiserOnly, organiserPromo.exportPurchases);
router.post('/:id/notify', protect, organiserOnly, organiserPromo.notifyFollowers);

module.exports = router;
