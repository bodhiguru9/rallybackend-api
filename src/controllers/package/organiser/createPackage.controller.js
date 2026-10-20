const Package = require('../../../models/Package');
const Event = require('../../../models/Event');
const { findEventById } = require('../../../utils/eventHelper');
const { notifySubscribersOnPackageCreation } = require('../../../services/packageNotification.service');

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
      packagePrice: parseFloat(normalizedPackagePrice),
      validityMonths: parseInt(normalizedValidityMonths),
      maxEvents: parseInt(normalizedMaxEvents),
      maxPurchases: req.body.maxPurchases !== undefined && req.body.maxPurchases !== null
        ? parseInt(req.body.maxPurchases)
        : parseInt(normalizedMaxEvents),
      eventIds: validatedEventIds,
      validityPeriod: req.body.validityPeriod || null,
      location: req.body.location || null,
      eventLocation: req.body.eventLocation || null,
      restrictions: req.body.restrictions || null,
      imageUri: req.body.imageUri || null,
      packageImages: req.body.packageImages || (req.body.imageUri ? [req.body.imageUri] : []),
      registrationStartTime: req.body.registrationStartTime || null,
      faqs: req.body.faqs || [],
    };

    const newPackage = await Package.create(packageData);

    // Notify organiser's subscribers (asynchronous, non-blocking)
    notifySubscribersOnPackageCreation({
      organiserId,
      package: newPackage,
      organiser: req.user,
    }).catch((err) => {
      console.error('[PACKAGE-NOTIF] Background dispatch error:', err.message);
    });

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
          packagePrice: newPackage.packagePrice,
          validityMonths: newPackage.validityMonths,
          maxEvents: newPackage.maxEvents,
          maxPurchases: newPackage.maxPurchases ?? newPackage.maxEvents,
          eventIds: validatedEventIds.map(id => id.toString()),
          validityPeriod: newPackage.validityPeriod,
          location: newPackage.location,
          eventLocation: newPackage.eventLocation,
          restrictions: newPackage.restrictions,
          imageUri: newPackage.imageUri,
          packageImages: newPackage.packageImages,
          registrationStartTime: newPackage.registrationStartTime,
          faqs: newPackage.faqs,
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
