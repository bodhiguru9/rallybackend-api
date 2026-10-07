const express = require('express');
const router = express.Router();
const webController = require('../controllers/web/web.controller');
const optionalAuth = require('../middleware/auth').optionalAuth;

// Web preview routes with optional auth (for tracking authenticated users viewing links)
router.get('/', optionalAuth, webController.renderHome);
router.get('/event/:id', optionalAuth, webController.renderEventDetail);
router.get('/organiser/:id', optionalAuth, webController.renderOrganiserProfile);

module.exports = router;
