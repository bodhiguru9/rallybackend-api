const Package = require('../../../models/Package');
const User = require('../../../models/User');
const { getPaginationParams, createPaginationResponse } = require('../../../utils/pagination');
const { getDB } = require('../../../config/database');
const { ObjectId } = require('mongodb');

/**
 * @desc    Get all packages created by organiser
 * @route   GET /api/packages/organiser/my-packages
 * @access  Private (Organiser)
 */
const getMyPackages = async (req, res, next) => {
  try {
    const organiserIdParam = req.query.organiserId;
    let organiserMongoId = req.user?.id;

    if (!organiserIdParam && !organiserMongoId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required if organiserId is not provided',
      });
    }

    if (organiserIdParam) {
      let organiser = null;
      if (!isNaN(organiserIdParam) && parseInt(organiserIdParam).toString() === organiserIdParam) {
        organiser = await User.findByUserId(organiserIdParam);
      } else {
        organiser = await User.findById(organiserIdParam);
      }

      if (!organiser) {
        return res.status(404).json({
          success: false,
          error: 'Organiser not found',
          suggestion: 'Please provide a valid organiser userId or MongoDB ObjectId',
        });
      }

      if (organiser.userType !== 'organiser') {
        return res.status(400).json({
          success: false,
          error: 'User is not an organiser',
        });
      }

      organiserMongoId = organiser._id;
    }
    const { page, perPage, skip } = getPaginationParams(req.query.page, req.query.perPage || 20);

    const packages = await Package.findByOrganiser(organiserMongoId, perPage, skip);

    // Get total count
    const db = getDB();
    const packagesCollection = db.collection('packages');
    const purchasesCollection = db.collection('packagePurchases');
    const usersCollection = db.collection('users');
    const organiserObjectId = typeof organiserMongoId === 'string' ? new ObjectId(organiserMongoId) : organiserMongoId;
    const totalCount = await packagesCollection.countDocuments({ organiserId: organiserObjectId });

    const pagination = createPaginationResponse(totalCount, page, perPage);

    const packageIds = packages.map((pkg) => pkg._id);
    const purchases = packageIds.length > 0
      ? await purchasesCollection.find({ packageId: { $in: packageIds } }).toArray()
      : [];

    const buyerIds = Array.from(new Set(purchases.map((purchase) => purchase.userId?.toString()).filter(Boolean)))
      .map((id) => new ObjectId(id));
    const buyers = buyerIds.length > 0
      ? await usersCollection.find({ _id: { $in: buyerIds } }).toArray()
      : [];
    const buyerMap = new Map();
    buyers.forEach((buyer) => {
      buyerMap.set(buyer._id.toString(), {
        userId: buyer.userId,
        fullName: buyer.fullName || null,
        profilePic: buyer.profilePic || null,
      });
    });

    const purchasesByPackage = new Map();
    purchases.forEach((purchase) => {
      const key = purchase.packageId.toString();
      if (!purchasesByPackage.has(key)) {
        purchasesByPackage.set(key, []);
      }
      purchasesByPackage.get(key).push(purchase);
    });

    res.status(200).json({
      success: true,
      message: 'Packages retrieved successfully',
      data: {
        packages: packages.map(pkg => ({
          packageId: pkg.packageId,
          packageName: pkg.packageName,
          packageDescription: pkg.packageDescription,
          sports: pkg.sports || [],
          eventType: pkg.eventType || null,
          credits: pkg.credits || 0,
          packagePrice: pkg.packagePrice,
          validityMonths: pkg.validityMonths,
          maxEvents: pkg.maxEvents,
          eventIds: pkg.eventIds.map(id => id.toString()),
          isActive: pkg.isActive,
          createdAt: pkg.createdAt,
          updatedAt: pkg.updatedAt,
          joinedUsersCount: (purchasesByPackage.get(pkg._id.toString()) || []).length,
          joinedUsers: (purchasesByPackage.get(pkg._id.toString()) || []).map((purchase) => ({
            user: buyerMap.get(purchase.userId.toString()) || null,
            purchaseDate: purchase.purchaseDate || null,
            expiryDate: purchase.expiryDate || null,
            eventsJoined: purchase.eventsJoined || 0,
            maxEvents: purchase.maxEvents || 0,
            isActive: purchase.isActive !== undefined ? purchase.isActive : true,
          })),
        })),
        pagination,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = getMyPackages;
