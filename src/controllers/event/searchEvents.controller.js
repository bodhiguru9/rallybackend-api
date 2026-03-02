const Event = require('../../models/Event');
const User = require('../../models/User');
const EventJoin = require('../../models/EventJoin');
const Waitlist = require('../../models/Waitlist');
const Follow = require('../../models/Follow');
const { formatEventResponse } = require('../../utils/eventFields');
const { getDB } = require('../../config/database');

/**
 * Helper function to get filter options data
 * Returns unique sports, eventTypes, locations, and prices
 */
async function getFilterOptionsData() {
  try {
    const db = getDB();
    const eventsCollection = db.collection('events');

    // Use two separate pipelines: one for sports (needs unwind) and one for other fields
    const sportsPipeline = [
      {
        $match: {
          eventStatus: { $ne: 'draft' },
          eventSports: { $exists: true, $ne: [] }
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

    const otherFieldsPipeline = [
      {
        $match: {
          eventStatus: { $ne: 'draft' }
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

    // Filter out empty strings and zero prices, then format and sort
    const sports = (sportsData || [])
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

    return {
      sports,
      eventTypes,
      locations,
      prices
    };
  } catch (error) {
    // Return empty arrays on error to not break the main response
    console.error('Error fetching filter options:', error);
    return {
      sports: [],
      eventTypes: [],
      locations: [],
      prices: []
    };
  }
}

/**
 * @desc    Search events by eventName, eventType, eventSports, and date
 * @route   GET /api/events/search
 * @access  Public
 * 
 * Query Parameters:
 * - eventName: Search by event name or creator name (optional)
 * - eventType: Filter by event type (optional)
 * - eventSports: Filter by sports (optional, comma-separated or array)
 * - eventLocation: Filter by location (optional)
 * - minPrice: Filter by minimum price (optional, number)
 * - maxPrice: Filter by maximum price (optional, number)
 * - price: Filter by exact price (optional, number)
 * - startDate: Filter events on this exact date (ISO format: YYYY-MM-DD) (optional)
 *   Example: ?startDate=2026-01-20 will show only events on January 20, 2026
 * - limit: Number of results per page (default: 10)
 * - page: Page number (default: 1)
 */
const searchEvents = async (req, res, next) => {
  try {
    const { 
      eventName, 
      eventType, 
      eventSports, 
      eventLocation,
      minPrice,
      maxPrice,
      price,
      startDate, 
      limit: limitParam, 
      page: pageParam 
    } = req.query;

    // Check if all search parameters are empty/blank
    const hasEventName = eventName && eventName.trim().length > 0;
    const hasEventType = eventType && eventType.trim().length > 0;
    const hasEventSports = eventSports && (Array.isArray(eventSports) ? eventSports.length > 0 : eventSports.trim().length > 0);
    const hasEventLocation = eventLocation && eventLocation.trim().length > 0;
    const hasMinPrice = minPrice !== undefined && minPrice !== null && minPrice !== '';
    const hasMaxPrice = maxPrice !== undefined && maxPrice !== null && maxPrice !== '';
    const hasPrice = price !== undefined && price !== null && price !== '';
    const hasStartDate = startDate && startDate.trim().length > 0;
    const hasAnySearchParam = hasEventName || hasEventType || hasEventSports || hasEventLocation || hasMinPrice || hasMaxPrice || hasPrice || hasStartDate;

    // If no search parameters provided, return helpful message
    if (!hasAnySearchParam) {
      return res.status(400).json({
        success: false,
        error: 'Please provide at least one search parameter',
        message: 'Try searching with: eventName, eventType, eventSports, or startDate',
        suggestions: {
          eventName: 'Search by event name or creator name (e.g., ?eventName=Championship)',
          eventType: 'Filter by event type (e.g., ?eventType=tournament)',
          eventSports: 'Filter by sports (e.g., ?eventSports=cricket or ?eventSports=cricket,football)',
          eventLocation: 'Filter by location (e.g., ?eventLocation=Delhi)',
          minPrice: 'Filter by minimum price (e.g., ?minPrice=100)',
          maxPrice: 'Filter by maximum price (e.g., ?maxPrice=500)',
          price: 'Filter by exact price (e.g., ?price=200)',
          startDate: 'Filter by start date (e.g., ?startDate=2024-12-01)',
          combined: 'Combine multiple filters (e.g., ?eventType=tournament&eventSports=cricket&eventLocation=Delhi&minPrice=100&maxPrice=500)',
        },
        example: '/api/events/search?eventType=tournament&eventSports=cricket&eventLocation=Delhi&minPrice=100&maxPrice=500',
      });
    }

    // Pagination
    let limit = parseInt(limitParam) || 10;
    let page = parseInt(pageParam) || 1;
    
    // Ensure limit is reasonable (max 100 per page)
    if (limit > 100) {
      limit = 100;
    }
    if (limit < 1) {
      limit = 10;
    }
    
    const skip = (page - 1) * limit;

    // Build search filters
    const filters = {};
    
    // Search by eventName (event name or creator name)
    if (hasEventName) {
      filters.eventName = eventName.trim();
    }
    
    // Filter by eventType
    if (hasEventType) {
      filters.eventType = eventType.trim();
    }
    
    // Filter by eventSports
    if (hasEventSports) {
      filters.eventSports = Array.isArray(eventSports) ? eventSports : eventSports.split(',').map(s => s.trim());
    }
    
    // Filter by eventLocation
    if (hasEventLocation) {
      filters.eventLocation = eventLocation.trim();
    }
    
    // Filter by price (minPrice, maxPrice, or exact price)
    if (hasPrice) {
      const priceNum = parseFloat(price);
      if (!isNaN(priceNum) && priceNum >= 0) {
        filters.price = priceNum;
      }
    } else {
      if (hasMinPrice) {
        const minPriceNum = parseFloat(minPrice);
        if (!isNaN(minPriceNum) && minPriceNum >= 0) {
          filters.minPrice = minPriceNum;
        }
      }
      if (hasMaxPrice) {
        const maxPriceNum = parseFloat(maxPrice);
        if (!isNaN(maxPriceNum) && maxPriceNum >= 0) {
          filters.maxPrice = maxPriceNum;
        }
      }
    }
    
    // Filter by start date
    if (hasStartDate) {
      const date = new Date(startDate);
      if (!isNaN(date.getTime())) {
        filters.startDate = date.toISOString();
      } else {
        return res.status(400).json({
          success: false,
          error: 'Invalid startDate format',
          message: 'Please use ISO date format: YYYY-MM-DD (e.g., 2024-12-01)',
          provided: startDate,
        });
      }
    }

    // Get events with filters
    const db = require('../../config/database').getDB();
    const eventsCollection = db.collection('events');
    
    // Build MongoDB query
    const query = {};
    
    // eventName search (searches in both eventName and eventCreatorName)
    if (filters.eventName) {
      query.$or = [
        { eventName: { $regex: filters.eventName, $options: 'i' } },
        { eventCreatorName: { $regex: filters.eventName, $options: 'i' } },
      ];
    }
    
    // EventType filter
    if (filters.eventType) {
      query.eventType = { $regex: filters.eventType, $options: 'i' };
    }
    
    // EventSports filter (search in eventSports array)
    if (filters.eventSports && filters.eventSports.length > 0) {
      query.eventSports = { $in: filters.eventSports.map(s => new RegExp(s, 'i')) };
    }
    
    // EventLocation filter (case-insensitive search)
    if (filters.eventLocation) {
      query.eventLocation = { $regex: filters.eventLocation, $options: 'i' };
    }
    
    // Price filter
    if (filters.price !== undefined) {
      // Exact price match
      query.eventPricePerGuest = filters.price;
    } else {
      // Price range filter
      const priceQuery = {};
      if (filters.minPrice !== undefined) {
        priceQuery.$gte = filters.minPrice;
      }
      if (filters.maxPrice !== undefined) {
        priceQuery.$lte = filters.maxPrice;
      }
      if (Object.keys(priceQuery).length > 0) {
        query.eventPricePerGuest = priceQuery;
      }
    }
    
    // Date filter - match exact date (events on that specific date)
    if (filters.startDate) {
      const startDateObj = new Date(filters.startDate);
      // Set to start of day (00:00:00.000)
      const startOfDay = new Date(startDateObj);
      startOfDay.setHours(0, 0, 0, 0);
      
      // Set to end of day (23:59:59.999)
      const endOfDay = new Date(startDateObj);
      endOfDay.setHours(23, 59, 59, 999);
      
      // Match events on this exact date (between start and end of day)
      query.eventDateTime = {
        $gte: startOfDay,
        $lte: endOfDay,
      };
    }
    
    // Get events
    const events = await eventsCollection
      .find(query)
      .sort({ eventDateTime: 1 }) // Sort by date (upcoming first)
      .limit(limit)
      .skip(skip)
      .toArray();
    
    // Get total count for pagination
    const totalCount = await eventsCollection.countDocuments(query);
    
    // If no events found, return appropriate message
    if (totalCount === 0) {
      // Special message if searching by date
      if (hasStartDate) {
        return res.status(404).json({
          success: false,
          error: 'No events found',
          message: `No events found on the date ${startDate}. Try searching for a different date.`,
          searchParams: {
            eventName: eventName || null,
            eventType: eventType || null,
            eventSports: eventSports || null,
            eventLocation: eventLocation || null,
            minPrice: minPrice || null,
            maxPrice: maxPrice || null,
            price: price || null,
            startDate: startDate || null,
          },
          suggestions: {
            date: `No events were created on ${startDate}. Try searching for a different date.`,
            eventName: hasEventName ? 'Try a different event name or partial match' : 'You can also search by eventName',
            eventType: hasEventType ? 'Try a different event type' : 'You can also search by eventType',
            eventLocation: hasEventLocation ? 'Try a different location' : 'You can also search by eventLocation',
            tip: 'You can search with just one parameter (eventName, eventType, eventSports, eventLocation, price, or startDate)',
          },
        });
      }
      
      // General no results message
      return res.status(404).json({
        success: false,
        error: 'No events found',
        message: 'No events match your search criteria. Try adjusting your search parameters.',
        searchParams: {
          eventName: eventName || null,
          eventType: eventType || null,
          eventSports: eventSports || null,
          eventLocation: eventLocation || null,
          minPrice: minPrice || null,
          maxPrice: maxPrice || null,
          price: price || null,
          startDate: startDate || null,
        },
        suggestions: {
          eventName: 'Try a different event name or partial match',
          eventType: 'Check if the event type spelling is correct',
          eventSports: 'Try different sports',
          eventLocation: 'Try a different location',
          price: 'Try a different price range',
          startDate: 'Try a different date',
          tip: 'You can search with just one parameter (eventName, eventType, eventSports, eventLocation, price, or startDate)',
        },
      });
    }
    
    const totalPages = Math.ceil(totalCount / limit);

    // Get creator details and additional info for each event (matching getAllEvents format)
    const eventsWithFullData = await Promise.all(
      events.map(async (event) => {
        // Get creator/organiser details (only required fields)
        const creator = await User.findById(event.creatorId);
        let creatorData = null;
        
        if (creator && creator.userType === 'organiser') {
          creatorData = {
            userId: creator.userId,
            email: creator.email,
            profilePic: creator.profilePic,
            fullName: creator.fullName,
            communityName: creator.communityName,
            eventsCreated: creator.eventsCreated || 0,
            totalAttendees: creator.totalAttendees || 0,
          };
        }

        // Use MongoDB ObjectId for database operations
        const mongoEventId = event._id;

        // Support both old and new field names for backward compatibility
        const isPrivate = event.IsPrivateEvent !== undefined ? event.IsPrivateEvent : (event.visibility === 'private');
        const maxGuest = event.eventMaxGuest !== undefined ? event.eventMaxGuest : (event.gameSpots || 0);

        // Get actual booked participants count (more accurate than eventTotalAttendNumber)
        let participantsCount = 0;
        let participants = [];
        if (!isPrivate || (req.user && req.user.id === event.creatorId.toString())) {
          participantsCount = await EventJoin.getParticipantCount(mongoEventId);
          participants = await EventJoin.getEventParticipants(mongoEventId, 10, 0); // Get first 10 participants
        }

        // Get waitlist count (only for private events and if user is creator)
        let waitlistCount = 0;
        let waitlist = [];
        if (isPrivate && req.user && req.user.id === event.creatorId.toString()) {
          waitlistCount = await Waitlist.getWaitlistCount(mongoEventId);
          waitlist = await Waitlist.getEventWaitlist(mongoEventId, 10, 0); // Get first 10 waitlist items
        }

        // Calculate spots information
        const spotsFull = participantsCount >= maxGuest;
        const availableSpots = Math.max(0, maxGuest - participantsCount);
        const spotsBooked = participantsCount;
        const spotsLeft = availableSpots;

        // Get user's join status if authenticated
        let userJoinStatus = null;
        if (req.user) {
          if (!isPrivate) {
            const hasJoined = await EventJoin.hasJoined(req.user.id, mongoEventId);
            userJoinStatus = {
              hasJoined,
              canJoin: !hasJoined && !spotsFull,
              action: hasJoined ? 'joined' : spotsFull ? 'join-waitlist' : 'join', // 'join', 'join-waitlist', or 'joined'
            };
          } else {
            // Private event
            const inWaitlist = await Waitlist.isInWaitlist(req.user.id, mongoEventId);
            const hasJoined = await EventJoin.hasJoined(req.user.id, mongoEventId);
            userJoinStatus = {
              hasJoined,
              inWaitlist,
              canRequest: !hasJoined && !inWaitlist,
              action: hasJoined ? 'joined' : inWaitlist ? 'requested' : 'request-join', // 'request-join', 'requested', or 'joined'
            };
          }
        } else {
          // Not authenticated - show appropriate action based on visibility
          userJoinStatus = {
            action: !isPrivate ? (spotsFull ? 'join-waitlist' : 'join') : 'request-join',
            requiresAuth: true,
          };
        }

        return {
          ...formatEventResponse(event),
          creator: creatorData,
          participants: participants,
          participantsCount: participantsCount,
          waitlist: waitlist,
          waitlistCount: waitlistCount,
          userJoinStatus: userJoinStatus,
          spotsInfo: {
            totalSpots: maxGuest,
            spotsBooked: spotsBooked,
            spotsLeft: spotsLeft,
            spotsFull: spotsFull,
          },
          availableSpots: availableSpots,
          isFull: spotsFull, // Keep for backward compatibility
        };
      })
    );

    // Get filter options (unique sports, eventTypes, locations, prices)
    const filterOptions = await getFilterOptionsData();

    res.status(200).json({
      success: true,
      message: 'Events found successfully',
      data: {
        events: eventsWithFullData,
        pagination: {
          total: totalCount,
          totalPages: totalPages,
          currentPage: page,
          limit: limit,
          skip: skip,
          hasMore: skip + limit < totalCount,
          hasPrevious: skip > 0,
        },
        searchParams: {
          eventName: eventName || null,
          eventType: eventType || null,
          eventSports: eventSports || null,
          eventLocation: eventLocation || null,
          minPrice: minPrice || null,
          maxPrice: maxPrice || null,
          price: price || null,
          startDate: startDate || null,
        },
        filterOptions: filterOptions,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  searchEvents,
};

