/**
 * Write-side rules for creating and editing promo codes, shared by the organiser API and (M5) the admin API.
 * Controllers stay thin: they authenticate, call these helpers, and shape the HTTP response.
 */
const { ObjectId } = require('mongodb');
const { getDB } = require('../config/database');
const { validatePromoCodeInput } = require('../utils/promoCodeValidation');

class ManagementError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code || null;
  }
}

// Fields a caller may send when creating a code. Anything else (fundedBy, ownerId, usedCount...) is ignored.
const CREATE_FIELDS = [
  'code', 'description', 'discountType', 'discountValue', 'minPurchaseAmount', 'maxDiscountAmount',
  'usageLimit', 'userUsageLimit', 'validFrom', 'validUntil', 'sports', 'appliesTo', 'eventIds', 'packageIds',
  'eligibility', 'notifyOnCreate', 'isActive',
];

// Always editable. code / discountType / discountValue are editable only while the code has no live redemptions.
const ALWAYS_EDITABLE = [
  'description', 'usageLimit', 'userUsageLimit', 'validUntil', 'eligibility', 'sports',
  'eventIds', 'packageIds', 'minPurchaseAmount', 'maxDiscountAmount',
];
const LOCKED_WHEN_USED = ['code', 'discountType', 'discountValue'];

const pick = (obj, keys) => {
  const out = {};
  for (const k of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k) && obj[k] !== undefined) {
      out[k] = obj[k];
    }
  }
  return out;
};

const num = (v) => (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : v);

/** Coerce numeric strings (form data) to numbers; "" stays as given. */
function coerce(data) {
  const out = { ...data };
  for (const k of ['discountValue', 'minPurchaseAmount', 'maxDiscountAmount', 'usageLimit', 'userUsageLimit']) {
    if (k in out && out[k] !== null) {
      out[k] = num(out[k]);
    }
  }
  if ('notifyOnCreate' in out) {
    out.notifyOnCreate = out.notifyOnCreate === true || out.notifyOnCreate === 'true';
  }
  for (const k of ['validFrom', 'validUntil']) {
    if (k in out && out[k] === '') {
      out[k] = null;
    }
  }
  if ('code' in out && typeof out.code === 'string') {
    out.code = out.code.trim().toUpperCase();
  }
  return out;
}

const toIds = (list) => (Array.isArray(list) ? list : []).map((id) => {
  try {
    return new ObjectId(String(id));
  } catch (e) {
    throw new ManagementError(400, `Invalid id: ${id}`);
  }
});

/**
 * Event/package ids must exist and (for organiser codes) belong to the owner.
 * @param {ObjectId|null} ownerId null = admin (no ownership restriction)
 */
async function assertScope({ eventIds = [], packageIds = [] }, ownerId) {
  const db = getDB();
  if (eventIds.length > 0) {
    const filter = { _id: { $in: eventIds } };
    if (ownerId) {
      filter.creatorId = { $in: [ownerId, String(ownerId)] };
    }
    const found = await db.collection('events').countDocuments(filter);
    if (found !== eventIds.length) {
      throw new ManagementError(400, ownerId ? 'One or more events were not found among your events' : 'One or more events were not found');
    }
  }
  if (packageIds.length > 0) {
    const filter = { _id: { $in: packageIds } };
    if (ownerId) {
      filter.organiserId = { $in: [ownerId, String(ownerId)] };
    }
    const found = await db.collection('packages').countDocuments(filter);
    if (found !== packageIds.length) {
      throw new ManagementError(400, ownerId ? 'One or more packages were not found among your packages' : 'One or more packages were not found');
    }
  }
}

/**
 * Build the document fields for a new code from a request body.
 * @param {object} body request body
 * @param {{fundedBy: 'rally'|'organiser', ownerType: 'admin'|'organiser', ownerId: ObjectId|null, createdBy: *}} owner
 */
