const PackagePurchase = require('../../../models/PackagePurchase');

/**
 * @desc    Cancel a package purchase (Player only)
 * @route   POST /api/packages/my-packages/:purchaseId/cancel
 * @access  Private (Player)
 */
const cancelPackagePurchase = async (req, res, next) => {
  try {
    if (req.user.userType !== 'player') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Only players can cancel packages.',
      });
    }

    const userId = req.user.id;
    const { purchaseId } = req.params;

    const purchase = await PackagePurchase.findById(purchaseId);
    if (!purchase) {
      return res.status(404).json({
        success: false,
        error: 'Package purchase not found',
      });
    }

    if (purchase.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to cancel this package',
      });
    }

    const now = new Date();
    const expiryDate = new Date(purchase.expiryDate);
    if (!purchase.isActive || expiryDate <= now) {
      return res.status(400).json({
        success: false,
        error: 'Package is already inactive or expired',
      });
    }

    const updated = await PackagePurchase.updateById(purchaseId, {
      isActive: false,
      cancelledAt: now,
    });

    if (!updated) {
      return res.status(500).json({
        success: false,
        error: 'Failed to cancel package',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Package cancelled successfully',
      data: {
        purchaseId,
        cancelledAt: now,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = cancelPackagePurchase;
