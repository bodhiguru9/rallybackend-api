const PackagePurchase = require('../../../models/PackagePurchase');
const Package = require('../../../models/Package');
const Event = require('../../../models/Event');

/**
 * @desc    Get package purchase details with countdown and event info
 * @route   GET /api/packages/my-packages/:purchaseId
 * @access  Private (Player)
 */
const getPackageDetails = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { purchaseId } = req.params;

    // Get purchase
    const purchase = await PackagePurchase.findById(purchaseId);
    if (!purchase) {
      return res.status(404).json({
        success: false,
        error: 'Package purchase not found',
      });
    }

    // Verify ownership
    const { ObjectId } = require('mongodb');
    const userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
    if (purchase.userId.toString() !== userObjectId.toString()) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to view this package',
      });
    }

    // Get package details
    const package = await Package.findById(purchase.packageId);

    // Calculate time remaining
    const now = new Date();
    const expiryDate = new Date(purchase.expiryDate);
    const timeRemaining = expiryDate - now;
    const daysRemaining = Math.max(0, Math.ceil(timeRemaining / (1000 * 60 * 60 * 24)));
    const hoursRemaining = Math.max(0, Math.ceil(timeRemaining / (1000 * 60 * 60)));
    const isExpired = expiryDate <= now;
    const isActive = purchase.isActive && !isExpired && purchase.eventsJoined < purchase.maxEvents;

    // Get joined events details
    const joinedEvents = await Promise.all(
      (purchase.joinedEventIds || []).map(async (eventId) => {
        const event = await Event.findById(eventId);
        return event ? {
          eventId: event.eventId,
          eventName: event.eventName,
          eventDateTime: event.eventDateTime,
          eventLocation: event.eventLocation,
        } : null;
      })
    );

    res.status(200).json({
      success: true,
      message: 'Package details retrieved successfully',
      data: {
        purchase: {
          purchaseId: purchase._id.toString(),
          package: package ? {
            packageId: package.packageId,
            packageName: package.packageName,
            packageDescription: package.packageDescription,
          } : null,
          purchaseDate: purchase.purchaseDate,
          expiryDate: purchase.expiryDate,
          validityMonths: package ? package.validityMonths : 0,
          timeRemaining: {
            milliseconds: Math.max(0, timeRemaining),
            days: daysRemaining,
            hours: hoursRemaining,
            daysRemaining,
            isExpired,
            expiresAt: purchase.expiryDate,
            expiresAtFormatted: purchase.expiryDate.toISOString(),
          },
          events: {
            joined: purchase.eventsJoined,
            max: purchase.maxEvents,
            remaining: Math.max(0, purchase.maxEvents - purchase.eventsJoined),
            joinedEvents: joinedEvents.filter(e => e !== null),
          },
          creditsAdded: purchase.creditsAdded || 0,
          isActive,
          isExpired,
          cancelledAt: purchase.cancelledAt || null,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = getPackageDetails;
