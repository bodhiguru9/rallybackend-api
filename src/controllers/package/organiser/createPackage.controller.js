const Package = require('../../../models/Package');
const Event = require('../../../models/Event');
const { findEventById } = require('../../../utils/eventHelper');

/**
 * @desc    Create a new package (Organiser only)
 * @route   POST /api/packages
 * @access  Private (Organiser)
 */
const createPackage = async (req, res, next) => {
  try {
    const organiserId = req.user.id;
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
    } = req.body;

    const normalizedPackagePrice = packagePrice ?? price;
    const normalizedValidityMonths = validityMonths ?? validity;
    const normalizedMaxEvents = maxEvents ?? events;

    // Validation
    if (!packageName || normalizedPackagePrice === undefined || normalizedValidityMonths === undefined || normalizedMaxEvents === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: packageName, packagePrice, validityMonths, maxEvents',
      });
    }

    if (normalizedValidityMonths <= 0 || normalizedValidityMonths > 24) {
      return res.status(400).json({
        success: false,
        error: 'Validity months must be between 1 and 24',
      });
    }

    if (normalizedMaxEvents <= 0 || normalizedMaxEvents > 100) {
      return res.status(400).json({
        success: false,
        error: 'Max events must be between 1 and 100',
      });
    }

    if (normalizedPackagePrice < 0) {
      return res.status(400).json({
        success: false,
        error: 'Package price cannot be negative',
      });
    }

    if (credits !== undefined && credits !== null && parseInt(credits) < 0) {
      return res.status(400).json({
        success: false,
        error: 'Credits cannot be negative',
      });
    }

    // Validate event IDs if provided
    const validatedEventIds = [];
    if (eventIds && Array.isArray(eventIds) && eventIds.length > 0) {
      for (const eventId of eventIds) {
        const event = await findEventById(eventId);
        if (!event) {
          return res.status(404).json({
            success: false,
            error: `Event not found: ${eventId}`,
          });
        }
        // Verify event belongs to this organiser
        if (event.creatorId.toString() !== organiserId) {
          return res.status(403).json({
            success: false,
            error: `Event ${eventId} does not belong to you`,
          });
        }
        validatedEventIds.push(event._id);
      }
    }

    // Create package
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

    res.status(201).json({
      success: true,
      message: 'Package created successfully',
      data: {
        package: {
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
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = createPackage;
