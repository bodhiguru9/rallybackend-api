const Package = require('../../models/Package');
const User = require('../../models/User');
const { getDB } = require('../../config/database');
const { ObjectId } = require('mongodb');

/**
 * @desc    Get package details with creator info
 * @route   GET /api/packages/:packageId/details
 * @access  Public
 */
const getPackageWithCreator = async (req, res, next) => {
  try {
    const { packageId } = req.params;

    const pkg = await Package.findById(packageId);
    if (!pkg) {
      return res.status(404).json({
        success: false,
        error: 'Package not found',
      });
    }

    const creator = await User.findById(pkg.organiserId);
    let creatorData = null;
    if (creator) {
      let totalAttendees = creator.totalAttendees || 0;
      try {
        const eventsCollection = getDB().collection('events');
        const joinsCollection = getDB().collection('eventJoins');
        const organiserId = creator._id;
        const organiserIdString = organiserId.toString();
        const events = await eventsCollection
          .find({ $or: [{ creatorId: organiserId }, { creatorId: organiserIdString }] })
          .project({ _id: 1 })
          .toArray();
        if (events.length === 0) {
          totalAttendees = 0;
        } else {
          const eventIds = events.map((event) => event._id);
          const distinctUserIds = await joinsCollection.distinct('userId', {
            eventId: { $in: eventIds },
          });
          totalAttendees = distinctUserIds.length;
        }
      } catch (error) {
        // Fallback to stored totalAttendees
      }

      creatorData = {
        userId: creator.userId,
        fullName: creator.fullName || null,
        profilePic: creator.profilePic || null,
        email: creator.email || null,
        eventsCreated: creator.eventsCreated || 0,
        totalAttendees,
      };
    }

    let purchaseInfo = null;
    let purchasedBy = null;
    if (req.user) {
      const db = getDB();
      const purchasesCollection = db.collection('packagePurchases');
      const userObjectId = new ObjectId(req.user.id);
      const packageObjectId = typeof pkg._id === 'string' ? new ObjectId(pkg._id) : pkg._id;
      const purchase = await purchasesCollection.findOne({
        userId: userObjectId,
        packageId: packageObjectId,
      });

      if (purchase) {
        const now = new Date();
        const expiryDate = new Date(purchase.expiryDate);
        const isExpired = expiryDate <= now;
        const isActive = purchase.isActive && !isExpired && purchase.eventsJoined < purchase.maxEvents;

        purchaseInfo = {
          hasPurchased: true,
          purchaseId: purchase.purchaseId || purchase._id.toString(),
          purchaseDate: purchase.purchaseDate,
          expiryDate: purchase.expiryDate,
          eventsJoined: purchase.eventsJoined,
          maxEvents: purchase.maxEvents,
          creditsAdded: purchase.creditsAdded || 0,
          isActive,
          isExpired,
          isCancelled: !!purchase.cancelledAt,
          cancelledAt: purchase.cancelledAt || null,
          canCancel: purchase.isActive && !isExpired,
        };
      } else {
        purchaseInfo = {
          hasPurchased: false,
          isActive: false,
          isExpired: false,
          isCancelled: false,
          cancelledAt: null,
          canCancel: false,
        };
      }

      if (creator && creator._id.toString() === req.user.id) {
        const usersCollection = db.collection('users');
        const purchases = await purchasesCollection.find({ packageId: packageObjectId }).toArray();
        const buyerIds = purchases.map((p) => p.userId);
        const buyers = buyerIds.length > 0
          ? await usersCollection.find({ _id: { $in: buyerIds } }).toArray()
          : [];

        purchasedBy = purchases.map((p) => {
          const buyer = buyers.find((b) => b._id.toString() === p.userId.toString());
          return {
            purchaseId: p.purchaseId || p._id.toString(),
            user: buyer ? {
              userId: buyer.userId,
              fullName: buyer.fullName || null,
              profilePic: buyer.profilePic || null,
              email: buyer.email || null,
            } : null,
            creditsAdded: p.creditsAdded || 0,
            purchaseDate: p.purchaseDate,
            isActive: p.isActive,
            cancelledAt: p.cancelledAt || null,
          };
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Package details retrieved successfully',
      data: {
        package: {
          packageId: pkg.packageId,
          packageName: pkg.packageName,
          packageDescription: pkg.packageDescription || null,
          sports: pkg.sports || [],
          eventType: pkg.eventType || null,
          credits: pkg.credits || 0,
          packagePrice: pkg.packagePrice,
          validityMonths: pkg.validityMonths,
          maxEvents: pkg.maxEvents,
          eventIds: (pkg.eventIds || []).map(id => id.toString()),
          isActive: pkg.isActive,
          createdAt: pkg.createdAt,
          updatedAt: pkg.updatedAt,
          creator: creatorData,
          purchaseInfo,
          purchasedBy,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = getPackageWithCreator;
