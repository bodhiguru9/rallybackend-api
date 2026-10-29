const User = require('../../models/User');
const { getDB } = require('../../config/database');
const { getPaginationParams, createPaginationResponse } = require('../../utils/pagination');
const { getBookingStatsByEvents } = require('../../utils/bookingStats');
const { deleteUserAccount } = require('../user/deleteUser.controller');

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const findOrganiserByIdParam = async (idParam) => {
  let user = null;
  if (!isNaN(idParam) && parseInt(idParam).toString() === idParam) {
    user = await User.findByUserId(idParam);
  }
  if (!user) {
    user = await User.findById(idParam);
  }
  return user;
};

/**
 * @desc    List organisers (admin panel landing page for the events/sales view)
 * @route   GET /api/admin/organisers?search=&page=&perPage=
 * @access  Admin key (adminKeyAuth)
 */
const listOrganisers = async (req, res, next) => {
  try {
    const { page, perPage, skip } = getPaginationParams(req.query.page, parseInt(req.query.perPage, 10) || 20);
    const search = (req.query.search || '').trim();

    const db = getDB();
    const usersCollection = db.collection('users');

    const query = { userType: 'organiser' };
    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      query.$or = [{ fullName: regex }, { email: regex }, { communityName: regex }];
    }

    const totalCount = await usersCollection.countDocuments(query);
    const organisers = await usersCollection
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(perPage)
      .toArray();

    res.status(200).json({
      success: true,
      data: {
        organisers: organisers.map((o) => ({
          userId: o.userId,
          mongoId: o._id.toString(),
          fullName: o.fullName,
          email: o.email,
          mobileNumber: o.mobileNumber,
          communityName: o.communityName,
          yourCity: o.yourCity,
          profilePic: o.profilePic,
          eventsCreated: o.eventsCreated || 0,
          totalAttendees: o.totalAttendees || 0,
          createdAt: o.createdAt,
        })),
        pagination: createPaginationResponse(totalCount, page, perPage),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    List an organiser's events with booking/attendee/sales totals
 * @route   GET /api/admin/organisers/:organiserId/events?type=all|free|paid&page=&perPage=
 * @access  Admin key (adminKeyAuth)
 *
 * Free events come back with totalSales: 0 but a real bookingCount/
 * attendeeCount — this is how the panel tracks free events, not just paid
 * ones, alongside sales.
 */
const getOrganiserEvents = async (req, res, next) => {
  try {
    const { organiserId } = req.params;
    const typeFilter = (req.query.type || 'all').toLowerCase();
    if (!['all', 'free', 'paid'].includes(typeFilter)) {
      return res.status(400).json({ success: false, error: 'type must be one of: all, free, paid' });
    }

    const organiser = await findOrganiserByIdParam(organiserId);
    if (!organiser) {
      return res.status(404).json({ success: false, error: 'Organiser not found' });
    }
    if (organiser.userType !== 'organiser') {
      return res.status(400).json({ success: false, error: 'Target user is not an organiser' });
    }

    const { page, perPage, skip } = getPaginationParams(req.query.page, parseInt(req.query.perPage, 10) || 20);

    const db = getDB();
    const eventsCollection = db.collection('events');
    const creatorQuery = { $in: [organiser._id, organiser._id.toString()] };

    const query = { creatorId: creatorQuery };
    if (typeFilter === 'free') query.eventPricePerGuest = { $in: [0, null] };
    else if (typeFilter === 'paid') query.eventPricePerGuest = { $gt: 0 };

    const totalCount = await eventsCollection.countDocuments(query);
    const events = await eventsCollection
      .find(query)
      .sort({ eventDateTime: -1 })
      .skip(skip)
      .limit(perPage)
      .toArray();

    const statsMap = await getBookingStatsByEvents(events.map((e) => e._id));

    const eventsData = events.map((event) => {
      const stats = statsMap.get(event._id.toString()) || { bookingCount: 0, attendeeCount: 0, totalSales: 0 };
      return {
        eventId: event.eventId,
        eventName: event.eventName,
        eventType: event.eventType,
        eventSports: event.eventSports || [],
        eventDateTime: event.eventDateTime,
        eventStatus: event.eventStatus,
        isFree: !event.eventPricePerGuest || event.eventPricePerGuest === 0,
        eventPricePerGuest: event.eventPricePerGuest || 0,
        bookingCount: stats.bookingCount,
        attendeeCount: stats.attendeeCount,
        totalSales: stats.totalSales,
      };
    });

    res.status(200).json({
      success: true,
      data: {
        organiser: {
          userId: organiser.userId,
          fullName: organiser.fullName,
          email: organiser.email,
          communityName: organiser.communityName,
          profilePic: organiser.profilePic,
        },
        events: eventsData,
        pagination: createPaginationResponse(totalCount, page, perPage),
        filter: { type: typeFilter },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete an organiser account (admin panel only)
 * @route   DELETE /api/admin/organisers/:userId
 * @access  Admin key (adminKeyAuth)
 *
 * Body:
 * {
 *   confirm: { email: string, mobileNumber: string, bio: string }
 * }
 *
 * All three confirm fields must match the target organiser's current
 * record exactly (bio may legitimately be empty/null — empty must match
 * empty). This is a defense against the wrong account being targeted by a
 * stale panel ID or a leftover test script, not a UI "type DELETE" gesture:
 * the admin panel is expected to show these three fields on a confirmation
 * screen before calling this route.
 *
 * Deletion keeps all financial records (bookings, payments, package
 * purchases) untouched — see deleteUserAccount. Bank details are removed
 * from both organizerBankDetails and organiserBankAccounts.
 */
const deleteOrganiser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { confirm } = req.body || {};

    const user = await findOrganiserByIdParam(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    if (user.userType !== 'organiser') {
      return res.status(400).json({
        success: false,
        error: 'Target user is not an organiser',
      });
    }

    if (!confirm || typeof confirm !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'confirm (email, mobileNumber, bio) is required',
      });
    }

    const normalize = (value) => (value === null || value === undefined ? '' : String(value).trim());

    const fieldsMatch =
      normalize(confirm.email).toLowerCase() === normalize(user.email).toLowerCase() &&
      normalize(confirm.mobileNumber) === normalize(user.mobileNumber) &&
      normalize(confirm.bio) === normalize(user.bio);

    if (!fieldsMatch) {
      return res.status(400).json({
        success: false,
        error: 'confirm fields do not match the target organiser. Re-check email, mobileNumber, and bio.',
      });
    }

    const deleted = await deleteUserAccount(user);
    if (!deleted) {
      return res.status(400).json({
        success: false,
        error: 'Failed to delete organiser account',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Organiser account deleted successfully',
      data: {
        userId: user.userId,
        deletedAt: new Date(),
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { listOrganisers, getOrganiserEvents, deleteOrganiser };
