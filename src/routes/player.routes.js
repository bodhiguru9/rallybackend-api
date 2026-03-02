const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const playerEventsController = require('../controllers/player/playerEvents.controller');
const playerBookingsController = require('../controllers/player/playerBookings.controller');

// All routes require authentication
router.use(protect);

// Get all player events (joined, waitlist, reminders)
router.get('/events', playerEventsController.getPlayerEvents);

// Get player bookings (joined events) - upcoming/past
router.get('/bookings', playerBookingsController.getPlayerBookings);

module.exports = router;
