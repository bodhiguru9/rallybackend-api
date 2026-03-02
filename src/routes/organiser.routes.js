const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const organiserOnly = require('../middleware/organiserOnly');
const organiserBankDetailsController = require('../controllers/organiser/organiserBankDetails.controller');
const organiserBankAccountsController = require('../controllers/organiser/organiserBankAccounts.controller');
const organiserAnalyticsController = require('../controllers/organiser/organiserAnalytics.controller');
const organiserMembersController = require('../controllers/organiser/organiserMembers.controller');
const organiserTransactionsController = require('../controllers/organiser/organiserTransactions.controller');
const organiserAttendeesController = require('../controllers/organiser/organiserAttendees.controller');

/**
 * ORGANISER BANK DETAILS ROUTES
 */

/**
 * Save or update Organiser bank details/KYC
 * POST /api/organizers/bank-details
 * POST /api/organizers/:organizerId/bank-details
 * Headers: Authorization: Bearer <token>
 * Content-Type: application/json
 * 
 * The organizerId can be provided in:
 * 1. URL params: /api/organizers/:organizerId/bank-details
 * 2. Request body: { "organizerId": "...", ... }
 * 3. Automatically from authenticated user (if not provided)
 * 
 * Note: Users can only save bank details for their own account.
 * 
 * For UAE:
 * {
 *   "organizerId": "optional - if not provided, uses authenticated user",
 *   "country": "UAE",
 *   "bankName": "Emirates NBD",
 *   "iban": "AE123456789012345678901",
 *   "emiratesId": "784-1234-5678901-1"
 * }
 * 
 * For India:
 * {
 *   "organizerId": "optional - if not provided, uses authenticated user",
 *   "country": "India",
 *   "bankName": "State Bank of India",
 *   "accountNumber": "1234567890",
 *   "ifscCode": "SBIN0001234",
 *   "accountHolderName": "John Doe",
 *   "aadhaar": "1234 5678 9012"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Bank details saved successfully",
 *   "data": {
 *     "bankDetails": {
 *       "organizerId": "...",
 *       "country": "UAE",
 *       "bankName": "...",
 *       "iban": "...",
 *       "emiratesId": "...",
 *       "createdAt": "...",
 *       "updatedAt": "..."
 *     }
 *   }
 * }
 */
router.post('/bank-details', protect, organiserOnly, organiserBankDetailsController.saveBankDetails);
router.post('/:organizerId/bank-details', protect, organiserOnly, organiserBankDetailsController.saveBankDetails);

/**
 * Get Organiser bank details (current logged-in Organiser)
 * GET /api/organizers/bank-details
 * Headers: Authorization: Bearer <token>
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Bank details retrieved successfully",
 *   "data": {
 *     "bankDetails": {
 *       "organizerId": "...",
 *       "country": "UAE",
 *       "bankName": "...",
 *       "iban": "...",
 *       "emiratesId": "...",
 *       "createdAt": "...",
 *       "updatedAt": "..."
 *     }
 *   }
 * }
 */
router.get('/bank-details', protect, organiserOnly, organiserBankDetailsController.getBankDetails);

/**
 * Get Organiser bank details by Organiser ID
 * GET /api/organizers/:organizerId/bank-details
 * Headers: Authorization: Bearer <token>
 * 
 * Supports both sequential userId (1, 2, 3, etc.) and MongoDB ObjectId.
 * Organisers can only view their own bank details.
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Bank details retrieved successfully",
 *   "data": {
 *     "bankDetails": {
 *       "organizerId": "...",
 *       "country": "India",
 *       "bankName": "...",
 *       "accountNumber": "...",
 *       "ifscCode": "...",
 *       "accountHolderName": "...",
 *       "aadhaar": "...",
 *       "createdAt": "...",
 *       "updatedAt": "..."
 *     }
 *   }
 * }
 */
router.get('/:organizerId/bank-details', protect, organiserOnly, organiserBankDetailsController.getBankDetailsById);

/**
 * Update Organiser bank details/KYC
 * PUT /api/organizers/bank-details
 * PUT /api/organizers/:organizerId/bank-details
 * Headers: Authorization: Bearer <token>
 * Content-Type: application/json
 * 
 * The organizerId can be provided in:
 * 1. URL params: /api/organizers/:organizerId/bank-details
 * 2. Request body: { "organizerId": "...", ... }
 * 3. Automatically from authenticated user (if not provided)
 * 
 * Note: Users can only update bank details for their own account.
 * All fields are optional - only provided fields will be updated.
 * 
 * For UAE (partial update - only provide fields to update):
 * {
 *   "organizerId": "optional - if not provided, uses authenticated user",
 *   "country": "UAE",
 *   "bankName": "Updated Bank Name",
 *   "iban": "AE123456789012345678901",
 *   "emiratesId": "784-1234-5678901-1"
 * }
 * 
 * For India (partial update - only provide fields to update):
 * {
 *   "organizerId": "optional - if not provided, uses authenticated user",
 *   "country": "India",
 *   "bankName": "Updated Bank Name",
 *   "accountNumber": "1234567890",
 *   "ifscCode": "SBIN0001234",
 *   "accountHolderName": "John Doe",
 *   "aadhaar": "1234 5678 9012"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Bank details updated successfully",
 *   "data": {
 *     "bankDetails": {
 *       "organizerId": 5,
 *       "country": "UAE",
 *       "bankName": "...",
 *       "iban": "...",
 *       "emiratesId": "...",
 *       "createdAt": "...",
 *       "updatedAt": "..."
 *     }
 *   }
 * }
 */
