const PackagePurchase = require('../../../models/PackagePurchase');
const EventJoin = require('../../../models/EventJoin');
const { formatEventResponse } = require('../../../utils/eventFields');
const { getPaginationParams, createPaginationResponse } = require('../../../utils/pagination');
const { getDB } = require('../../../config/database');
const { ObjectId } = require('mongodb');

/**
 * @desc    Get organiser package buyers with joined events and expiry info
 * @route   GET /api/packages/organiser/purchases/details?page=1&perPage=20
 * @access  Private (Organiser)
 */
const getPackageBuyersDetails = async (req, res, next) => {
  try {
    const organiserId = req.user.id;

    if (req.user.userType !== 'organiser') {
      return res.status(403).json({
        success: false,
        error: 'Only organisers can view package buyers',
      });
    }

    const { page, perPage, skip } = getPaginationParams(req.query.page, req.query.perPage || 20);
    const userIdParam = req.params.userId || req.query.userId;

    const db = getDB();
    const purchasesCollection = db.collection('packagePurchases');
    const packagesCollection = db.collection('packages');
    const usersCollection = db.collection('users');
    const eventsCollection = db.collection('events');
    const joinsCollection = db.collection('eventJoins');

    const organiserObjectId = typeof organiserId === 'string' ? new ObjectId(organiserId) : organiserId;
    const purchaseQuery = { organiserId: organiserObjectId };

    if (userIdParam) {
      let user = null;
      if (!isNaN(userIdParam) && parseInt(userIdParam).toString() === userIdParam) {
        user = await usersCollection.findOne({ userId: parseInt(userIdParam) });
      } else {
        try {
          const userObjectId = new ObjectId(userIdParam);
          user = await usersCollection.findOne({ _id: userObjectId });
        } catch (error) {
          user = null;
        }
      }

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
          suggestion: 'Please provide a valid sequential userId or MongoDB ObjectId',
        });
      }

      purchaseQuery.userId = user._id;
    }

    const totalCount = await purchasesCollection.countDocuments(purchaseQuery);
    const purchases = await purchasesCollection
      .find(purchaseQuery)
      .sort({ purchaseDate: -1 })
      .skip(skip)
      .limit(perPage)
      .toArray();

    const packageIds = purchases.map((purchase) => purchase.packageId);
    const userIds = purchases.map((purchase) => purchase.userId);
    const joinedEventIds = [];

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
      .project({ _id: 1 })
      .toArray();
    const organiserEventIds = new Set(organiserEvents.map((event) => event._id.toString()));

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

    const joinedEventIdList = Array.from(new Set(joins.map((join) => join.eventId.toString())))
      .map((id) => new ObjectId(id));
    const events = joinedEventIdList.length > 0
      ? await eventsCollection.find({ _id: { $in: joinedEventIdList } }).toArray()
      : [];
    const eventMap = new Map();
    await Promise.all(
      events.map(async (event) => {
        const participants = await EventJoin.getEventParticipants(event._id, null, 1000, 0);
        eventMap.set(event._id.toString(), {
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
      const daysRemaining = Math.max(0, Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24)));
      const isExpired = expiryDate <= now;
      const userJoinedEventIds = joinsByUser.get(purchase.userId.toString()) || [];
      const joinedEvents = userJoinedEventIds
        .filter((id) => organiserEventIds.has(id))
        .map((eventId) => eventMap.get(eventId))
        .filter(Boolean);
      const organiserEventsJoined = joinedEvents.length;
      const isActive = purchase.isActive && !isExpired && organiserEventsJoined < purchase.maxEvents;

      return {
        purchaseId: purchase._id.toString(),
        package: pkg,
        user,
        purchaseDate: purchase.purchaseDate,
        expiryDate: purchase.expiryDate,
        daysRemaining,
        eventsJoined: organiserEventsJoined,
        maxEvents: purchase.maxEvents,
        eventsRemaining: Math.max(0, purchase.maxEvents - organiserEventsJoined),
        joinedEvents,
        isActive,
        isExpired,
      };
    });

    const pagination = createPaginationResponse(totalCount, page, perPage);

    return res.status(200).json({
      success: true,
      message: 'Package buyers retrieved successfully',
      data: {
        purchases: purchasesList,
        pagination,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = getPackageBuyersDetails;
