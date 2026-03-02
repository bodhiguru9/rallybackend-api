const PackagePurchase = require('../../../models/PackagePurchase');
const Package = require('../../../models/Package');
const User = require('../../../models/User');
const Event = require('../../../models/Event');
const { findEventById } = require('../../../utils/eventHelper');
const { getPaginationParams, createPaginationResponse } = require('../../../utils/pagination');

/**
 * @desc    Get users who purchased a package and their event attendance
 * @route   GET /api/packages/:packageId/attendees
 * @access  Private (Organiser)
 */
const getPackageAttendees = async (req, res, next) => {
  try {
    const organiserId = req.user.id;
    const { packageId } = req.params;
    const { page, limit } = getPaginationParams(req);

    // Verify package exists and belongs to organiser
    const package = await Package.findById(packageId);
    if (!package) {
      return res.status(404).json({
        success: false,
        error: 'Package not found',
      });
    }

    const { ObjectId } = require('mongodb');
    const organiserObjectId = typeof organiserId === 'string' ? new ObjectId(organiserId) : organiserId;
    if (package.organiserId.toString() !== organiserObjectId.toString()) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to view this package',
      });
    }

    // Get all purchases for this package
    const purchases = await PackagePurchase.findByPackage(package._id, limit, (page - 1) * limit);

    // Get total count
    const { getDB } = require('../../../config/database');
    const db = getDB();
    const purchasesCollection = db.collection('packagePurchases');
    const totalCount = await purchasesCollection.countDocuments({ packageId: package._id });

    const pagination = createPaginationResponse(page, limit, totalCount);

    // Enrich with user and event details
    const attendees = await Promise.all(
      purchases.map(async (purchase) => {
        const user = await User.findById(purchase.userId);
        const events = await Promise.all(
          (purchase.joinedEventIds || []).map(async (eventId) => {
            const event = await Event.findById(eventId);
            return event ? {
              eventId: event.eventId,
              eventName: event.eventName,
              eventDateTime: event.eventDateTime,
            } : null;
          })
        );

        return {
          purchaseId: purchase._id.toString(),
          user: user ? {
            userId: user.userId,
            fullName: user.fullName,
            email: user.email,
            profilePic: user.profilePic,
          } : null,
          purchaseDate: purchase.purchaseDate,
          expiryDate: purchase.expiryDate,
          eventsJoined: purchase.eventsJoined,
          maxEvents: purchase.maxEvents,
          eventsRemaining: purchase.maxEvents - purchase.eventsJoined,
          isActive: purchase.isActive && purchase.expiryDate > new Date(),
          joinedEvents: events.filter(e => e !== null),
        };
      })
    );

    res.status(200).json({
      success: true,
      message: 'Package attendees retrieved successfully',
      data: {
        package: {
          packageId: package.packageId,
          packageName: package.packageName,
        },
        attendees,
        pagination,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get users who attended a specific event (from packages)
 * @route   GET /api/packages/events/:eventId/attendees
 * @access  Private (Organiser)
 */
const getEventAttendees = async (req, res, next) => {
  try {
    const organiserId = req.user.id;
    const { eventId } = req.params;
    const { page, limit } = getPaginationParams(req);

    // Verify event exists and belongs to organiser
    const event = await findEventById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found',
      });
    }

    const { ObjectId } = require('mongodb');
    const organiserObjectId = typeof organiserId === 'string' ? new ObjectId(organiserId) : organiserId;
    if (event.creatorId.toString() !== organiserObjectId.toString()) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to view this event',
      });
    }

    // Get all purchases that include this event
    const purchases = await PackagePurchase.getUsersByEvent(event._id);

    // Get total count
    const totalCount = purchases.length;

    // Paginate
    const paginatedPurchases = purchases.slice((page - 1) * limit, page * limit);

    const pagination = createPaginationResponse(page, limit, totalCount);

    // Enrich with user details
    const attendees = await Promise.all(
      paginatedPurchases.map(async (purchase) => {
        const user = await User.findById(purchase.userId);
        const package = await Package.findById(purchase.packageId);

        return {
          purchaseId: purchase._id.toString(),
          user: user ? {
            userId: user.userId,
            fullName: user.fullName,
            email: user.email,
            profilePic: user.profilePic,
          } : null,
          package: package ? {
            packageId: package.packageId,
            packageName: package.packageName,
          } : null,
          purchaseDate: purchase.purchaseDate,
          expiryDate: purchase.expiryDate,
          eventsJoined: purchase.eventsJoined,
          maxEvents: purchase.maxEvents,
        };
      })
    );

    res.status(200).json({
      success: true,
      message: 'Event attendees retrieved successfully',
      data: {
        event: {
          eventId: event.eventId,
          eventName: event.eventName,
        },
        attendees,
        pagination,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPackageAttendees,
  getEventAttendees,
};
