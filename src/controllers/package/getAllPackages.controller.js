const Package = require('../../models/Package');
const { getPaginationParams, createPaginationResponse } = require('../../utils/pagination');

/**
 * @desc    Get all active packages (public)
 * @route   GET /api/packages
 * @access  Public
 */
const getAllPackages = async (req, res, next) => {
  try {
    const { page, limit } = getPaginationParams(req);

    const packages = await Package.findActive(limit, (page - 1) * limit);

    // Get total count
    const { getDB } = require('../../config/database');
    const db = getDB();
    const packagesCollection = db.collection('packages');
    const totalCount = await packagesCollection.countDocuments({ isActive: true });

    const pagination = createPaginationResponse(page, limit, totalCount);

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
          packagePrice: pkg.packagePrice,
          validityMonths: pkg.validityMonths,
          maxEvents: pkg.maxEvents,
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
        })),
        pagination,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = getAllPackages;