async function buildCreateData(body, owner) {
  const data = coerce(pick(body, CREATE_FIELDS));

  const errors = validatePromoCodeInput({ ...data, ownerType: owner.ownerType });
  if (errors.length > 0) {
    throw new ManagementError(400, errors.join('; '), 'VALIDATION');
  }

  const eventIds = toIds(data.eventIds);
  const packageIds = toIds(data.packageIds);
  await assertScope({ eventIds, packageIds }, owner.ownerId);

  return {
    ...data,
    eventIds,
    packageIds,
    usageLimit: data.usageLimit ?? null,
    userUsageLimit: data.userUsageLimit === undefined ? 1 : data.userUsageLimit,
    validFrom: data.validFrom ? new Date(data.validFrom) : new Date(),
    validUntil: data.validUntil ? new Date(data.validUntil) : null,
    fundedBy: owner.fundedBy,
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
    createdBy: owner.createdBy,
  };
}

/** Does the code have reserved (not expired) or confirmed redemptions? */
async function hasLiveRedemptions(promoCodeId) {
  const now = new Date();
  const n = await getDB().collection('promoRedemptions').countDocuments({
    promoCodeId,
    $or: [{ status: 'confirmed' }, { status: 'reserved', expiresAt: { $gt: now } }],
  });
  return n > 0;
}

/**
 * Validate an edit and return the $set document. Throws ManagementError (400 validation, 409 locked).
 * @param {object} code the stored promo code
 * @param {object} body request body
 * @param {ObjectId|null} ownerId scope check for event/package ids (null for admin)
 */
async function buildEditUpdate(code, body, ownerId) {
  const input = coerce(pick(body, [...ALWAYS_EDITABLE, ...LOCKED_WHEN_USED]));
  if (Object.keys(input).length === 0) {
    throw new ManagementError(400, 'No editable fields were provided');
  }

  const lockedKeys = LOCKED_WHEN_USED.filter((k) => k in input && input[k] !== code[k]);
  if (lockedKeys.length > 0 && (await hasLiveRedemptions(code._id))) {
    throw new ManagementError(409, `${lockedKeys.join(', ')} can't be changed once the code has been used`, 'CODE_LOCKED');
  }

  // Validate the merged result so cross-field rules hold (percentage range, validUntil > validFrom...).
  // The code string is only checked when it is being changed (older codes may not match the new format).
  const merged = { ...code, ...input };
  const toValidate = {
    discountType: merged.discountType,
    discountValue: merged.discountValue,
    usageLimit: merged.usageLimit,
    userUsageLimit: merged.userUsageLimit,
    minPurchaseAmount: merged.minPurchaseAmount,
    maxDiscountAmount: merged.maxDiscountAmount,
    validFrom: merged.validFrom,
    validUntil: merged.validUntil,
    eligibility: merged.eligibility,
    sports: merged.sports,
    ownerType: code.ownerType,
  };
  if ('code' in input) {
    toValidate.code = input.code;
  }
  const errors = validatePromoCodeInput(toValidate, { partial: true });
  if (errors.length > 0) {
    throw new ManagementError(400, errors.join('; '), 'VALIDATION');
  }
  if ('usageLimit' in input && input.usageLimit !== null && input.usageLimit < (code.usedCount || 0)) {
    throw new ManagementError(400, `usageLimit can't be below the ${code.usedCount} uses already counted`, 'VALIDATION');
  }

  const set = { ...input };
  if ('validUntil' in set) {
    set.validUntil = set.validUntil ? new Date(set.validUntil) : null;
  }
  if ('eventIds' in set || 'packageIds' in set) {
    const eventIds = 'eventIds' in set ? toIds(set.eventIds) : [];
    const packageIds = 'packageIds' in set ? toIds(set.packageIds) : [];
    await assertScope({ eventIds, packageIds }, ownerId);
    if ('eventIds' in set) {
      set.eventIds = eventIds;
    }
    if ('packageIds' in set) {
      set.packageIds = packageIds;
    }
  }
  if ('code' in set && set.code !== code.code) {
    const clash = await getDB().collection('promoCodes').findOne({ code: set.code, archivedAt: null, _id: { $ne: code._id } });
    if (clash) {
      throw new ManagementError(409, 'Promo code already exists', 'CODE_EXISTS');
    }
  }
  set.updatedAt = new Date();
  return set;
}

module.exports = {
  ManagementError,
  buildCreateData,
  buildEditUpdate,
  hasLiveRedemptions,
  CREATE_FIELDS,
  ALWAYS_EDITABLE,
  LOCKED_WHEN_USED,
};
