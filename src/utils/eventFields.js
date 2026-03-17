/**
 * Centralized Event Fields Configuration
 * This file defines all event fields, their processing logic, and validation
 * Use this file everywhere events are created, updated, or searched
 */

/**
 * Calculate event status based on eventDateTime
 * Returns: 'past', 'ongoing', or 'upcoming'
 */
const calculateEventStatus = (eventDateTime) => {
  if (!eventDateTime) return 'upcoming';
  
  const eventDate = new Date(eventDateTime);
  const now = new Date();
  
  // If event date is in the past (more than 24 hours ago), it's past
  const hoursDiff = (now - eventDate) / (1000 * 60 * 60);
  if (hoursDiff > 24) {
    return 'past';
  }
  
  // If event date is in the past but less than 24 hours, it's ongoing
  if (eventDate < now) {
    return 'ongoing';
  }
  
  // If event date is in the future, it's upcoming
  return 'upcoming';
};

/**
 * Process event data from request body
 * Handles field extraction, trimming, type conversion, and default values
 */
const processEventData = (reqBody, organiserData = {}) => {
  // Parse eventDateTime
  const eventDateTime = reqBody.eventDateTime ? new Date(reqBody.eventDateTime) : null;
  const eventEndDateTime = reqBody.eventEndDateTime ? new Date(reqBody.eventEndDateTime) : null;
  
  // Calculate eventStatus automatically based on eventDateTime
  let eventStatus = calculateEventStatus(eventDateTime);
  
  // Override if status is explicitly provided (for draft or manual status)
  if (reqBody.eventStatus && ['draft', 'past', 'ongoing', 'upcoming', 'completed', 'cancelled'].includes(reqBody.eventStatus)) {
    eventStatus = reqBody.eventStatus;
  }
  
  // Handle draft saving - if eventSavedraft is true, set status to draft
  if (reqBody.eventSavedraft === 'true' || reqBody.eventSavedraft === true || reqBody.eventSaveDraft === 'true' || reqBody.eventSaveDraft === true) {
    eventStatus = 'draft';
  }
  
  // Parse boolean fields
  const isPrivateEvent = reqBody.IsPrivateEvent === 'true' || reqBody.IsPrivateEvent === true || reqBody.isPrivateEvent === 'true' || reqBody.isPrivateEvent === true;
  const eventOurGuestAllowed = reqBody.eventOurGuestAllowed === 'true' || reqBody.eventOurGuestAllowed === true;
  const eventApprovalReq = reqBody.eventApprovalReq === 'true' || reqBody.eventApprovalReq === true;
  const eventDisallow = reqBody.eventDisallow === 'true' || reqBody.eventDisallow === true || reqBody.disallow === 'true' || reqBody.disallow === true;
  const eventApprovalRequired = reqBody.eventApprovalRequired === 'true' || reqBody.eventApprovalRequired === true || reqBody.approvalRequired === 'true' || reqBody.approvalRequired === true;
  // policyJoind: store as value (string, number, etc.) - not boolean
  const policyJoind = reqBody.policyJoind !== undefined && reqBody.policyJoind !== null
    ? (typeof reqBody.policyJoind === 'string' ? reqBody.policyJoind.trim() : reqBody.policyJoind)
    : null;
  
  // Parse age fields
  const eventMinAge = reqBody.eventMinAge ? parseInt(reqBody.eventMinAge) : null;
  const eventMaxAge = reqBody.eventMaxAge ? parseInt(reqBody.eventMaxAge) : null;
  
  // Process eventFrequency (array, optional)
  const eventFrequency = reqBody.eventFrequency 
    ? (Array.isArray(reqBody.eventFrequency) 
        ? reqBody.eventFrequency.map(f => typeof f === 'string' ? f.trim() : f)
        : [reqBody.eventFrequency])
    : [];
  
  // Process event images (optional - max 5 images)
  // Note: Images are handled as file uploads, so they're processed separately in the controller
  // This field is for reference/documentation purposes
  const eventImages = reqBody.eventImages || null; // Array of image URLs (max 5, optional)
  
  // Process event video (optional)
  // Note: Video is handled as file upload, so it's processed separately in the controller
  // This field is for reference/documentation purposes
  const eventVideo = reqBody.eventVideo || null; // Video URL (optional)

  // Set timestamps
  const now = new Date();
  const createdAt = reqBody.createdAt ? new Date(reqBody.createdAt) : now;
  const updatedAt = reqBody.updatedAt ? new Date(reqBody.updatedAt) : now;

  return {
    // Basic Information
    eventName: reqBody.eventName ? reqBody.eventName.trim() : null,
    eventType: reqBody.eventType ? reqBody.eventType.trim() : null,
    eventSports: reqBody.eventSports ? (Array.isArray(reqBody.eventSports) ? reqBody.eventSports.map(s => s.trim()) : [reqBody.eventSports.trim()]) : [],
    
    // Media (optional)
    eventImages: eventImages, // Array of image URLs (max 5 images, optional)
    eventVideo: eventVideo, // Video URL (optional)
    
    // Date & Time
    eventDateTime: eventDateTime,
    eventEndDateTime: eventEndDateTime,
    eventFrequency: eventFrequency, // Array of frequency values (optional)
    
    // Location
    eventLocation: reqBody.eventLocation ? reqBody.eventLocation.trim() : null,
    
    // Details
    eventDescription: reqBody.eventDescription ? reqBody.eventDescription.trim() : null,
    
    // Restrictions
    eventGender: reqBody.eventGender ? reqBody.eventGender.trim() : null,
    eventSportsLevel: reqBody.eventSportsLevel ? reqBody.eventSportsLevel.trim() : null,
    eventMinAge: eventMinAge,
    eventMaxAge: eventMaxAge,
    eventLevelRestriction: reqBody.eventLevelRestriction ? reqBody.eventLevelRestriction.trim() : null,
    
    // Capacity & Pricing
    eventMaxGuest: reqBody.eventMaxGuest ? parseInt(reqBody.eventMaxGuest) : null,
    eventPricePerGuest: reqBody.eventPricePerGuest !== undefined && reqBody.eventPricePerGuest !== null ? parseFloat(reqBody.eventPricePerGuest) : 0,
    
    // Boolean flags
    IsPrivateEvent: isPrivateEvent,
    eventOurGuestAllowed: eventOurGuestAllowed,
    eventApprovalReq: eventApprovalReq,
    eventDisallow: eventDisallow,
    eventApprovalRequired: eventApprovalRequired,
    policyJoind: policyJoind,
    
    // Registration
    eventRegistrationStartTime: reqBody.eventRegistrationStartTime ? new Date(reqBody.eventRegistrationStartTime) : null,
    eventRegistrationEndTime: reqBody.eventRegistrationEndTime ? new Date(reqBody.eventRegistrationEndTime) : null,
    
    // Creator Information (from organiserData or request)
    eventCreatorName: reqBody.eventCreatorName ? reqBody.eventCreatorName.trim() : (organiserData.fullName || null),
    eventCreatorEmail: reqBody.eventCreatorEmail ? reqBody.eventCreatorEmail.trim() : (organiserData.email || null),
    eventCreatorProfilePic: reqBody.eventCreatorProfilePic ? reqBody.eventCreatorProfilePic.trim() : (organiserData.profilePic || null),
    
    // Status (auto-calculated or provided)
    eventStatus: eventStatus,
    
    // Total attend number (defaults to 0)
    eventTotalAttendNumber: reqBody.eventTotalAttendNumber ? parseInt(reqBody.eventTotalAttendNumber) : 0,
    
    // Timestamps
    createdAt: createdAt,
    updatedAt: updatedAt,
  };
};