router.put('/bank-details', protect, organiserOnly, organiserBankDetailsController.updateBankDetails);
router.put('/:organizerId/bank-details', protect, organiserOnly, organiserBankDetailsController.updateBankDetails);

/**
 * Delete Organiser bank details/KYC
 * DELETE /api/organizers/bank-details
 * DELETE /api/organizers/:organizerId/bank-details
 * Headers: Authorization: Bearer <token>
 * Content-Type: application/json (optional)
 * 
 * The organizerId can be provided in:
 * 1. URL params: /api/organizers/:organizerId/bank-details
 * 2. Request body: { "organizerId": "..." } (optional)
 * 3. Automatically from authenticated user (if not provided)
 * 
 * Note: Users can only delete bank details for their own account.
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Bank details deleted successfully",
 *   "data": {
 *     "organizerId": 5,
 *     "deletedAt": "2024-01-01T00:00:00.000Z"
 *   }
 * }
 */
router.delete('/bank-details', protect, organiserOnly, organiserBankDetailsController.deleteBankDetails);
router.delete('/:organizerId/bank-details', protect, organiserOnly, organiserBankDetailsController.deleteBankDetails);

/**
 * ORGANISER BANK ACCOUNTS (simple: Account holder name, IBAN, Bank name)
 * All routes require: Authorization: Bearer <token>, Organiser only.
 */

/**
 * Create bank account
 * POST /api/organizers/bank-accounts
 * Body: { "accountHolderName": "...", "iban": "...", "bankName": "..." }
 */
router.post('/bank-accounts', protect, organiserOnly, organiserBankAccountsController.createBankAccount);

/**
 * Get all bank accounts for current organiser
 * GET /api/organizers/bank-accounts
 */
router.get('/bank-accounts', protect, organiserOnly, organiserBankAccountsController.getAllBankAccounts);

/**
 * Get bank account by id
 * GET /api/organizers/bank-accounts/:id
 */
router.get('/bank-accounts/:id', protect, organiserOnly, organiserBankAccountsController.getBankAccountById);

/**
 * Update bank account by id
 * PUT /api/organizers/bank-accounts/:id
 * Body: { "accountHolderName": "...", "iban": "...", "bankName": "..." } (all optional)
 */
router.put('/bank-accounts/:id', protect, organiserOnly, organiserBankAccountsController.updateBankAccount);

/**
 * Delete bank account by id
 * DELETE /api/organizers/bank-accounts/:id
 */
router.delete('/bank-accounts/:id', protect, organiserOnly, organiserBankAccountsController.deleteBankAccount);

/**
 * Get Organiser analytics (revenue, events, transactions)
 * GET /api/organizers/analytics
 * GET /api/organizers/analytics?organizerId=5&sport=cricket&revenuePeriod=thisMonth
 * Headers: Authorization: Bearer <token>
 * 
 * Query Parameters (all optional):
 * - organizerId: Organiser user ID (if not provided, uses authenticated user)
 * - sport: Filter by sport/category (e.g., "cricket", "football", "swimming")
 * - startDate: Filter events from this date (YYYY-MM-DD format)
 * - endDate: Filter events to this date (YYYY-MM-DD format)
 * - revenuePeriod: Filter revenue by period - "today", "lastWeek", "thisMonth", "6months", "lifetime" (default: "lifetime")
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Analytics retrieved successfully",
 *   "data": {
 *     "organizerId": 5,
 *     "stats": {
 *       "totalEvents": 10,
 *       "upcomingEvents": 3,
 *       "ongoingEvents": 1,
 *       "pastEvents": 6,
 *       "totalRevenue": 50000,
 *       "totalTransactions": 25,
 *       "averageRevenuePerEvent": 5000,
 *       "revenuePeriod": "lifetime"
 *     },
 *     "revenue": {
 *       "total": 50000,
 *       "period": "lifetime",
 *       "bySport": {
 *         "cricket": 30000,
 *         "football": 20000
 *       }
 *     },
 *     "events": {
 *       "upcoming": [...],
 *       "ongoing": [...],
 *       "past": [...],
 *       "total": 10
 *     },
 *     "transactions": [...],
 *     "filters": {
 *       "sport": null,
 *       "startDate": null,
 *       "endDate": null,
 *       "revenuePeriod": "lifetime"
 *     }
 *   }
 * }
 */
router.get('/analytics', protect, organiserOnly, organiserAnalyticsController.getOrganiserAnalytics);

/**
 * Get organiser members with booking stats
 * GET /api/organizers/members?page=1&perPage=20
 * Headers: Authorization: Bearer <token>
 */
router.get('/members', protect, organiserOnly, organiserMembersController.getOrganiserMembers);

/**
 * Remove organiser member by userId
 * DELETE /api/organizers/members/:userId
 * Headers: Authorization: Bearer <token>
 */
router.delete('/members/:userId', protect, organiserOnly, organiserMembersController.removeOrganiserMember);

/**
 * Get organiser attendees across all events
 * GET /api/organizers/attendees?page=1&perPage=20
 * Headers: Authorization: Bearer <token>
 */
router.get('/attendees', protect, organiserOnly, organiserAttendeesController.getOrganiserAttendees);

/**
 * Get organiser transactions (recent payments for their events)
 * GET /api/organizers/transactions?page=1&perPage=20
 * Headers: Authorization: Bearer <token>
 */
router.get('/transactions', protect, organiserOnly, organiserTransactionsController.getOrganiserTransactions);

module.exports = router;

