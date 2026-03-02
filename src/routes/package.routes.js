const express = require('express');
const router = express.Router();
const { protect, optionalAuth } = require('../middleware/auth');
const organiserOnly = require('../middleware/organiserOnly');

// Controllers
const createPackageController = require('../controllers/package/organiser/createPackage.controller');
const createBulkPackagesController = require('../controllers/package/organiser/createBulkPackages.controller');
const deleteBulkPackagesController = require('../controllers/package/organiser/deleteBulkPackages.controller');
const deletePackageController = require('../controllers/package/organiser/deletePackage.controller');
const updatePackageController = require('../controllers/package/organiser/updatePackage.controller');
const getMyPackagesOrganiserController = require('../controllers/package/organiser/getMyPackages.controller');
const getPackagePurchasesController = require('../controllers/package/organiser/getPackagePurchases.controller');
const getPackageBuyersDetailsController = require('../controllers/package/organiser/getPackageBuyersDetails.controller');
const { getPackageAttendees, getEventAttendees } = require('../controllers/package/organiser/getPackageAttendees.controller');
const purchasePackageController = require('../controllers/package/player/purchasePackage.controller');
const getMyPackagesPlayerController = require('../controllers/package/player/getMyPackages.controller');
const getPackageDetailsController = require('../controllers/package/player/getPackageDetails.controller');
const cancelPackagePurchaseController = require('../controllers/package/player/cancelPackagePurchase.controller');
const getAllPackagesController = require('../controllers/package/getAllPackages.controller');
const getPackageWithCreatorController = require('../controllers/package/getPackageWithCreator.controller');

/**
 * PACKAGE ROUTES
 */

/**
 * Get all active packages (public)
 * GET /api/packages
 */
router.get('/', getAllPackagesController);

/**
 * Create a new package (Organiser only)
 * POST /api/packages
 * Headers: Authorization: Bearer <token>
 * Body: {
 *   packageName: "Monthly Sports Package",
 *   packageDescription: "Access to multiple events",
 *   packagePrice: 500,
 *   validityMonths: 3,
 *   maxEvents: 10,
 *   eventIds: ["eventId1", "eventId2"] (optional)
 * }
 */
router.post('/', protect, organiserOnly, createPackageController);

/**
 * Update a package (Organiser only)
 * PUT /api/packages/:packageId
 * Headers: Authorization: Bearer <token>
 */
router.put('/:packageId', protect, organiserOnly, updatePackageController);

/**
 * Create packages in bulk (Organiser only)
 * POST /api/packages/bulk
 * Headers: Authorization: Bearer <token>
 * Body: { packages: [ { packageName, packageDescription, sports, eventType, packagePrice, validityMonths, maxEvents, eventIds } ] }
 */
router.post('/bulk', protect, organiserOnly, createBulkPackagesController);

/**
 * Delete packages in bulk (Organiser only)
 * DELETE /api/packages/bulk
 * Headers: Authorization: Bearer <token>
 * Body: { packageIds: ["PKG1", "PKG2"] }
 */
router.delete('/bulk', protect, organiserOnly, deleteBulkPackagesController);

/**
 * Delete a single package (Organiser only)
 * DELETE /api/packages/:packageId
 * Headers: Authorization: Bearer <token>
 */
router.delete('/:packageId', protect, organiserOnly, deletePackageController);

/**
 * Get all packages created by organiser
 * GET /api/packages/organiser/my-packages?page=1
 * Headers: Authorization: Bearer <token>
 */
router.get('/organiser/my-packages', optionalAuth, getMyPackagesOrganiserController);

/**
 * Get all package purchases for organiser
 * GET /api/packages/organiser/purchases?page=1&perPage=20
 * Headers: Authorization: Bearer <token>
 */
router.get('/organiser/purchases', protect, organiserOnly, getPackagePurchasesController);

/**
 * Get organiser package buyers with joined events and expiry info
 * GET /api/packages/organiser/purchases/details?page=1&perPage=20
 * GET /api/packages/organiser/purchases/:userId/details?page=1&perPage=20
 * Headers: Authorization: Bearer <token>
 */
router.get('/organiser/purchases/details', protect, organiserOnly, getPackageBuyersDetailsController);
router.get('/organiser/purchases/:userId/details', protect, organiserOnly, getPackageBuyersDetailsController);

/**
 * Get users who attended a specific event (from packages)
 * GET /api/packages/events/:eventId/attendees?page=1
 * Headers: Authorization: Bearer <token>
 * NOTE: This route must come before /:packageId/attendees to prevent "events" from being matched as packageId
 */
router.get('/events/:eventId/attendees', protect, organiserOnly, getEventAttendees);

/**
 * Get all packages purchased by player
 * GET /api/packages/my-packages?page=1
 * Headers: Authorization: Bearer <token>
 * NOTE: This route must come before /:packageId routes to prevent "my-packages" from being matched as packageId
 */
router.get('/my-packages', protect, getMyPackagesPlayerController);

/**
 * Get package purchase details with countdown and event info
 * GET /api/packages/my-packages/:purchaseId
 * Headers: Authorization: Bearer <token>
 */
router.get('/my-packages/:purchaseId', protect, getPackageDetailsController);

/**
 * Cancel a package purchase (Player only)
 * POST /api/packages/my-packages/:purchaseId/cancel
 * Headers: Authorization: Bearer <token>
 */
router.post('/my-packages/:purchaseId/cancel', protect, cancelPackagePurchaseController);

/**
 * Get package details with creator info
 * GET /api/packages/:packageId/details
 */
router.get('/:packageId/details', optionalAuth, getPackageWithCreatorController);

/**
 * Get users who purchased a package and their event attendance
 * GET /api/packages/:packageId/attendees?page=1
 * Headers: Authorization: Bearer <token>
 */
router.get('/:packageId/attendees', protect, organiserOnly, getPackageAttendees);

/**
 * Purchase a package (Player only)
 * POST /api/packages/:packageId/purchase
 * Headers: Authorization: Bearer <token>
 */
router.post('/:packageId/purchase', protect, purchasePackageController);

module.exports = router;
