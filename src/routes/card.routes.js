const express = require('express');
const router = express.Router();

const { protect } = require('../middleware/auth');
const cardController = require('../controllers/card/card.controller');

/**
 * SAVED CARDS (TOKENIZED)
 *
 * IMPORTANT:
 * - This API does NOT accept/store CVV or full card number.
 * - Save cards using Stripe PaymentMethod IDs (pm_...).
 */

// POST /api/cards/setup-intent
router.post('/setup-intent', protect, cardController.createSetupIntent);

// POST /api/cards
router.post('/', protect, cardController.createSavedCard);

// GET /api/cards
router.get('/', protect, cardController.getSavedCards);

// GET /api/cards/:cardId
router.get('/:cardId', protect, cardController.getSavedCard);

// PUT /api/cards/:cardId
router.put('/:cardId', protect, cardController.updateSavedCard);

// POST /api/cards/:cardId/cvc-update
router.post('/:cardId/cvc-update', protect, cardController.updateSavedCardCvc);

// DELETE /api/cards/:cardId
router.delete('/:cardId', protect, cardController.deleteSavedCard);

module.exports = router;

