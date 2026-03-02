const Package = require('../../../models/Package');
const PackagePurchase = require('../../../models/PackagePurchase');
const Payment = require('../../../models/Payment');

/**
 * @desc    Purchase a package (Player only)
 * @route   POST /api/packages/:packageId/purchase
 * @access  Private (Player)
 */
const purchasePackage = async (req, res, next) => {
  try {
    // Check if user is a player
    if (req.user.userType !== 'player') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Only players can purchase packages.',
        userType: req.user.userType,
        requiredType: 'player',
      });
    }

    const userId = req.user.id;
    const { packageId } = req.params;

    // Verify package exists
    const package = await Package.findById(packageId);
    if (!package) {
      return res.status(404).json({
        success: false,
        error: 'Package not found',
      });
    }

    if (!package.isActive) {
      return res.status(400).json({
        success: false,
        error: 'Package is not active',
      });
    }

    // Check if user already has an active purchase of this package
    const existingPurchases = await PackagePurchase.findActiveByUser(userId);
    const hasActivePurchase = existingPurchases.some(
      p => p.packageId.toString() === package._id.toString() && 
           new Date(p.expiryDate) > new Date() &&
           p.eventsJoined < p.maxEvents
    );

    if (hasActivePurchase) {
      return res.status(400).json({
        success: false,
        error: 'You already have an active purchase of this package',
      });
    }

    // Create purchase record
    // Note: In a real application, you would process payment here
    // For now, we'll create the purchase directly
    const creditsToAdd = package.credits ? parseInt(package.credits) : 0;
    const purchaseData = {
      userId,
      packageId: package._id,
      organiserId: package.organiserId,
      validityMonths: package.validityMonths,
      maxEvents: package.maxEvents,
      creditsAdded: creditsToAdd,
    };

    const purchase = await PackagePurchase.create(purchaseData);

    if (creditsToAdd > 0) {
      const { getDB } = require('../../../config/database');
      const { ObjectId } = require('mongodb');
      const db = getDB();
      const usersCollection = db.collection('users');
      const userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
      await usersCollection.updateOne(
        { _id: userObjectId },
        { $inc: { creditsBalance: creditsToAdd } }
      );
    }

    // Create payment record (optional - if you want to track payments)
    // await Payment.create({
    //   userId,
    //   eventId: null,
    //   amount: package.packagePrice,
    //   finalAmount: package.packagePrice,
    //   status: 'success',
    //   metadata: { packageId: package.packageId, purchaseId: purchase._id },
    // });

    res.status(201).json({
      success: true,
      message: 'Package purchased successfully',
      data: {
        purchase: {
          purchaseId: purchase._id.toString(),
          packageId: package.packageId,
          packageName: package.packageName,
          purchaseDate: purchase.purchaseDate,
          expiryDate: purchase.expiryDate,
          maxEvents: purchase.maxEvents,
          eventsJoined: purchase.eventsJoined,
          eventsRemaining: purchase.maxEvents - purchase.eventsJoined,
          creditsAdded: creditsToAdd,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = purchasePackage;
