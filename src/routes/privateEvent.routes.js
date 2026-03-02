const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const organiserOnly = require('../middleware/organiserOnly');

// Controllers
const joinPrivateEventController = require('../controllers/joinPrivate/joinPrivateEvent.controller');
const getJoinRequestsController = require('../controllers/joinPrivate/getJoinRequests.controller');
const acceptRejectController = require('../controllers/joinPrivate/acceptRejectRequest.controller');
const getMyRequestsController = require('../controllers/joinPrivate/getMyRequests.controller');
const removePlayerController = require('../controllers/joinPrivate/removePlayer.controller');

/**
 * PRIVATE EVENT JOIN REQUEST ROUTES
 */

/**
 * Get all join requests across all events (Organizer only)
 * GET /api/private-events/join-requests?page=1
 * Headers: Authorization: Bearer <token>
 * 
 * Returns all pending join requests for all private events created by the organizer.
 * NOTE: This route must come before /:eventId/join-requests to prevent "join-requests" from being matched as an eventId
 */
router.get('/join-requests', protect, organiserOnly, getJoinRequestsController.getAllJoinRequests);

/**
 * Get my join requests (for players)
 * GET /api/private-events/my-requests?page=1
 * Headers: Authorization: Bearer <token>
 * 
 * Returns all join requests made by the logged-in user for private events.
 * NOTE: This route must come before /:eventId routes to prevent "my-requests" from being matched as an eventId
 */
router.get('/my-requests', protect, getMyRequestsController.getMyJoinRequests);

/**
 * Request to join a private event
 * POST /api/private-events/:eventId/join-request
 * Headers: Authorization: Bearer <token>
 * 
 * Sends a join request to the organizer for a private event.
 * Organizer receives a notification.
 */
router.post('/:eventId/join-request', protect, joinPrivateEventController.joinPrivateEventRequest);

/**
 * Get ONLY pending requests (NOT waitlist) for a specific private event (Organizer only)
 * GET /api/private-events/:eventId/pending-requests?page=1
 */
router.get('/:eventId/pending-requests', protect, organiserOnly, getJoinRequestsController.getEventPendingRequests);

/**
 * Get all join requests for a specific private event (Organizer only)
 * GET /api/private-events/:eventId/join-requests?page=1
 * Headers: Authorization: Bearer <token>
 * 
 * Returns all pending join requests for a private event.
 * Only the event creator can view these requests.
 */
router.get('/:eventId/join-requests', protect, organiserOnly, getJoinRequestsController.getEventJoinRequests);

/**
 * Accept a join request for a private event (Organizer only)
 * POST /api/private-events/:eventId/join-requests/:requestId/accept
 * OR POST /api/private-events/:eventId/join-requests/user/:userId/accept
 * Headers: Authorization: Bearer <token>
 * 
 * Accepts a join request, adds user to event, removes from join requests list.
 * Can use either requestId (from join request response) or userId to identify the request.
 * Sends notification to the player.
 */
router.post('/:eventId/join-requests/user/:userId/accept', protect, organiserOnly, acceptRejectController.acceptJoinRequest);
router.post('/:eventId/join-requests/:requestId/accept', protect, organiserOnly, acceptRejectController.acceptJoinRequest);

/**
 * Reject a join request for a private event (Organizer only)
 * POST /api/private-events/:eventId/join-requests/:requestId/reject
 * OR POST /api/private-events/:eventId/join-requests/user/:userId/reject
 * Headers: Authorization: Bearer <token>
 * 
 * Rejects a join request and removes from join requests list.
 * Can use either requestId (from join request response) or userId to identify the request.
 * Sends notification to the player.
 */
router.post('/:eventId/join-requests/user/:userId/reject', protect, organiserOnly, acceptRejectController.rejectJoinRequest);
router.post('/:eventId/join-requests/:requestId/reject', protect, organiserOnly, acceptRejectController.rejectJoinRequest);

/**
 * Remove a player from a private event (Organiser only)
 * DELETE /api/private-events/:eventId/players/:playerId
 * OR POST /api/private-events/:eventId/players/:playerId/remove
 * Headers: Authorization: Bearer <token>
 * 
 * Removes a player from a private event.
 * Only the event creator can remove players.
 * Sends notification to the removed player.
 */
router.delete('/:eventId/players/:playerId', protect, organiserOnly, removePlayerController.removePlayer);
router.post('/:eventId/players/:playerId/remove', protect, organiserOnly, removePlayerController.removePlayer);

module.exports = router;
