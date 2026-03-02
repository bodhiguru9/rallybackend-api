const User = require('../../models/User');
const { getPaginationParams, createPaginationResponse } = require('../../utils/pagination');
const { getDB } = require('../../config/database');
const { ObjectId } = require('mongodb');

/**
 * @desc    Get organiser transactions (all payments for their events)
 * @route   GET /api/organizers/transactions?page=1&perPage=20
 * @access  Private (Organiser only)
 */
const getOrganiserTransactions = async (req, res, next) => {
  try {
    const organiserId = req.user.id;

    const organiser = await User.findById(organiserId);
    if (!organiser) {
      return res.status(404).json({
        success: false,
        error: 'Organiser not found',
      });
    }

    if (organiser.userType !== 'organiser') {
      return res.status(403).json({
        success: false,
        error: 'Only organisers can view transactions',
      });
    }

    const { page, perPage, skip } = getPaginationParams(req.query.page, req.query.perPage || 20);
    const includeDummy = req.query.includeDummy === 'true' || req.query.includeDummy === '1';

    const db = getDB();
    const eventsCollection = db.collection('events');
    const paymentsCollection = db.collection('payments');
    const usersCollection = db.collection('users');

    const organiserObjectId = new ObjectId(organiserId);
    const organiserIdString = organiserObjectId.toString();

    const events = await eventsCollection
      .find({
        $or: [{ creatorId: organiserObjectId }, { creatorId: organiserIdString }],
      })
      .project({ _id: 1, eventId: 1, eventName: 1 })
      .toArray();

    if (events.length === 0) {
      const pagination = createPaginationResponse(0, page, perPage);
      const transactions = [];
      if (includeDummy) {
        transactions.push({
          paymentId: 'PAY-DEMO',
          eventId: null,
          eventTitle: 'Demo Event',
          payer: {
            userId: null,
            fullName: 'Demo User',
            communityName: null,
            profilePic: null,
          },
          amount: 100,
          discountAmount: 0,
          finalAmount: 100,
          promoCode: null,
          status: 'success',
          paymentMethod: 'demo',
          createdAt: new Date().toISOString(),
          isDummy: true,
        });
      }
      return res.status(200).json({
        success: true,
        message: 'Organiser transactions retrieved successfully',
        data: {
          organiser: {
            userId: organiser.userId,
            fullName: organiser.fullName || null,
            communityName: organiser.communityName || null,
          },
          transactions,
          pagination,
        },
      });
    }

    const eventIds = events.map((event) => event._id);
    const totalCount = await paymentsCollection.countDocuments({ eventId: { $in: eventIds } });

    const payments = await paymentsCollection
      .find({ eventId: { $in: eventIds } })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(perPage)
      .toArray();

    const eventMap = new Map();
    events.forEach((event) => {
      eventMap.set(event._id.toString(), {
        eventId: event.eventId || null,
        title: event.eventName || null,
      });
    });

    const payerIds = payments.map((payment) => payment.userId).filter(Boolean);
    const payers = payerIds.length > 0
      ? await usersCollection.find({ _id: { $in: payerIds } }).toArray()
      : [];
    const payerMap = new Map();
    payers.forEach((payer) => {
      payerMap.set(payer._id.toString(), {
        userId: payer.userId,
        fullName: payer.fullName || null,
        communityName: payer.communityName || null,
        profilePic: payer.profilePic || null,
      });
    });

    const transactions = payments.map((payment) => {
      const eventData = eventMap.get(payment.eventId.toString()) || { eventId: null, title: null };
      const payerData = payerMap.get(payment.userId.toString()) || null;
      return {
        paymentId: payment.paymentId,
        eventId: eventData.eventId,
        eventTitle: eventData.title,
        payer: payerData,
        amount: payment.amount || 0,
        discountAmount: payment.discountAmount || 0,
        finalAmount: payment.finalAmount || 0,
        promoCode: payment.promoCode || null,
        status: payment.status,
        paymentMethod: payment.paymentMethod || null,
        createdAt: payment.createdAt,
      };
    });
    if (includeDummy && transactions.length === 0) {
      transactions.push({
        paymentId: 'PAY-DEMO',
        eventId: null,
        eventTitle: 'Demo Event',
        payer: {
          userId: null,
          fullName: 'Demo User',
          communityName: null,
          profilePic: null,
        },
        amount: 100,
        discountAmount: 0,
        finalAmount: 100,
        promoCode: null,
        status: 'success',
        paymentMethod: 'demo',
        createdAt: new Date().toISOString(),
        isDummy: true,
      });
    }

    const pagination = createPaginationResponse(totalCount, page, perPage);

    return res.status(200).json({
      success: true,
      message: 'Organiser transactions retrieved successfully',
      data: {
        organiser: {
          userId: organiser.userId,
          fullName: organiser.fullName || null,
          communityName: organiser.communityName || null,
        },
        transactions,
        pagination,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getOrganiserTransactions,
};
