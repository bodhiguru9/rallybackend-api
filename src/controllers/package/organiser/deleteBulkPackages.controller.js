const Package = require('../../../models/Package');

/**
 * @desc    Delete packages in bulk (Organiser only)
 * @route   DELETE /api/packages/bulk
 * @access  Private (Organiser)
 */
const deleteBulkPackages = async (req, res, next) => {
  try {
    const organiserId = req.user.id;
    const { packageIds } = req.body;

    if (!Array.isArray(packageIds) || packageIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'packageIds must be a non-empty array',
      });
    }

    const deleted = [];

    for (let index = 0; index < packageIds.length; index += 1) {
      const packageId = packageIds[index];
      const pkg = await Package.findById(packageId);
      if (!pkg) {
        return res.status(404).json({
          success: false,
          error: `Package not found: ${packageId}`,
        });
      }
      if (pkg.organiserId.toString() !== organiserId) {
        return res.status(403).json({
          success: false,
          error: `Package ${packageId} does not belong to you`,
        });
      }

      const deletedOk = await Package.deleteById(packageId);
      if (!deletedOk) {
        return res.status(500).json({
          success: false,
          error: `Failed to delete package: ${packageId}`,
        });
      }
      deleted.push(packageId);
    }

    return res.status(200).json({
      success: true,
      message: 'Packages deleted successfully',
      data: {
        deleted,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = deleteBulkPackages;
