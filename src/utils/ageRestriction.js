/**
 * Age restriction helpers for events (eventMinAge / eventMaxAge).
 *
 * Rules:
 * - If both min/max are null/undefined -> no restriction
 * - If a restriction exists but user dob is missing/invalid -> block
 * - Age is calculated in full years as of "today" (server time)
 */

function toIntOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = typeof value === 'number' ? value : parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function calculateAge(dob, referenceDate = new Date()) {
  if (!dob) return null;
  const birthDate = dob instanceof Date ? dob : new Date(dob);
  if (Number.isNaN(birthDate.getTime())) return null;

  const ref = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  if (Number.isNaN(ref.getTime())) return null;

  let age = ref.getFullYear() - birthDate.getFullYear();
  const m = ref.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

/**
 * Validate if user's age is allowed to join/book the event.
 * @returns {{ allowed: boolean, age: number|null, minAge: number|null, maxAge: number|null, message?: string, code?: string }}
 */
function validateAgeForEvent(userDob, eventMinAge, eventMaxAge) {
  const minAge = toIntOrNull(eventMinAge);
  const maxAge = toIntOrNull(eventMaxAge);

  // No restrictions
  if (minAge === null && maxAge === null) {
    return { allowed: true, age: null, minAge, maxAge };
  }

  const age = calculateAge(userDob);
  if (age === null) {
    return {
      allowed: false,
      age: null,
      minAge,
      maxAge,
      code: 'DOB_REQUIRED',
      message: 'Date of birth is required to join this event',
    };
  }

  if (minAge !== null && age < minAge) {
    return {
      allowed: false,
      age,
      minAge,
      maxAge,
      code: 'AGE_UNDER_MIN',
      message: `Your age is under the minimum required age (${minAge}) for this event`,
    };
  }

  if (maxAge !== null && age > maxAge) {
    return {
      allowed: false,
      age,
      minAge,
      maxAge,
      code: 'AGE_OVER_MAX',
      message: `Your age is over the maximum allowed age (${maxAge}) for this event`,
    };
  }

  return { allowed: true, age, minAge, maxAge };
}

module.exports = {
  calculateAge,
  validateAgeForEvent,
};

