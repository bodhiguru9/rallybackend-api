const express = require('express');
const router = express.Router();
const sportController = require('../controllers/sport/sport.controller');

/**
 * SPORTS ROUTES
 * All endpoints are public (no authentication required)
 */

/**
 * Create a new sport
 * POST /api/sports
 * Body: {
 *   name: "Cricket",
 *   description: "A bat-and-ball game",
 *   icon: "https://example.com/cricket-icon.png" (optional),
 *   isActive: true (optional, default: true)
 * }
 */
router.post('/', sportController.createSport);

/**
 * Get all sports
 * GET /api/sports?isActive=true
 * Query Parameters:
 * - isActive: Filter by active status (true/false, optional)
 */
router.get('/', sportController.getAllSports);

/**
 * Get sport by ID
 * GET /api/sports/:id
 * Can use sequential ID (SP1, SP2, etc.) or MongoDB ObjectId
 */
router.get('/:id', sportController.getSportById);

/**
 * Update sport
 * PUT /api/sports/:id
 * Body: {
 *   name: "Updated Name" (optional),
 *   description: "Updated description" (optional),
 *   icon: "https://example.com/new-icon.png" (optional),
 *   isActive: false (optional)
 * }
 */
router.put('/:id', sportController.updateSport);

/**
 * Delete sport
 * DELETE /api/sports/:id
 */
router.delete('/:id', sportController.deleteSport);

module.exports = router;

