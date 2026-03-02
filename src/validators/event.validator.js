/**
 * Validate event creation/update data
 */
const validateEvent = (data, isUpdate = false) => {
  const errors = [];
  const { validateEventSports } = require('../utils/eventFields');

  // Event name validation
  if (!isUpdate && (!data.eventName || data.eventName.trim().length < 2)) {
    errors.push('Event name is required (minimum 2 characters)');
  } else if (data.eventName && data.eventName.trim().length < 2) {
    errors.push('Event name must be at least 2 characters');
  }

  // Event type validation
  if (!isUpdate && (!data.eventType || data.eventType.trim().length < 2)) {
    errors.push('Event type is required (e.g., social, tournament, class)');
  }

  // Event sports validation (optional field)
  if (data.eventSports !== undefined) {
    const sportsValidation = validateEventSports(data.eventSports);
    if (!sportsValidation.isValid) {
      errors.push(sportsValidation.error);
    }
  }

  // Event date time validation
  if (!isUpdate && !data.eventDateTime) {
    errors.push('Event date and time is required');
  } else if (data.eventDateTime) {
    const eventDate = new Date(data.eventDateTime);
    if (isNaN(eventDate.getTime())) {
      errors.push('Invalid event date and time format');
    }
  }

  // Event end date time validation (optional)
  if (data.eventEndDateTime) {
    const endDate = new Date(data.eventEndDateTime);
    if (isNaN(endDate.getTime())) {
      errors.push('Invalid event end date and time format');
    } else if (data.eventDateTime) {
      const startDate = new Date(data.eventDateTime);
      if (!isNaN(startDate.getTime()) && endDate < startDate) {
        errors.push('Event end date and time must be after start date and time');
      }
    }
  }

  // Event frequency validation (optional, but if provided should be an array)
  if (data.eventFrequency !== undefined && data.eventFrequency !== null) {
    if (!Array.isArray(data.eventFrequency)) {
      errors.push('Event frequency must be an array');
    } else {
      // Validate each frequency value is a string or valid value
      for (const freq of data.eventFrequency) {
        if (typeof freq !== 'string' || freq.trim().length === 0) {
          errors.push('Each frequency value in eventFrequency must be a non-empty string');
          break;
        }
      }
    }
  }

  // Event location validation
  if (!isUpdate && (!data.eventLocation || data.eventLocation.trim().length < 3)) {
    errors.push('Event location is required (minimum 3 characters)');
  }

  // Registration times validation (optional)
  if (data.eventRegistrationStartTime) {
    const regStartDate = new Date(data.eventRegistrationStartTime);
    if (isNaN(regStartDate.getTime())) {
      errors.push('Invalid eventRegistrationStartTime format');
    }
  }

  if (data.eventRegistrationEndTime) {
    const regEndDate = new Date(data.eventRegistrationEndTime);
    if (isNaN(regEndDate.getTime())) {
      errors.push('Invalid eventRegistrationEndTime format');
    }
  }

  // Validate registration time range
  if (data.eventRegistrationStartTime && data.eventRegistrationEndTime) {
    const regStartDate = new Date(data.eventRegistrationStartTime);
    const regEndDate = new Date(data.eventRegistrationEndTime);
    if (!isNaN(regStartDate.getTime()) && !isNaN(regEndDate.getTime()) && regEndDate < regStartDate) {
      errors.push('eventRegistrationEndTime must be after or equal to eventRegistrationStartTime');
    }
  }

  // Event gender validation (optional)
  if (data.eventGender && data.eventGender.trim().length > 0) {
    const validGenders = ['male', 'female', 'all'];
    if (!validGenders.includes(data.eventGender.trim().toLowerCase())) {
      errors.push('Event gender must be one of: male, female, all');
    }
  }

  // Event sports level validation (optional)
  if (data.eventSportsLevel && data.eventSportsLevel.trim().length > 0) {
    const validLevels = ['beginner', 'intermediate', 'advanced', 'all'];
    if (!validLevels.includes(data.eventSportsLevel.trim().toLowerCase())) {
      errors.push('Event sports level must be one of: beginner, intermediate, advanced, all');
    }
  }

  // Event min age validation (optional)
  if (data.eventMinAge !== undefined && data.eventMinAge !== null) {
    if (isNaN(data.eventMinAge) || data.eventMinAge < 0 || data.eventMinAge > 150) {
      errors.push('Event min age must be a valid number between 0 and 150');
    }
  }

  // Event max age validation (optional)
  if (data.eventMaxAge !== undefined && data.eventMaxAge !== null) {
    if (isNaN(data.eventMaxAge) || data.eventMaxAge < 0 || data.eventMaxAge > 150) {
      errors.push('Event max age must be a valid number between 0 and 150');
    }
  }

  // Validate age range
  if (data.eventMinAge !== undefined && data.eventMaxAge !== undefined && 
      data.eventMinAge !== null && data.eventMaxAge !== null) {
    if (data.eventMaxAge < data.eventMinAge) {
      errors.push('Event max age must be greater than or equal to event min age');
    }
  }

  // Event max guest validation
  if (!isUpdate && (!data.eventMaxGuest || isNaN(data.eventMaxGuest) || data.eventMaxGuest < 1)) {
    errors.push('Event max guest must be a positive number');
  }

  // Event price per guest validation (optional but if provided must be valid)
  if (data.eventPricePerGuest !== undefined && data.eventPricePerGuest !== null) {
    if (isNaN(data.eventPricePerGuest) || data.eventPricePerGuest < 0) {
      errors.push('Event price per guest must be a non-negative number');
    }
  }

  // Boolean fields validation
  if (data.IsPrivateEvent !== undefined && typeof data.IsPrivateEvent !== 'boolean' && 
      data.IsPrivateEvent !== 'true' && data.IsPrivateEvent !== 'false' &&
      data.isPrivateEvent !== 'true' && data.isPrivateEvent !== 'false') {
    errors.push('IsPrivateEvent must be a boolean (true or false)');
  }

  if (data.eventOurGuestAllowed !== undefined && typeof data.eventOurGuestAllowed !== 'boolean' && 
      data.eventOurGuestAllowed !== 'true' && data.eventOurGuestAllowed !== 'false') {
    errors.push('eventOurGuestAllowed must be a boolean (true or false)');
  }

  if (data.eventApprovalReq !== undefined && typeof data.eventApprovalReq !== 'boolean' && 
      data.eventApprovalReq !== 'true' && data.eventApprovalReq !== 'false') {
    errors.push('eventApprovalReq must be a boolean (true or false)');
  }

  if (data.eventDisallow !== undefined && typeof data.eventDisallow !== 'boolean' && 
      data.eventDisallow !== 'true' && data.eventDisallow !== 'false' &&
      data.disallow !== 'true' && data.disallow !== 'false') {
    errors.push('eventDisallow must be a boolean (true or false)');
  }

  if (data.eventApprovalRequired !== undefined && typeof data.eventApprovalRequired !== 'boolean' && 
      data.eventApprovalRequired !== 'true' && data.eventApprovalRequired !== 'false' &&
      data.approvalRequired !== 'true' && data.approvalRequired !== 'false') {
    errors.push('eventApprovalRequired must be a boolean (true or false)');
  }

  // policyJoind accepts any value (string, number, etc.) - no strict type validation

  // Event creator name validation (optional - will be auto-filled from organiser profile)
  if (data.eventCreatorName && data.eventCreatorName.trim().length < 2) {
    errors.push('Event creator name must be at least 2 characters if provided');
  }

  // Event status validation (optional - can be draft, past, ongoing, upcoming, completed, cancelled)
  if (data.eventStatus && !['draft', 'past', 'ongoing', 'upcoming', 'completed', 'cancelled'].includes(data.eventStatus)) {
    errors.push('Event status must be one of: draft, past, ongoing, upcoming, completed, cancelled');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validate event filters
 */
const validateEventFilters = (filters) => {
  const errors = [];

  // Event sports filter validation
  if (filters.eventSports) {
    const { validateEventSports } = require('../utils/eventFields');
    const sportsValidation = validateEventSports(filters.eventSports);
    if (!sportsValidation.isValid) {
      errors.push(sportsValidation.error);
    }
  }

  if (filters.eventCreatorName && filters.eventCreatorName.trim().length < 2) {
    errors.push('Event creator name filter must be at least 2 characters');
  }

  if (filters.eventType && filters.eventType.trim().length < 2) {
    errors.push('Event type filter must be at least 2 characters');
  }

  if (filters.IsPrivateEvent !== undefined && typeof filters.IsPrivateEvent !== 'boolean' && 
      filters.IsPrivateEvent !== 'true' && filters.IsPrivateEvent !== 'false' &&
      filters.isPrivateEvent !== 'true' && filters.isPrivateEvent !== 'false') {
    errors.push('IsPrivateEvent filter must be a boolean (true or false)');
  }

  if (filters.eventStatus && !['draft', 'past', 'ongoing', 'upcoming', 'completed', 'cancelled'].includes(filters.eventStatus)) {
    errors.push('Event status filter must be one of: draft, past, ongoing, upcoming, completed, cancelled');
  }

  // Date filter validation
  if (filters.startDate) {
    const startDate = new Date(filters.startDate);
    if (isNaN(startDate.getTime())) {
      errors.push('Invalid startDate format. Use ISO format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss');
    }
  }

  if (filters.endDate) {
    const endDate = new Date(filters.endDate);
    if (isNaN(endDate.getTime())) {
      errors.push('Invalid endDate format. Use ISO format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss');
    }
  }

  // Validate date range (endDate should be after startDate)
  if (filters.startDate && filters.endDate) {
    const startDate = new Date(filters.startDate);
    const endDate = new Date(filters.endDate);
    if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime()) && endDate < startDate) {
      errors.push('endDate must be after or equal to startDate');
    }
  }

  // SortBy validation
  if (filters.sortBy && !['date', 'created'].includes(filters.sortBy)) {
    errors.push('sortBy must be either "date" (sort by eventDateTime) or "created" (sort by createdAt)');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

module.exports = {
  validateEvent,
  validateEventFilters,
};