/**
 * Calculate time until event starts
 * Returns time remaining in a human-readable format
 * @param {Date|string} eventDateTime - Event date/time
 * @returns {Object|null} Time until start or null if event is in the past
 */
const calculateTimeUntilStart = (eventDateTime) => {
  if (!eventDateTime) return null;
  
  const eventDate = new Date(eventDateTime);
  const now = new Date();
  
  // If event is in the past, return null
  if (eventDate <= now) {
    return null;
  }
  
  // Calculate time difference in milliseconds
  const diffMs = eventDate.getTime() - now.getTime();
  
  // Convert to different time units
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  // Format time remaining
  let timeRemaining = '';
  let timeRemainingShort = '';
  
  if (diffDays > 0) {
    timeRemaining = `${diffDays} day${diffDays > 1 ? 's' : ''} ${diffHours % 24} hour${(diffHours % 24) > 1 ? 's' : ''}`;
    timeRemainingShort = `${diffDays}d ${diffHours % 24}h`;
  } else if (diffHours > 0) {
    timeRemaining = `${diffHours} hour${diffHours > 1 ? 's' : ''} ${diffMinutes % 60} minute${(diffMinutes % 60) > 1 ? 's' : ''}`;
    timeRemainingShort = `${diffHours}h ${diffMinutes % 60}m`;
  } else if (diffMinutes > 0) {
    timeRemaining = `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''}`;
    timeRemainingShort = `${diffMinutes}m`;
  } else {
    timeRemaining = `${diffSeconds} second${diffSeconds > 1 ? 's' : ''}`;
    timeRemainingShort = `${diffSeconds}s`;
  }
  
  return {
    milliseconds: diffMs,
    seconds: diffSeconds,
    minutes: diffMinutes,
    hours: diffHours,
    days: diffDays,
    timeRemaining: timeRemaining.trim(),
    timeRemainingShort: timeRemainingShort.trim(),
    startsAt: eventDate.toISOString(),
    startsAtFormatted: eventDate.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
};

/**
 * Format event data for response
 * Ensures consistent event data structure in all API responses
 */
const formatEventResponse = (event) => {
  // Calculate eventStatus if not present or if eventDateTime exists
  let eventStatus = event.eventStatus;
  if (eventStatus !== 'draft' && event.eventDateTime) {
    eventStatus = calculateEventStatus(event.eventDateTime);
  }

  if (!eventStatus) {
    eventStatus = 'upcoming';
  }

  // Get images - support both new and old field names, with organiser profile pic fallback
  let eventImages = [];

  if (Array.isArray(event.eventImages) && event.eventImages.length > 0) {
    eventImages = event.eventImages.filter(Boolean);
  } else if (Array.isArray(event.gameImages) && event.gameImages.length > 0) {
    eventImages = event.gameImages.filter(Boolean);
  } else if (event.eventImage) {
    eventImages = [event.eventImage];
  } else if (event.gameImage) {
    eventImages = [event.gameImage];
  } else if (event.eventCreatorProfilePic) {
    // fallback to organiser profile pic when no event image exists
    eventImages = [event.eventCreatorProfilePic];
  }

  // Limit to max 5 images if more are present
  const limitedEventImages = eventImages.slice(0, 5);
  const primaryEventImage = limitedEventImages.length > 0 ? limitedEventImages[0] : null;

  // Get video - support both new field name (eventVideo) and old field name (gameVideo) for backward compatibility
  const eventVideo = event.eventVideo || event.gameVideo || null;

  // Calculate time until start for upcoming events
  const eventDateTime = event.eventDateTime || event.gameStartDate;
  const eventEndDateTime = event.eventEndDateTime || null;
  const timeUntilStart =
    eventStatus === 'upcoming' && eventDateTime
      ? calculateTimeUntilStart(eventDateTime)
      : null;

  const response = {
    eventId: event.eventId,
    mongoId: event._id ? event._id.toString() : null,
    eventName: event.eventName || null,

    eventImages: limitedEventImages,
    eventImage: primaryEventImage,
    gameImage: primaryEventImage,

    eventVideo: eventVideo,
    eventType: event.eventType || null,
    eventSports: event.eventSports || [],
    eventDateTime: eventDateTime || null,
    eventEndDateTime: eventEndDateTime,
    eventFrequency: event.eventFrequency || [],
    eventLocation: event.eventLocation || null,
    eventDescription: event.eventDescription || null,
    eventGender: event.eventGender || null,
    eventSportsLevel: event.eventSportsLevel || null,
    eventMinAge: event.eventMinAge || null,
    eventMaxAge: event.eventMaxAge || null,
    eventLevelRestriction: event.eventLevelRestriction || null,
    eventMaxGuest: event.eventMaxGuest || null,
    eventPricePerGuest: event.eventPricePerGuest || 0,
    IsPrivateEvent: event.IsPrivateEvent !== undefined ? event.IsPrivateEvent : false,
    eventOurGuestAllowed: event.eventOurGuestAllowed !== undefined ? event.eventOurGuestAllowed : false,
    eventApprovalReq: event.eventApprovalReq !== undefined ? event.eventApprovalReq : false,
    eventDisallow: event.eventDisallow !== undefined ? event.eventDisallow : false,
    eventApprovalRequired: event.eventApprovalRequired !== undefined ? event.eventApprovalRequired : false,
    policyJoind: event.policyJoind !== undefined && event.policyJoind !== null ? event.policyJoind : null,
    eventRegistrationStartTime: event.eventRegistrationStartTime || null,
    eventRegistrationEndTime: event.eventRegistrationEndTime || null,

    eventCreatorName: event.eventCreatorName || null,
    eventCreatorEmail: event.eventCreatorEmail || null,
    eventCreatorProfilePic: event.eventCreatorProfilePic || null,

    eventStatus: eventStatus,
    eventTotalAttendNumber: event.eventTotalAttendNumber || 0,
    createdAt: event.createdAt ? (event.createdAt instanceof Date ? event.createdAt : new Date(event.createdAt)) : new Date(),
    updatedAt: event.updatedAt ? (event.updatedAt instanceof Date ? event.updatedAt : new Date(event.updatedAt)) : new Date(),
  };

  if (timeUntilStart) {
    response.timeUntilStart = timeUntilStart;
  }

  return response;
};

/**
 * Build event query filters for search
 * Includes eventSports in search filters
 */
const buildEventQuery = (filters = {}) => {
  const query = {};

  // Event type filter (case-insensitive regex)
  if (filters.eventType) {
    query.eventType = { $regex: filters.eventType, $options: 'i' };
  }

  // Sports filter (search in eventSports array)
  if (filters.eventSports) {
    const sportsArray = Array.isArray(filters.eventSports) 
      ? filters.eventSports.map(s => s.trim())
      : [filters.eventSports.trim()];
    
    if (sportsArray.length > 0) {
      // Match events where eventSports array contains any of the specified sports (case-insensitive)
      if (!query.$or) {
        query.$or = [];
      }
      sportsArray.forEach(sport => {
        query.$or.push({ eventSports: { $regex: sport, $options: 'i' } });
      });
    }
  }

  // Creator name filter (case-insensitive regex)
  if (filters.eventCreatorName) {
    query.eventCreatorName = { $regex: filters.eventCreatorName, $options: 'i' };
  }

  // Private event filter (boolean)
  if (filters.IsPrivateEvent !== undefined) {
    query.IsPrivateEvent = filters.IsPrivateEvent === 'true' || filters.IsPrivateEvent === true;
  }

  // Status filter
  if (filters.eventStatus) {
    query.eventStatus = filters.eventStatus;
  } else if (filters.excludeDrafts === true) {
    // Exclude draft events by default from public listings
    query.eventStatus = { $ne: 'draft' };
  }

  // Date filtering (using eventDateTime)
  if (filters.startDate || filters.endDate) {
    query.eventDateTime = {};
    
    if (filters.startDate) {
      const startDate = new Date(filters.startDate);
      if (!isNaN(startDate.getTime())) {
        query.eventDateTime.$gte = startDate;
      }
    }
    
    if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      if (!isNaN(endDate.getTime())) {
        endDate.setHours(23, 59, 59, 999);
        query.eventDateTime.$lte = endDate;
      }
    }
  }

  return query;
};

