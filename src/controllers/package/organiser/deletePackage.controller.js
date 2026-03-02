const Package = require('../../../models/Package');

/**
 * @desc    Delete a package (Organiser only)
 * @route   DELETE /api/packages/:packageId
 * @access  Private (Organiser)
 */
const deletePackage = async (req, res, next) => {
  try {
    const organiserId = req.user.id;
    const { packageId } = req.params;

    const pkg = await Package.findById(packageId);
    if (!pkg) {
      return res.status(404).json({
        success: false,
        error: 'Package not found',
      });
    }

    if (pkg.organiserId.toString() !== organiserId) {
      return res.status(403).json({
        success: false,
        error: 'You can only delete your own packages',
      });
    }

    const deletedOk = await Package.deleteById(packageId);
    if (!deletedOk) {
      return res.status(500).json({
        success: false,
        error: 'Failed to delete package',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Package deleted successfully',
      data: {
        packageId,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = deletePackage;
