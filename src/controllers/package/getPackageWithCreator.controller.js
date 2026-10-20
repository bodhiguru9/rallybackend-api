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
        communityName: creator.communityName || null,
        profilePic: creator.profilePic || null,
        email: creator.email || null,
        eventsCreated: creator.eventsCreated || 0,
        totalAttendees,
        instagramLink: creator.instagramLink || creator.instagram_link || null,
        mobileNumber: creator.mobileNumber || creator.whatsappNumber || null,
        whatsappNumber: creator.whatsappNumber || creator.mobileNumber || null,
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
    }

    // Always fetch package purchases so both organiser and players see accurate spot counts & members
    const db = getDB();
    const purchasesCollection = db.collection('packagePurchases');
    const packageObjectId = typeof pkg._id === 'string' ? new ObjectId(pkg._id) : pkg._id;
    const purchases = await purchasesCollection.find({ packageId: packageObjectId }).toArray();

    const isCreator = req.user && creator && creator._id.toString() === req.user.id;
    const usersCollection = db.collection('users');
    const buyerIds = purchases.map((p) => p.userId).filter(Boolean);
    const buyers = buyerIds.length > 0
      ? await usersCollection.find({ _id: { $in: buyerIds } }).toArray()
      : [];

    purchasedBy = purchases.map((p) => {
      const buyer = buyers.find((b) => b._id.toString() === p.userId?.toString());
      return {
        purchaseId: p.purchaseId || p._id.toString(),
        user: buyer ? {
          userId: buyer.userId,
          fullName: buyer.fullName || 'Player',
          profilePic: buyer.profilePic || null,
          email: isCreator ? (buyer.email || null) : null,
          mobileNumber: isCreator ? (buyer.mobileNumber || buyer.phone || null) : null,
          gender: buyer.gender || null,
        } : null,
        purchaseDate: p.purchaseDate,
        expiryDate: p.expiryDate || null,
        eventsJoined: p.eventsJoined || 0,
        maxEvents: p.maxEvents || 0,
        isActive: p.isActive !== undefined ? p.isActive : true,
        cancelledAt: p.cancelledAt || null,
      };
    });

    const joinedUsersCount = purchases.length;
    const maxPurchases = pkg.maxPurchases !== undefined && pkg.maxPurchases !== null
      ? pkg.maxPurchases
      : pkg.maxEvents;

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
          packagePrice: pkg.packagePrice,
          validityMonths: pkg.validityMonths,
          maxEvents: pkg.maxEvents,
          maxPurchases,
          eventIds: (pkg.eventIds || []).map(id => id.toString()),
          validityPeriod: pkg.validityPeriod || null,
          location: pkg.location || null,
          eventLocation: pkg.eventLocation || null,
          restrictions: pkg.restrictions || null,
          imageUri: pkg.imageUri || null,
          packageImages: pkg.packageImages || [],
          registrationStartTime: pkg.registrationStartTime || null,
          faqs: pkg.faqs || [],
          isActive: pkg.isActive,
          createdAt: pkg.createdAt,
          updatedAt: pkg.updatedAt,
          creator: creatorData,
          purchaseInfo,
          purchasedBy,
          joinedUsers: purchasedBy,
          joinedUsersCount,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = getPackageWithCreator;
