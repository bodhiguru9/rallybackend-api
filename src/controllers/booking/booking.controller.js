const bookEvent = require('./bookEvent.controller');
const getBookingDetails = require('./getBookingDetails.controller');
const getPendingBookings = require('./getPendingBookings.controller');
const getBookedBookings = require('./getBookedBookings.controller');
const getAllBookings = require('./getAllBookings.controller');
const cancelBooking = require('./cancelBooking.controller');

module.exports = {
  bookEvent,
  getBookingDetails,
  getPendingBookings,
  getBookedBookings,
  getAllBookings,
  cancelBooking,
};
