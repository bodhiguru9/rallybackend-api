const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  addEventReminder,
  removeEventReminder,
  getMyReminders,
  checkReminder,
} = require('../controllers/eventReminder/eventReminder.controller');

// All routes require authentication
router.use(protect);

// Add reminder for an event
router.post('/:eventId/add', addEventReminder);

// Remove reminder for an event
router.delete('/:eventId/remove', removeEventReminder);

// Check if user has reminder for an event
router.get('/:eventId/check', checkReminder);

// Get all reminders for logged-in user
router.get('/', getMyReminders);

module.exports = router;
