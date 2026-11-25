/**
 * Pure validation helpers for promo code input (no DB access).
 * Used by the PromoCode model and, later, by organiser/admin controllers.
 * Error messages use AED (not rupees).
 */

const CODE_REGEX = /^[A-Z0-9]{3,20}$/;
const DISCOUNT_TYPES = ['percentage', 'fixed']; // 'fixed' is still a valid STORED type for old records, but can't be created or edited to
const MIN_PERCENT = 1;
const MAX_PERCENT = 99;
const FUNDED_BY = ['rally', 'organiser'];
const OWNER_TYPES = ['admin', 'organiser'];
const ELIGIBILITY = ['everyone', 'first_booking', 'subscribers'];
const APPLIES_TO = ['events', 'packages', 'both'];

const isNil = (v) => v === null || v === undefined;
const isPositiveInteger = (v) => Number.isInteger(v) && v >= 1;

/**
 * Validate promo code input.
 * @param {object} data - fields to validate
 * @param {{partial?: boolean}} [opts] - partial=true (edits): only validate fields that are present
 * @returns {string[]} list of error messages (empty = valid)
 */
function validatePromoCodeInput(data, opts = {}) {
  const partial = !!opts.partial;
  const errors = [];
  const has = (k) => Object.prototype.hasOwnProperty.call(data, k);
  const check = (k) => !partial || has(k);

  if (check('code')) {
    const code = typeof data.code === 'string' ? data.code.toUpperCase() : '';
    if (!CODE_REGEX.test(code)) {
      errors.push('Code must be 3-20 letters or numbers (no spaces or symbols)');
    }
  }

  // Business rule (M7): new and edited codes are percentage-only, 1-99%.
  // Fixed-AED and 100% codes are rejected here; the pricing service still handles them defensively for old data.
  if (check('discountType') && data.discountType !== 'percentage') {
    errors.push('Only percentage discounts are supported');
  }

  if (check('discountValue')) {
    const v = data.discountValue;
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      errors.push('discountValue must be a number');
    } else if (v < MIN_PERCENT || v > MAX_PERCENT) {
      errors.push('Discount must be between 1 and 99%');
    }
  }

  if (has('usageLimit') && !isNil(data.usageLimit) && !isPositiveInteger(data.usageLimit)) {
    errors.push('usageLimit must be null (no limit) or a whole number of at least 1');
  }
  if (has('userUsageLimit') && !isNil(data.userUsageLimit) && !isPositiveInteger(data.userUsageLimit)) {
    errors.push('userUsageLimit must be null (unlimited) or a whole number of at least 1');
  }

  if (has('minPurchaseAmount') && !isNil(data.minPurchaseAmount)) {
    if (typeof data.minPurchaseAmount !== 'number' || data.minPurchaseAmount < 0) {
      errors.push('minPurchaseAmount must be 0 AED or more');
    }
  }
  if (has('maxDiscountAmount') && !isNil(data.maxDiscountAmount)) {
    if (typeof data.maxDiscountAmount !== 'number' || data.maxDiscountAmount <= 0) {
      errors.push('maxDiscountAmount must be greater than 0 AED');
    }
  }

  if (has('validFrom') && !isNil(data.validFrom) && Number.isNaN(new Date(data.validFrom).getTime())) {
    errors.push('validFrom must be a valid date');
  }
  if (has('validUntil') && !isNil(data.validUntil)) {
    if (Number.isNaN(new Date(data.validUntil).getTime())) {
      errors.push('validUntil must be a valid date or null (no end date)');
    } else if (!isNil(data.validFrom) && new Date(data.validUntil) <= new Date(data.validFrom)) {
      errors.push('validUntil must be after validFrom');
    }
  }

  if (has('fundedBy') && !FUNDED_BY.includes(data.fundedBy)) {
    errors.push('fundedBy must be \'rally\' or \'organiser\'');
  }
  if (has('ownerType') && !OWNER_TYPES.includes(data.ownerType)) {
    errors.push('ownerType must be \'admin\' or \'organiser\'');
  }
  if (has('eligibility') && !ELIGIBILITY.includes(data.eligibility)) {
    errors.push('eligibility must be \'everyone\', \'first_booking\' or \'subscribers\'');
  }
  if (has('appliesTo') && !APPLIES_TO.includes(data.appliesTo)) {
    errors.push('appliesTo must be \'events\', \'packages\' or \'both\'');
  }
  if (has('sports') && !(Array.isArray(data.sports) && data.sports.every((s) => typeof s === 'string'))) {
    errors.push('sports must be an array of sport names (empty = all sports)');
  }

  // Rule: subscribers eligibility is not allowed on admin (Rally-funded) codes
  const ownerType = data.ownerType;
  if (data.eligibility === 'subscribers' && ownerType === 'admin') {
    errors.push('Admin codes can\'t use \'subscribers\' eligibility');
  }

  return errors;
}

module.exports = {
  validatePromoCodeInput,
  CODE_REGEX,
  DISCOUNT_TYPES,
  FUNDED_BY,
  OWNER_TYPES,
  ELIGIBILITY,
  APPLIES_TO,
};
