const PackagePurchase = require('../../../models/PackagePurchase');
const EventJoin = require('../../../models/EventJoin');
const { formatEventResponse } = require('../../../utils/eventFields');
const { getPaginationParams, createPaginationResponse } = require('../../../utils/pagination');
const { getDB } = require('../../../config/database');
const { ObjectId } = require('mongodb');

/**
 * @desc    Get all package purchases for organiser
 * @route   GET /api/packages/organiser/purchases?page=1&perPage=20
 * @access  Private (Organiser)
 */
const getPackagePurchases = async (req, res, next) => {
  try {
    const organiserId = req.user.id;

    if (req.user.userType !== 'organiser') {
      return res.status(403).json({
        success: false,
        error: 'Only organisers can view package purchases',
      });
    }

    const { page, perPage, skip } = getPaginationParams(req.query.page, req.query.perPage || 20);

    const purchases = await PackagePurchase.findByOrganiser(organiserId, perPage, skip);

    const db = getDB();
    const purchasesCollection = db.collection('packagePurchases');
    const eventsCollection = db.collection('events');
    const organiserObjectId = typeof organiserId === 'string' ? new ObjectId(organiserId) : organiserId;
    const totalCount = await purchasesCollection.countDocuments({ organiserId: organiserObjectId });

    const packageIds = purchases.map((purchase) => purchase.packageId);
    const userIds = purchases.map((purchase) => purchase.userId);

    const packagesCollection = db.collection('packages');
    const packages = packageIds.length > 0
      ? await packagesCollection.find({ _id: { $in: packageIds } }).toArray()
      : [];
    const packageMap = new Map();
    packages.forEach((pkg) => {
      packageMap.set(pkg._id.toString(), {
        packageId: pkg.packageId,
        packageName: pkg.packageName,
        packageDescription: pkg.packageDescription || null,
        packagePrice: pkg.packagePrice,
        maxEvents: pkg.maxEvents,
        validityMonths: pkg.validityMonths,
      });
    });

    const usersCollection = db.collection('users');
    const users = userIds.length > 0
      ? await usersCollection.find({ _id: { $in: userIds } }).toArray()
      : [];
    const userMap = new Map();
    users.forEach((user) => {
      userMap.set(user._id.toString(), {
        userId: user.userId,
        fullName: user.fullName || null,
        profilePic: user.profilePic || null,
      });
    });

    const organiserEvents = await eventsCollection
      .find({ $or: [{ creatorId: organiserObjectId }, { creatorId: organiserObjectId.toString() }] })
      .toArray();
    const organiserEventIds = new Set(organiserEvents.map((event) => event._id.toString()));

    const joinsCollection = db.collection('eventJoins');
    const joins = userIds.length > 0
      ? await joinsCollection.find({
        userId: { $in: userIds },
        eventId: { $in: organiserEvents.map((event) => event._id) },
      }).toArray()
      : [];
    const joinsByUser = new Map();
    joins.forEach((join) => {
      const key = join.userId.toString();
      if (!joinsByUser.has(key)) {
        joinsByUser.set(key, []);
      }
      joinsByUser.get(key).push(join.eventId.toString());
    });

    const joinedEventIds = Array.from(new Set(joins.map((join) => join.eventId.toString())));
    const joinedEvents = joinedEventIds.length > 0
      ? await eventsCollection.find({ _id: { $in: joinedEventIds.map((id) => new ObjectId(id)) } }).toArray()
      : [];

    const joinedEventDetailsMap = new Map();
    await Promise.all(
      joinedEvents.map(async (event) => {
        const participants = await EventJoin.getEventParticipants(event._id, null, 1000, 0);
        joinedEventDetailsMap.set(event._id.toString(), {
          ...formatEventResponse(event),
          participants,
          participantsCount: participants.length,
        });
      })
    );

    const purchasesList = purchases.map((purchase) => {
      const pkg = packageMap.get(purchase.packageId.toString()) || null;
      const user = userMap.get(purchase.userId.toString()) || null;
      const now = new Date();
      const expiryDate = new Date(purchase.expiryDate);
      const isExpired = expiryDate <= now;
      const userJoinedEventIds = joinsByUser.get(purchase.userId.toString()) || [];
      const organiserEventsJoined = userJoinedEventIds.length;
      const isActive = purchase.isActive && !isExpired && organiserEventsJoined < purchase.maxEvents;
      return {
        purchaseId: purchase._id.toString(),
        package: pkg,
        user,
        purchaseDate: purchase.purchaseDate,
        expiryDate: purchase.expiryDate,
        eventsJoined: organiserEventsJoined,
        maxEvents: purchase.maxEvents,
        eventsRemaining: Math.max(0, purchase.maxEvents - organiserEventsJoined),
        isActive,
        isExpired,
      };
    });

    const pagination = createPaginationResponse(totalCount, page, perPage);

    return res.status(200).json({
      success: true,
      message: 'Package purchases retrieved successfully',
      data: {
        purchases: purchasesList,
        pagination,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = getPackagePurchases;
