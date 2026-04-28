const express = require('express');
const router = express.Router();

// Import route modules
const authRoutes = require('./auth.routes');
const followRoutes = require('./follow.routes');
const requestRoutes = require('./request.routes');
const eventRoutes = require('./event.routes');
const userRoutes = require('./user.routes');
const promoRoutes = require('./promo.routes');
const paymentRoutes = require('./payment.routes');
const sportRoutes = require('./sport.routes');
const organiserRoutes = require('./organiser.routes');
const favoriteRoutes = require('./favorite.routes');
const blockRoutes = require('./block.routes');
const eventBlockRoutes = require('./eventBlock.routes');
const notificationRoutes = require('./notification.routes');
const uploadRoutes = require('./upload.routes');
const privateEventRoutes = require('./privateEvent.routes');
const eventReminderRoutes = require('./eventReminder.routes');
const playerRoutes = require('./player.routes');
const eventInviteRoutes = require('./eventInvite.routes');
const packageRoutes = require('./package.routes');
const bookingRoutes = require('./booking.routes');
const cardRoutes = require('./card.routes');
const appConfigRoutes = require('./appConfig.routes');
// const productRoutes = require('./product.routes');

// Route definitions
router.use('/auth', authRoutes);
router.use('/follow', followRoutes);
router.use('/request', requestRoutes);
router.use('/events', eventRoutes);
router.use('/private-events', privateEventRoutes);
router.use('/event-reminders', eventReminderRoutes);
router.use('/player', playerRoutes);
router.use('/event-invites', eventInviteRoutes);
router.use('/packages', packageRoutes);
router.use('/bookings', bookingRoutes);
router.use('/cards', cardRoutes);
router.use('/app-config', appConfigRoutes);
router.use('/users', userRoutes);
router.use('/promo-codes', promoRoutes);
router.use('/payments', paymentRoutes);
router.use('/sports', sportRoutes);
router.use('/organizers', organiserRoutes);
router.use('/favorites', favoriteRoutes);
router.use('/block', blockRoutes);
router.use('/event-block', eventBlockRoutes);
router.use('/notifications', notificationRoutes);
router.use('/upload', uploadRoutes);
// router.use('/products', productRoutes);

module.exports = router;

