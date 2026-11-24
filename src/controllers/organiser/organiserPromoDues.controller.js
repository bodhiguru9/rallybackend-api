const { ObjectId } = require('mongodb');
const { getDB } = require('../../config/database');
const { getPaginationParams, createPaginationResponse } = require('../../utils/pagination');
const { redemptionRows } = require('../../services/promoQueries.service');

/**
 * @desc    Rally-funded discounts used on this organiser's events (read-only tracking list)
 * @route   GET /api/organizers/promo-dues?page=1&perPage=20
 * @access  Private (Organiser only)
 *
 * Shows the admin (Rally-funded) promo discounts players used on the organiser's events and the total.
 * It is a record of discounts only. How payouts use it is decided separately; there are no settle actions here.
 */
const getPromoDues = async (req, res, next) => {
  try {
    const organiserId = new ObjectId(String(req.user.id));
    const { page, perPage, skip } = getPaginationParams(req.query.page, Math.min(parseInt(req.query.perPage, 10) || 20, 100));
    const match = { organiserId, fundedBy: 'rally', status: 'confirmed' };

    const col = getDB().collection('promoRedemptions');
    const [rows, totalRow, count] = await Promise.all([
      redemptionRows(match, { sort: { confirmedAt: -1 }, skip, limit: perPage }),
      col.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: '$discountAmount' } } }]).toArray(),
      col.countDocuments(match),
    ]);

    res.json({
      success: true,
      data: {
        rallyFundedDiscounts: rows.map((r) => ({
          redemptionId: r.redemptionId,
          code: r.code,
          playerName: r.playerName,
          bookingNumber: r.bookingNumber,
          eventNumber: r.eventNumber,
          eventName: r.eventName,
          occurrenceStart: r.occurrenceStart,
          originalAmount: r.originalAmount,
          rallyFundedDiscount: r.discountAmount,
          confirmedAt: r.confirmedAt,
        })),
        totals: {
          rallyFundedDiscountTotal: Math.round(((totalRow[0] && totalRow[0].total) || 0) * 100) / 100,
          count,
        },
        pagination: createPaginationResponse(count, page, perPage),
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getPromoDues };
