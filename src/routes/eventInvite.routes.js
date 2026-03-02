const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const sendInviteController = require('../controllers/eventInvite/sendInvite.controller');
const getInvitesController = require('../controllers/eventInvite/getInvites.controller');
const acceptDeclineController = require('../controllers/eventInvite/acceptDeclineInvite.controller');
const deleteInviteController = require('../controllers/eventInvite/deleteInvite.controller');

// All routes require authentication
router.use(protect);

// Organiser routes - Send invitations
// Preferred (playerId in params)
router.post('/:eventId/send/:playerId', sendInviteController.sendInvite);
// Backward compatibility (playerId in body)
router.post('/:eventId/send', sendInviteController.sendInvite);
router.post('/:eventId/send-bulk', sendInviteController.sendBulkInvites);
router.post('/:eventId/send-to-followers', sendInviteController.sendToFollowers);

// Player routes - Get invitations
router.get('/player', getInvitesController.getPlayerInvites);

// Single route - Get my invitations (player inbox OR organiser sent list)
router.get('/my', getInvitesController.getMyInvites);

// Organiser routes - Get sent invitations
router.get('/organiser', getInvitesController.getOrganiserInvites);

// Player routes - Accept/Decline invitations
router.post('/:inviteId/accept', acceptDeclineController.acceptInvite);
router.post('/:inviteId/decline', acceptDeclineController.declineInvite);

// Organiser routes - Cancel invitation
router.post('/:inviteId/cancel', acceptDeclineController.cancelInvite);

// Delete invitation (player inbox cleanup or organiser cleanup)
router.delete('/:inviteId', deleteInviteController.deleteInvite);

module.exports = router;
