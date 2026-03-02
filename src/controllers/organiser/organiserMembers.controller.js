const User = require('../../models/User');
const Follow = require('../../models/Follow');
const Request = require('../../models/Request');
const { getPaginationParams, createPaginationResponse } = require('../../utils/pagination');
const { getBookingStatsByUsers } = require('../../utils/bookingStats');
const { getDB } = require('../../config/database');
const { ObjectId } = require('mongodb');

/**
 * @desc    Get organiser members with booking stats
 * @route   GET /api/organizers/members?page=1&perPage=20
 * @access  Private (Organiser only)
 *
 * Returns organiser's members (followers) with:
 * - total members count
 * - member details
 * - each member's total bookings and total spend
 * - each member's bookings/spend for this organiser's events
 */
const getOrganiserMembers = async (req, res, next) => {
  try {
    const organiserId = req.user.id;
    const { page, perPage, skip } = getPaginationParams(req.query.page, req.query.perPage || 20);

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
        error: 'Only organisers can view members',
      });
    }

    const db = getDB();
    const followsCollection = db.collection('follows');
    const usersCollection = db.collection('users');
    const eventsCollection = db.collection('events');

    const organiserObjectId = new ObjectId(organiserId);

    const totalCount = await followsCollection.countDocuments({ followingId: organiserObjectId });

    const follows = await followsCollection
      .find({ followingId: organiserObjectId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(perPage)
      .toArray();

    const followerIds = follows.map((f) => f.followerId);
    if (followerIds.length === 0) {
      const pagination = createPaginationResponse(totalCount, page, perPage);
      return res.status(200).json({
        success: true,
        message: 'Organiser members retrieved successfully',
        data: {
          organiser: {
            userId: organiser.userId,
            fullName: organiser.fullName || null,
            communityName: organiser.communityName || null,
          },
          members: [],
          totalMembers: totalCount,
          pagination,
        },
      });
    }

    const members = await usersCollection
      .find({ _id: { $in: followerIds } })
      .toArray();

    const memberMap = new Map();
    members.forEach((member) => {
      memberMap.set(member._id.toString(), member);
    });

    const organiserEvents = await eventsCollection
      .find({ creatorId: { $in: [organiserObjectId, organiserId] } })
      .project({ _id: 1 })
      .toArray();

    const organiserEventIds = organiserEvents.map((event) => event._id);

    const totalStatsMap = await getBookingStatsByUsers(followerIds);
    const organiserStatsMap = await getBookingStatsByUsers(followerIds, { eventIds: organiserEventIds });

    const membersList = follows.map((follow) => {
      const member = memberMap.get(follow.followerId.toString());
      if (!member) {
        return null;
      }

      const totalStats = totalStatsMap.get(member._id.toString())
        || { bookedCount: 0, totalSpent: 0, lastBookedAt: null };
      const organiserStats = organiserStatsMap.get(member._id.toString())
        || { bookedCount: 0, totalSpent: 0, lastBookedAt: null };

      return {
        userId: member.userId,
        userType: member.userType,
        email: member.email,
        mobileNumber: member.mobileNumber,
        profilePic: member.profilePic || null,
        ...(member.userType === 'player' && {
          fullName: member.fullName,
          dob: member.dob,
          gender: member.gender,
          sport1: member.sport1,
          sport2: member.sport2,
          sports: member.sports || [],
        }),
        ...(member.userType === 'organiser' && {
          fullName: member.fullName,
          communityName: member.communityName || null,
          yourCity: member.yourCity || null,
        }),
        totalBookedEvents: totalStats.bookedCount,
        totalBookingAmount: totalStats.totalSpent,
        lastBookedAt: totalStats.lastBookedAt,
        organiserBookedEvents: organiserStats.bookedCount,
        organiserBookingAmount: organiserStats.totalSpent,
        organiserLastBookedAt: organiserStats.lastBookedAt,
      };
    }).filter(Boolean);

    const pagination = createPaginationResponse(totalCount, page, perPage);

    return res.status(200).json({
      success: true,
      message: 'Organiser members retrieved successfully',
      data: {
        organiser: {
          userId: organiser.userId,
          fullName: organiser.fullName || null,
          communityName: organiser.communityName || null,
        },
        members: membersList,
        totalMembers: totalCount,
        pagination,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Remove organiser member (unsubscribe user)
 * @route   DELETE /api/organizers/members/:userId
 * @access  Private (Organiser only)
 *
 * Supports sequential userId or MongoDB ObjectId.
 */
const removeOrganiserMember = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const organiserId = req.user.id;

    const organiser = await User.findById(organiserId);
    if (!organiser || organiser.userType !== 'organiser') {
      return res.status(403).json({
        success: false,
        error: 'Only organisers can remove members',
      });
    }

    let member = null;
    if (!isNaN(userId) && parseInt(userId).toString() === userId) {
      member = await User.findByUserId(userId);
    }
    if (!member) {
      member = await User.findById(userId);
    }

    if (!member) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        suggestion: 'Please provide a valid user ID (sequential userId like 5, or MongoDB ObjectId)',
      });
    }

    const memberMongoId = member._id.toString();
    const organiserMongoId = organiser._id.toString();

    let removedFollow = false;
    try {
      removedFollow = await Follow.remove(memberMongoId, organiserMongoId);
    } catch (error) {
      // Ignore follow removal errors; fallback to accepted removal
    }

    let removedAccepted = false;
    try {
      await Request.removeAcceptedUser(memberMongoId, organiserMongoId);
      removedAccepted = true;
    } catch (error) {
      if (error.message !== 'Accepted request not found') {
        throw error;
      }
    }

    if (!removedFollow && !removedAccepted) {
      return res.status(404).json({
        success: false,
        error: 'Member not found or already removed',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Member removed successfully',
      data: {
        userId: member.userId || member._id.toString(),
        fullName: member.fullName || null,
        removedFromFollowers: removedFollow,
        removedFromAccepted: removedAccepted,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getOrganiserMembers,
  removeOrganiserMember,
};
