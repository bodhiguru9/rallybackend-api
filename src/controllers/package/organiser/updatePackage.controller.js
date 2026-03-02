const Package = require('../../../models/Package');

/**
 * @desc    Update a package (Organiser only)
 * @route   PUT /api/packages/:packageId
 * @access  Private (Organiser only)
 */
const updatePackage = async (req, res, next) => {
  try {
    const { packageId } = req.params;
    const organiserId = req.user.id;

    const existingPackage = await Package.findById(packageId);
    if (!existingPackage) {
      return res.status(404).json({
        success: false,
        error: 'Package not found',
      });
    }

    if (existingPackage.organiserId.toString() !== organiserId.toString()) {
      return res.status(403).json({
        success: false,
        error: 'You can only update your own packages',
      });
    }

    const allowedFields = [
      'packageName',
      'packageDescription',
      'sports',
      'eventType',
      'credits',
      'packagePrice',
      'validityMonths',
      'maxEvents',
      'eventIds',
      'isActive',
    ];

    const updateData = {};
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields provided for update',
      });
    }

    await Package.updateById(packageId, updateData);
    const updatedPackage = await Package.findById(packageId);

    return res.status(200).json({
      success: true,
      message: 'Package updated successfully',
      data: {
        package: updatedPackage,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = updatePackage;
