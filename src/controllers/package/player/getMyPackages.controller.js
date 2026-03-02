const PackagePurchase = require('../../../models/PackagePurchase');
const Package = require('../../../models/Package');
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

    const purchases = await PackagePurchase.findByUser(userId, limit, (page - 1) * limit);

    // Get total count
    const { getDB } = require('../../../config/database');
    const db = getDB();
    const purchasesCollection = db.collection('packagePurchases');
    const { ObjectId } = require('mongodb');
    const userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
    const totalCount = await purchasesCollection.countDocuments({ userId: userObjectId });

    const pagination = createPaginationResponse(page, limit, totalCount);

    // Enrich with package details and calculate days remaining
    const packages = await Promise.all(
      purchases.map(async (purchase) => {
        const package = await Package.findById(purchase.packageId);
        const now = new Date();
        const expiryDate = new Date(purchase.expiryDate);
        const daysRemaining = Math.max(0, Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24)));
        const isExpired = expiryDate <= now;
        const isActive = purchase.isActive && !isExpired && purchase.eventsJoined < purchase.maxEvents;

        return {
          purchaseId: purchase._id.toString(),
          package: package ? {
            packageId: package.packageId,
            packageName: package.packageName,
            packageDescription: package.packageDescription,
            packagePrice: package.packagePrice,
          } : null,
          purchaseDate: purchase.purchaseDate,
          expiryDate: purchase.expiryDate,
          daysRemaining,
          validityMonths: purchase.maxEvents ? Math.ceil((expiryDate - purchase.purchaseDate) / (1000 * 60 * 60 * 24 * 30)) : 0,
          eventsJoined: purchase.eventsJoined,
          maxEvents: purchase.maxEvents,
          eventsRemaining: Math.max(0, purchase.maxEvents - purchase.eventsJoined),
          isActive,
          isExpired,
        };
      })
    );

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
