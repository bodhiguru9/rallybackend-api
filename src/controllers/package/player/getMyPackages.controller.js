const PackagePurchase = require('../../../models/PackagePurchase');
const Package = require('../../../models/Package');
const User = require('../../../models/User');
const { getPaginationParams, createPaginationResponse } = require('../../../utils/pagination');

/**
 * @desc    Get all packages purchased by player
 * @route   GET /api/packages/my-packages
 * @access  Private (Player)
 */
const getMyPackages = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { page, limit } = getPaginationParams(req);

    const { getDB } = require('../../../config/database');
    const db = getDB();
    const purchasesCollection = db.collection('packagePurchases');
    const { ObjectId } = require('mongodb');
    const userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;

    const purchases = await PackagePurchase.findByUser(userId, limit, (page - 1) * limit);

    // Enrich with package details and calculate days remaining
    const enrichedList = await Promise.all(
      purchases.map(async (purchase) => {
        const package = await Package.findById(purchase.packageId);
        if (!package) {
          // If the package was deleted, remove the orphaned purchase so it is completely removed
          purchasesCollection.deleteOne({ _id: purchase._id }).catch(() => {});
          return null;
        }

        let creator = null;
        if (package && package.organiserId) {
          try {
            creator = await User.findById(package.organiserId);
          } catch (e) {
            // Ignore creator lookup failure
          }
        }

        const now = new Date();
        const expiryDate = new Date(purchase.expiryDate);
        const daysRemaining = Math.max(0, Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24)));
        const isExpired = expiryDate <= now;
        const maxEventsLimit = purchase.maxEvents || (package ? package.maxEvents : 0) || 0;
        const isActive = purchase.isActive && !isExpired && (maxEventsLimit > 0 ? (purchase.eventsJoined || 0) < maxEventsLimit : true);
        const validityMonths = purchase.validityMonths || (package ? package.validityMonths : 0) || (purchase.purchaseDate && expiryDate ? Math.max(1, Math.round((expiryDate - new Date(purchase.purchaseDate)) / (1000 * 60 * 60 * 24 * 30))) : 1);

        return {
          purchaseId: purchase._id.toString(),
          package: {
            packageId: package.packageId,
            packageName: package.packageName,
            packageDescription: package.packageDescription,
            packagePrice: package.packagePrice,
            sports: package.sports || [],
            eventType: package.eventType || null,
            location: package.location || package.eventLocation || null,
            imageUri: package.imageUri || (package.packageImages?.[0] || null),
            packageImages: package.packageImages || (package.imageUri ? [package.imageUri] : []),
            validityMonths: package.validityMonths,
            maxEvents: package.maxEvents,
            organiserId: package.organiserId ? package.organiserId.toString() : null,
            creator: creator ? {
              userId: creator.userId,
              fullName: creator.fullName || null,
              communityName: creator.communityName || null,
              profilePic: creator.profilePic || null,
            } : null,
          },
          purchaseDate: purchase.purchaseDate,
          expiryDate: purchase.expiryDate,
          daysRemaining,
          validityMonths,
          eventsJoined: purchase.eventsJoined || 0,
          maxEvents: maxEventsLimit,
          eventsRemaining: Math.max(0, maxEventsLimit - (purchase.eventsJoined || 0)),
          isActive,
          isExpired,
        };
      })
    );

    const packages = enrichedList.filter(Boolean);

    // Get total count
    const totalCount = await purchasesCollection.countDocuments({ userId: userObjectId });
    const pagination = createPaginationResponse(page, limit, totalCount);

    res.status(200).json({
      success: true,
      message: 'My packages retrieved successfully',
      data: {
        packages,
        pagination,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = getMyPackages;
