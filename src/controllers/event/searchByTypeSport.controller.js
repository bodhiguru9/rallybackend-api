const { searchEvents } = require('./searchEvents.controller');

/**
 * @desc    Search events by eventType OR eventSports (at least one required)
 * @route   GET /api/events/search/type-sport?eventType=...&eventSports=cricket,football&page=1&limit=10
 * @access  Public (optional auth)
 *
 * This reuses the same response shape as /api/events/search, but requires at least one of eventType or eventSports.
 */
const searchByTypeAndSport = async (req, res, next) => {
  try {
    const eventType = req.query.eventType;
    const eventSports = req.query.eventSports;

    const hasEventType = eventType && typeof eventType === 'string' && eventType.trim().length > 0;
    const hasEventSports =
      eventSports &&
      (Array.isArray(eventSports) ? eventSports.length > 0 : (typeof eventSports === 'string' && eventSports.trim().length > 0));

    if (!hasEventType && !hasEventSports) {
      return res.status(400).json({
        success: false,
        error: 'At least one of eventType or eventSports is required',
        example: '/api/events/search/type-sport?eventType=tournament OR /api/events/search/type-sport?eventSports=cricket',
      });
    }

    // Delegate to existing search controller to keep response consistent
    return await searchEvents(req, res, next);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  searchByTypeAndSport,
};

