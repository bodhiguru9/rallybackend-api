const EventInvite = require('../../models/EventInvite');
const { getPaginationParams, createPaginationResponse } = require('../../utils/pagination');

/**
 * @desc    Get my invitations (single endpoint for both roles)
 * @route   GET /api/event-invites/my?page=1&status=pending&eventId=E1
 * @access  Private
 *
 * Player: returns invitations received by the player.
 * Organiser: returns invitations sent by the organiser (optional filters: eventId, status).
 */
const getMyInvites = async (req, res, next) => {
  try {
    const status = req.query.status || null;
    const eventId = req.query.eventId || null; // organiser-only filter
    const { page, perPage, skip } = getPaginationParams(req.query.page, 20);

    if (req.user.userType === 'player') {
      const playerId = req.user.id;
      const invites = await EventInvite.getPlayerInvites(playerId, status, perPage, skip);
      const totalCount = await EventInvite.getPlayerInviteCount(playerId, status);
      const pagination = createPaginationResponse(totalCount, page, perPage);

      return res.status(200).json({
        success: true,
        message: 'My invitations retrieved successfully',
        data: {
          role: 'player',
          invitations: invites,
          totalInvitations: totalCount,
          pagination,
          ...(status && { filter: { status } }),
        },
      });
    }

    if (req.user.userType === 'organiser') {
      const organiserId = req.user.id;
      const invites = await EventInvite.getOrganiserInvites(organiserId, eventId, status, perPage, skip);
      const totalCount = await EventInvite.getOrganiserInviteCount(organiserId, eventId, status);
      const pagination = createPaginationResponse(totalCount, page, perPage);

      return res.status(200).json({
        success: true,
        message: 'My invitations retrieved successfully',
        data: {
          role: 'organiser',
          invitations: invites,
          totalInvitations: totalCount,
          pagination,
          ...(eventId && { filter: { ...(status ? { status } : {}), eventId } }),
          ...(!eventId && status && { filter: { status } }),
        },
      });
    }

    return res.status(403).json({
      success: false,
      error: 'This endpoint is only available for players and organisers',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get player invitations
 * @route   GET /api/event-invites/player?page=1&status=pending
 * @access  Private (Player only)
 * 
 * Returns all invitations received by the logged-in player.
 */
const getPlayerInvites = async (req, res, next) => {
  try {
    const playerId = req.user.id;
    const status = req.query.status || null; // 'pending', 'accepted', 'declined', 'cancelled'
    const { page, perPage, skip } = getPaginationParams(req.query.page, 20);

    // Verify user is a player
    if (req.user.userType !== 'player') {
      return res.status(403).json({
        success: false,
        error: 'This endpoint is only available for players',
      });
    }

    // Get invitations
    const invites = await EventInvite.getPlayerInvites(playerId, status, perPage, skip);
    const totalCount = await EventInvite.getPlayerInviteCount(playerId, status);
    const pagination = createPaginationResponse(totalCount, page, perPage);

    res.status(200).json({
      success: true,
      message: 'Player invitations retrieved successfully',
      data: {
        invitations: invites,
        totalInvitations: totalCount,
        pagination,
        ...(status && { filter: { status } }),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get organiser sent invitations
 * @route   GET /api/event-invites/organiser?page=1&eventId=E1&status=pending
 * @access  Private (Organiser only)
 * 
 * Returns all invitations sent by the logged-in organiser.
 */
const getOrganiserInvites = async (req, res, next) => {
  try {
    const organiserId = req.user.id;
    const eventId = req.query.eventId || null;
    const status = req.query.status || null;
    const { page, perPage, skip } = getPaginationParams(req.query.page, 20);

    // Verify user is an organiser
    if (req.user.userType !== 'organiser') {
      return res.status(403).json({
        success: false,
        error: 'This endpoint is only available for organisers',
      });
    }

    // Get invitations
    const invites = await EventInvite.getOrganiserInvites(organiserId, eventId, status, perPage, skip);
    
    // Get total count (simplified - could be optimized)
    const totalCount = invites.length; // For now, use length. Can optimize with separate count query if needed

    res.status(200).json({
      success: true,
      message: 'Organiser invitations retrieved successfully',
      data: {
        invitations: invites,
        totalInvitations: totalCount,
        ...(eventId && { filter: { eventId } }),
        ...(status && { filter: { status } }),
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMyInvites,
  getPlayerInvites,
  getOrganiserInvites,
};
