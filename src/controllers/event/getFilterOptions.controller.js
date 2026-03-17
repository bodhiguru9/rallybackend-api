const { getDB } = require('../../config/database');
const Sport = require('../../models/Sport');

/**
 * @desc    Get unique filter options (sports, eventTypes, locations, prices) from all events
 * @route   GET /api/events/filter-options
 * @access  Public
 * 
 * Returns unique/distinct values for:
 * - sports: Array of unique sports names from Sports API and eventSports
 * - eventTypes: Array of unique event types
 * - locations: Array of unique event locations
 * - prices: Array of unique prices (sorted)
 * 
 * All values are deduplicated - no repeats
 * Sports are combined from:
 * 1. Sports created via Sports API (/api/sports)
 * 2. Sports from events (eventSports field)
 */
const getFilterOptions = async (req, res, next) => {
  try {
    const db = getDB();
    const eventsCollection = db.collection('events');

    // Use MongoDB aggregation pipeline for efficient distinct value extraction
    // This is optimized to get all unique values in a single query
    // We use two separate pipelines: one for sports (needs unwind) and one for other fields
    
    // Pipeline 1: Get unique sports (needs unwind for array)
    // Exclude draft events (support both old and new field names)
    const sportsPipeline = [
      {
        $match: {
          $and: [
            {
              $or: [
                { eventStatus: { $ne: 'draft' } },
                { status: { $ne: 'draft' } },
                { eventStatus: { $exists: false }, status: { $exists: false } }
              ]
            },
            { eventSports: { $exists: true, $ne: [] } }
          ]
        }
      },
      {
        $unwind: '$eventSports'
      },
      {
        $group: {
          _id: null,
          sports: { $addToSet: '$eventSports' }
        }
      }
    ];

    // Pipeline 2: Get unique eventTypes, locations, and prices
    // Exclude draft events (support both old and new field names)
    const otherFieldsPipeline = [
      {
        $match: {
          $or: [
            { eventStatus: { $ne: 'draft' } },
            { status: { $ne: 'draft' } },
            { eventStatus: { $exists: false }, status: { $exists: false } }
          ]
        }
      },
      {
        $group: {
          _id: null,
          eventTypes: { $addToSet: '$eventType' },
          locations: { $addToSet: '$eventLocation' },
          prices: { $addToSet: '$eventPricePerGuest' }
        }
      }
    ];

    // Get sports from Sports API (all sports, not just active)
    // Get both active and inactive to show all available sports
    let sportsFromAPI = [];
    try {
      sportsFromAPI = await Sport.findAll({}); // Get all sports (no filter)
      // If no sports found, try direct database query as fallback
      if (!sportsFromAPI || sportsFromAPI.length === 0) {
        const sportsCollection = db.collection('sports');
        sportsFromAPI = await sportsCollection.find({}).toArray();
      }
    } catch (error) {
      console.error('Error fetching sports from API:', error);
      // Try direct database query as fallback
      try {
        const sportsCollection = db.collection('sports');
        sportsFromAPI = await sportsCollection.find({}).toArray();
      } catch (fallbackError) {
        console.error('Error in fallback sports query:', fallbackError);
        sportsFromAPI = [];
      }
    }

    // Execute both pipelines in parallel
    const [sportsResult, otherFieldsResult] = await Promise.all([
      eventsCollection.aggregate(sportsPipeline).toArray(),
      eventsCollection.aggregate(otherFieldsPipeline).toArray()
    ]);

    // Combine results
    const sportsData = sportsResult && sportsResult.length > 0 ? sportsResult[0].sports || [] : [];
    const otherData = otherFieldsResult && otherFieldsResult.length > 0 ? otherFieldsResult[0] : {
      eventTypes: [],
      locations: [],
      prices: []
    };

    // Default sports that should always be available, even if not yet in the database
    const defaultSports = [
      'Tennis', 'Badminton', 'Basketball', 'Padel', 'Football',
      'Cricket', 'Volleyball', 'Pilates', 'Running', 'Pickleball',
      'Table-tennis',
    ];

    // Combine sports from API, events, and defaults, then filter, format and sort
    const allSports = [
      ...defaultSports,
      ...(sportsFromAPI || []).map(sport => sport.name || sport).filter(name => name), // Sports from API
      ...(sportsData || []).filter(sport => 
        sport && typeof sport === 'string' && sport.trim().length > 0
      ) // Sports from events
    ];

    // Filter out empty strings, deduplicate (case-insensitive), format and sort
    const sports = allSports
      .filter(sport => sport && typeof sport === 'string' && sport.trim().length > 0)
      .map(sport => sport.trim().toLowerCase())
      .filter((value, index, self) => self.indexOf(value) === index) // Remove duplicates (case-insensitive)
      .map(sport => sport.charAt(0).toUpperCase() + sport.slice(1)) // Capitalize first letter
      .sort(); // Sort alphabetically

    const eventTypes = (otherData.eventTypes || [])
      .filter(type => type && typeof type === 'string' && type.trim().length > 0)
      .map(type => type.trim().toLowerCase())
      .filter((value, index, self) => self.indexOf(value) === index) // Remove duplicates (case-insensitive)
      .map(type => type.charAt(0).toUpperCase() + type.slice(1)) // Capitalize first letter
      .sort(); // Sort alphabetically

    const locations = (otherData.locations || [])
      .filter(location => location && typeof location === 'string' && location.trim().length > 0)
      .map(location => location.trim())
      .filter((value, index, self) => self.indexOf(value) === index) // Remove duplicates
      .sort(); // Sort alphabetically

    const prices = (otherData.prices || [])
      .filter(price => price !== null && price !== undefined && typeof price === 'number' && price > 0)
      .filter((value, index, self) => self.indexOf(value) === index) // Remove duplicates
      .sort((a, b) => a - b); // Sort prices ascending

    res.status(200).json({
      success: true,
      message: 'Filter options retrieved successfully',
      data: {
        sports,
        eventTypes,
        locations,
        prices
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getFilterOptions,
};