/**
 * Get all event field names
 * Useful for validation and field mapping
 */
const getEventFieldNames = () => {
  return [
    'eventName',
    'eventType',
    'eventSports',
    'eventImages', // Array of image URLs (max 5 images, optional)
    'eventVideo', // Video URL (optional)
    'eventDateTime',
    'eventFrequency', // Array of frequency values (optional)
    'eventLocation',
    'eventDescription',
    'eventGender',
    'eventSportsLevel',
    'eventMinAge',
    'eventMaxAge',
    'eventLevelRestriction',
    'eventMaxGuest',
    'eventPricePerGuest',
    'IsPrivateEvent',
    'eventOurGuestAllowed',
    'eventApprovalReq',
    'eventDisallow',
    'eventApprovalRequired',
    'policyJoind',
    'eventRegistrationStartTime',
    'eventRegistrationEndTime',
    'eventStatus',
    'eventCreatorEmail',
    'eventCreatorName',
    'eventCreatorProfilePic',
    'eventTotalAttendNumber',
    'createdAt',
    'updatedAt',
  ];
};

/**
 * Validate eventSports field
 */
const validateEventSports = (eventSports) => {
  if (!eventSports) {
    return { isValid: true, error: null }; // Optional field
  }

  const sportsArray = Array.isArray(eventSports) ? eventSports : [eventSports];
  
  if (sportsArray.length === 0) {
    return { isValid: true, error: null }; // Empty array is valid
  }

  // Check if all sports are strings and non-empty
  for (const sport of sportsArray) {
    if (typeof sport !== 'string' || sport.trim().length < 2) {
      return { 
        isValid: false, 
        error: 'Each sport in eventSports must be a non-empty string with at least 2 characters' 
      };
    }
  }

  return { isValid: true, error: null };
};

/**
 * Validate eventImages field
 * Ensures maximum 5 images (optional field)
 */
const validateEventImages = (eventImages) => {
  if (!eventImages) {
    return { isValid: true, error: null }; // Optional field
  }

  const imagesArray = Array.isArray(eventImages) ? eventImages : [eventImages];
  
  if (imagesArray.length === 0) {
    return { isValid: true, error: null }; // Empty array is valid
  }

  // Check maximum 5 images
  if (imagesArray.length > 5) {
    return {
      isValid: false,
      error: 'Maximum 5 images allowed. Please provide 5 or fewer images.',
      provided: imagesArray.length,
      maxAllowed: 5,
    };
  }

  // Check if all images are strings (URLs or paths)
  for (const image of imagesArray) {
    if (typeof image !== 'string' || image.trim().length === 0) {
      return {
        isValid: false,
        error: 'Each image in eventImages must be a non-empty string (URL or path)',
      };
    }
  }

  return { isValid: true, error: null };
};

module.exports = {
  processEventData,
  formatEventResponse,
  buildEventQuery,
  getEventFieldNames,
  validateEventSports,
  validateEventImages,
  calculateEventStatus,
  calculateTimeUntilStart,
};

