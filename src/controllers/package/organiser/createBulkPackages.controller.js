const Package = require('../../../models/Package');
const { findEventById } = require('../../../utils/eventHelper');

/**
 * @desc    Create packages in bulk (Organiser only)
 * @route   POST /api/packages/bulk
 * @access  Private (Organiser)
 */
const createBulkPackages = async (req, res, next) => {
  try {
    const organiserId = req.user.id;
    const { packages } = req.body;

    if (!Array.isArray(packages) || packages.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'packages must be a non-empty array',
      });
    }

    const created = [];

    for (let index = 0; index < packages.length; index += 1) {
      const pkg = packages[index] || {};
      const {
        packageName,
        packageDescription,
        packagePrice,
        validityMonths,
        maxEvents,
        eventIds,
        sports,
        eventType,
        credits,
        validity,
        events,
        price,
      } = pkg;

      const normalizedPackagePrice = packagePrice ?? price;
      const normalizedValidityMonths = validityMonths ?? validity;
      const normalizedMaxEvents = maxEvents ?? events;

      if (!packageName || normalizedPackagePrice === undefined || normalizedValidityMonths === undefined || normalizedMaxEvents === undefined) {
        return res.status(400).json({
          success: false,
          error: `Missing required fields in package index ${index}: packageName, packagePrice, validityMonths, maxEvents`,
        });
      }

      if (normalizedValidityMonths <= 0 || normalizedValidityMonths > 24) {
        return res.status(400).json({
          success: false,
          error: `Validity months must be between 1 and 24 (package index ${index})`,
        });
      }

      if (normalizedMaxEvents <= 0 || normalizedMaxEvents > 100) {
        return res.status(400).json({
          success: false,
          error: `Max events must be between 1 and 100 (package index ${index})`,
        });
      }

      if (normalizedPackagePrice < 0) {
        return res.status(400).json({
          success: false,
          error: `Package price cannot be negative (package index ${index})`,
        });
      }

      if (credits !== undefined && credits !== null && parseInt(credits) < 0) {
        return res.status(400).json({
          success: false,
          error: `Credits cannot be negative (package index ${index})`,
        });
      }

      const validatedEventIds = [];
      if (eventIds && Array.isArray(eventIds) && eventIds.length > 0) {
        for (const eventId of eventIds) {
          const event = await findEventById(eventId);
          if (!event) {
            return res.status(404).json({
              success: false,
              error: `Event not found: ${eventId} (package index ${index})`,
            });
          }
          if (event.creatorId.toString() !== organiserId) {
            return res.status(403).json({
              success: false,
              error: `Event ${eventId} does not belong to you (package index ${index})`,
            });
          }
          validatedEventIds.push(event._id);
        }
      }

      const packageData = {
        organiserId,
        packageName,
        packageDescription: packageDescription || null,
        sports: Array.isArray(sports) ? sports : [],
        eventType: eventType || null,
        credits: credits !== undefined && credits !== null ? parseInt(credits) : 0,
        packagePrice: parseFloat(normalizedPackagePrice),
        validityMonths: parseInt(normalizedValidityMonths),
        maxEvents: parseInt(normalizedMaxEvents),
        eventIds: validatedEventIds,
      };

      const newPackage = await Package.create(packageData);
      created.push({
        packageId: newPackage.packageId,
        packageName: newPackage.packageName,
        packageDescription: newPackage.packageDescription,
        sports: newPackage.sports || [],
        eventType: newPackage.eventType || null,
        credits: newPackage.credits || 0,
        packagePrice: newPackage.packagePrice,
        validityMonths: newPackage.validityMonths,
        maxEvents: newPackage.maxEvents,
        eventIds: validatedEventIds.map(id => id.toString()),
        isActive: newPackage.isActive,
        createdAt: newPackage.createdAt,
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Packages created successfully',
      data: {
        packages: created,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = createBulkPackages;
