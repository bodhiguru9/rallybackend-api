const PromoCode = require('../../models/PromoCode');
const Event = require('../../models/Event');
const { getPaginationParams, createPaginationResponse } = require('../../utils/pagination');
const { getDB } = require('../../config/database');

/**
 * @desc    Create a new promo code
 * @route   POST /api/promo-codes
 * @access  Private (Admin/Organiser only)
 */
const createPromoCode = async (req, res, next) => {
  try {
      const {
      code,                    // Required: Unique promo code string (e.g., "SUMMER20") - auto uppercase
      description,             // Optional: Description of the promo offer
      discountType,             // Required: "percentage" or "fixed" discount type
      discountValue,            // Required: Discount amount (0-100 for %, rupees for fixed)
      minPurchaseAmount,        // Optional: Minimum purchase amount required (default: 0)
      maxDiscountAmount,        // Optional: Max discount cap for percentage discounts
      eventIds,                 // Optional: Array of event IDs (empty = all events)
      usageLimit,               // Optional: Total usage limit across all users (null = unlimited)
      userUsageLimit,           // Optional: Per-user usage limit (default: 1)
      validFrom,                // Optional: Start date (ISO format, default: now)
      validUntil,               // Optional: Expiry date (ISO format, null = no expiry)
      isActive,                 // Optional: Active status (default: true)
    } = req.body;

    // Validation
    if (!code || !discountType || !discountValue) {
      return res.status(400).json({
        success: false,
        error: 'Code, discountType, and discountValue are required',
      });
    }

    if (!['percentage', 'fixed'].includes(discountType)) {
      return res.status(400).json({
        success: false,
        error: 'discountType must be "percentage" or "fixed"',
      });
    }

    if (discountType === 'percentage' && (discountValue < 0 || discountValue > 100)) {
      return res.status(400).json({
        success: false,
        error: 'Percentage discount must be between 0 and 100',
      });
    }

    if (discountType === 'fixed' && discountValue < 0) {
      return res.status(400).json({
        success: false,
        error: 'Fixed discount must be greater than or equal to 0',
      });
    }

    // Validate event IDs if provided
    if (eventIds && Array.isArray(eventIds) && eventIds.length > 0) {
      for (const eventId of eventIds) {
        const event = await Event.findById(eventId);
        if (!event) {
          return res.status(400).json({
            success: false,
            error: `Event not found: ${eventId}`,
          });
        }
      }
    }

    const promoCodeData = {
      code: code.trim(),
      description: description ? description.trim() : null,
      discountType,
      discountValue: parseFloat(discountValue),
      minPurchaseAmount: minPurchaseAmount ? parseFloat(minPurchaseAmount) : 0,
      maxDiscountAmount: maxDiscountAmount ? parseFloat(maxDiscountAmount) : null,
      eventIds: eventIds || [],
      usageLimit: usageLimit ? parseInt(usageLimit) : null,
      userUsageLimit: userUsageLimit ? parseInt(userUsageLimit) : 1,
      validFrom: validFrom ? new Date(validFrom) : new Date(),
      validUntil: validUntil ? new Date(validUntil) : null,
      isActive: isActive !== undefined ? isActive : true,
      createdBy: req.user.id,
    };

    const promoCode = await PromoCode.create(promoCodeData);

    res.status(201).json({
      success: true,
      message: 'Promo code created successfully',
      data: {
        promoCode: {
          promoCodeId: promoCode.promoCodeId,
          code: promoCode.code,
          description: promoCode.description,
          discountType: promoCode.discountType,
          discountValue: promoCode.discountValue,
          minPurchaseAmount: promoCode.minPurchaseAmount,
          maxDiscountAmount: promoCode.maxDiscountAmount,
          eventIds: promoCode.eventIds,
          usageLimit: promoCode.usageLimit,
          usedCount: promoCode.usedCount,
          userUsageLimit: promoCode.userUsageLimit,
          validFrom: promoCode.validFrom,
          validUntil: promoCode.validUntil,
          isActive: promoCode.isActive,
          createdAt: promoCode.createdAt,
          updatedAt: promoCode.updatedAt,
        },
      },
    });
  } catch (error) {
    if (error.message === 'Promo code already exists') {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
};

/**
 * @desc    Get all promo codes with pagination
 * @route   GET /api/promo-codes?page=1&isActive=true&eventId=xxx
 * @access  Private (Admin/Organiser only)
 * 
 * Query Parameters:
 * - page: Page number (default: 1, optional)
 * - isActive: Filter by active status (true/false, optional)
 * - eventId: Filter by event ID (optional)
 */
const getAllPromoCodes = async (req, res, next) => {
  try {
    const { isActive, eventId, page } = req.query;

    // Use pagination utils (20 items per page) - page is optional
    const { page: currentPage, perPage, skip } = getPaginationParams(page || 1, 20);

    const filters = {};
    // isActive is optional - only filter if provided
    if (isActive !== undefined && isActive !== null && isActive !== '') {
      // Handle string "true"/"false" or boolean
      if (typeof isActive === 'string') {
        filters.isActive = isActive.toLowerCase() === 'true';
      } else {
        filters.isActive = Boolean(isActive);
      }
    }
    // eventId is optional
    if (eventId) {
      filters.eventId = eventId;
    }

    // Get total count for pagination
    const db = getDB();
    const promoCodesCollection = db.collection('promoCodes');
    const { ObjectId } = require('mongodb');
    
    // Build query for count (same as findAll in PromoCode model)
    const countQuery = {};
    if (filters.isActive !== undefined) {
      countQuery.isActive = filters.isActive;
    }
    if (filters.eventId) {
      let eventObjectId;
      try {
        eventObjectId = typeof filters.eventId === 'string' ? new ObjectId(filters.eventId) : filters.eventId;
        countQuery.$or = [
          { eventIds: { $size: 0 } }, // Applies to all events
          { eventIds: eventObjectId }, // Applies to this specific event
        ];
      } catch (error) {
        // Invalid eventId format - return 0 count
        return res.status(200).json({
          success: true,
          message: 'Promo codes retrieved successfully',
          data: {
            promoCodes: [],
            pagination: createPaginationResponse(0, currentPage, perPage),
            ...(Object.keys(filters).length > 0 && { filters }),
          },
        });
      }
    }
    
    const totalCount = await promoCodesCollection.countDocuments(countQuery);

    // Get paginated promo codes using pagination utils
    const promoCodes = await PromoCode.findAll(filters, perPage, skip);

    // Create pagination response using utils
    const pagination = createPaginationResponse(totalCount, currentPage, perPage);

    res.status(200).json({
      success: true,
      message: 'Promo codes retrieved successfully',
      data: {
        promoCodes: promoCodes.map((pc) => ({
          promoCodeId: pc.promoCodeId,
          code: pc.code,
          description: pc.description,
          discountType: pc.discountType,
          discountValue: pc.discountValue,
          minPurchaseAmount: pc.minPurchaseAmount,
          maxDiscountAmount: pc.maxDiscountAmount,
          eventIds: pc.eventIds,
          usageLimit: pc.usageLimit,
          usedCount: pc.usedCount,
          userUsageLimit: pc.userUsageLimit,
          validFrom: pc.validFrom,
          validUntil: pc.validUntil,
          isActive: pc.isActive,
          createdAt: pc.createdAt,
          updatedAt: pc.updatedAt,
        })),
        pagination: pagination,
        ...(Object.keys(filters).length > 0 && { filters: filters }),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get promo code by ID
 * @route   GET /api/promo-codes/:id
 * @access  Private (Admin/Organiser only)
 */
const getPromoCodeById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const promoCode = await PromoCode.findById(id);
    if (!promoCode) {
      return res.status(404).json({
        success: false,
        error: 'Promo code not found',
      });
    }

    res.status(200).json({
      success: true,
      data: {
        promoCode: {
          promoCodeId: promoCode.promoCodeId,
          code: promoCode.code,
          description: promoCode.description,
          discountType: promoCode.discountType,
          discountValue: promoCode.discountValue,
          minPurchaseAmount: promoCode.minPurchaseAmount,
          maxDiscountAmount: promoCode.maxDiscountAmount,
          eventIds: promoCode.eventIds,
          usageLimit: promoCode.usageLimit,
          usedCount: promoCode.usedCount,
          userUsageLimit: promoCode.userUsageLimit,
          validFrom: promoCode.validFrom,
          validUntil: promoCode.validUntil,
          isActive: promoCode.isActive,
          createdAt: promoCode.createdAt,
          updatedAt: promoCode.updatedAt,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update promo code
 * @route   PUT /api/promo-codes/:id
 * @access  Private (Admin/Organiser only)
 */
const updatePromoCode = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = {};

    // Support both camelCase and snake_case field names, and handle form-data
    const body = req.body || {};
    
    // Debug: Log what we received
    console.log('Update Promo Code Request:', {
      id: id,
      body: body,
      bodyKeys: Object.keys(body),
      contentType: req.headers['content-type'],
    });

    const promoCode = await PromoCode.findById(id);
    if (!promoCode) {
      return res.status(404).json({
        success: false,
        error: 'Promo code not found',
      });
    }

    // Support both camelCase and snake_case field names
    const description = body.description || body.description_text;
    const discountType = body.discountType || body.discount_type;
    const discountValue = body.discountValue || body.discount_value;
    const minPurchaseAmount = body.minPurchaseAmount || body.min_purchase_amount;
    const maxDiscountAmount = body.maxDiscountAmount || body.max_discount_amount;
    const eventIds = body.eventIds || body.event_ids;
    const usageLimit = body.usageLimit || body.usage_limit;
    const userUsageLimit = body.userUsageLimit || body.user_usage_limit;
    const validFrom = body.validFrom || body.valid_from;
    const validUntil = body.validUntil || body.valid_until;
    const isActive = body.isActive !== undefined ? body.isActive : body.is_active;

    // Note: 'code' field cannot be updated - promo codes are immutable once created
    if ('code' in body) {
      return res.status(400).json({
        success: false,
        error: 'Cannot update promo code',
        message: 'The "code" field cannot be updated. Promo codes are immutable once created. To change the code, create a new promo code instead.',
      });
    }

    // Allow updating these fields - check if field exists in request body
    if (description !== undefined) {
      updateData.description = description ? String(description).trim() : null;
    }
    if (discountType !== undefined) {
      if (!['percentage', 'fixed'].includes(String(discountType))) {
        return res.status(400).json({
          success: false,
          error: 'discountType must be "percentage" or "fixed"',
        });
      }
      updateData.discountType = String(discountType);
    }
    if (discountValue !== undefined) {
      const discountValueNum = parseFloat(discountValue);
      if (isNaN(discountValueNum)) {
        return res.status(400).json({
          success: false,
          error: 'discountValue must be a valid number',
        });
      }
      updateData.discountValue = discountValueNum;
    }
    if (minPurchaseAmount !== undefined) {
      const minAmount = parseFloat(minPurchaseAmount);
      if (isNaN(minAmount) || minAmount < 0) {
        return res.status(400).json({
          success: false,
          error: 'minPurchaseAmount must be a valid number >= 0',
        });
      }
      updateData.minPurchaseAmount = minAmount;
    }
    if (maxDiscountAmount !== undefined) {
      if (maxDiscountAmount === null || maxDiscountAmount === '') {
        updateData.maxDiscountAmount = null;
      } else {
        const maxAmount = parseFloat(maxDiscountAmount);
        if (isNaN(maxAmount) || maxAmount < 0) {
          return res.status(400).json({
            success: false,
            error: 'maxDiscountAmount must be a valid number >= 0 or null',
          });
        }
        updateData.maxDiscountAmount = maxAmount;
      }
    }
    if (eventIds !== undefined) {
      // Validate event IDs if provided
      const eventIdsArray = Array.isArray(eventIds) ? eventIds : (eventIds ? [eventIds] : []);
      if (eventIdsArray.length > 0) {
        for (const eventId of eventIdsArray) {
          const event = await Event.findById(eventId);
          if (!event) {
            return res.status(400).json({
              success: false,
              error: `Event not found: ${eventId}`,
            });
          }
        }
        updateData.eventIds = eventIdsArray;
      } else {
        updateData.eventIds = [];
      }
    }
    if (usageLimit !== undefined) {
      if (usageLimit === null || usageLimit === '') {
        updateData.usageLimit = null;
      } else {
        const limit = parseInt(usageLimit);
        if (isNaN(limit) || limit < 0) {
          return res.status(400).json({
            success: false,
            error: 'usageLimit must be a valid number >= 0 or null',
          });
        }
        updateData.usageLimit = limit;
      }
    }
    if (userUsageLimit !== undefined) {
      const userLimit = parseInt(userUsageLimit);
      if (isNaN(userLimit) || userLimit < 1) {
        return res.status(400).json({
          success: false,
          error: 'userUsageLimit must be a valid number >= 1',
        });
      }
      updateData.userUsageLimit = userLimit;
    }
    if (validFrom !== undefined) {
      if (validFrom) {
        const date = new Date(validFrom);
        if (isNaN(date.getTime())) {
          return res.status(400).json({
            success: false,
            error: 'validFrom must be a valid date',
          });
        }
        updateData.validFrom = date;
      } else {
        updateData.validFrom = new Date();
      }
    }
    if (validUntil !== undefined) {
      if (validUntil === null || validUntil === '') {
        updateData.validUntil = null;
      } else {
        const date = new Date(validUntil);
        if (isNaN(date.getTime())) {
          return res.status(400).json({
            success: false,
            error: 'validUntil must be a valid date or null',
          });
        }
        updateData.validUntil = date;
      }
    }
    if (isActive !== undefined) {
      // Handle boolean values properly (true/false, "true"/"false", 1/0)
      if (typeof isActive === 'string') {
        updateData.isActive = isActive.toLowerCase() === 'true' || isActive === '1';
      } else {
        updateData.isActive = Boolean(isActive);
      }
    }

    // Debug: Log updateData before checking
    console.log('Update Data Prepared:', updateData);

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields provided to update',
        message: 'Please provide at least one valid field to update',
        receivedFields: Object.keys(req.body || {}),
        updatableFields: [
          'description',
          'discountType',
          'discountValue',
          'minPurchaseAmount',
          'maxDiscountAmount',
          'eventIds',
          'usageLimit',
          'userUsageLimit',
          'validFrom',
          'validUntil',
          'isActive'
        ],
        note: 'The "code" field cannot be updated. Promo codes are immutable once created.',
      });
    }

    const updated = await PromoCode.updateById(id, updateData);
    if (!updated) {
      return res.status(400).json({
        success: false,
        error: 'Failed to update promo code',
      });
    }

    const updatedPromoCode = await PromoCode.findById(id);

    res.status(200).json({
      success: true,
      message: 'Promo code updated successfully',
      data: {
        promoCode: {
          promoCodeId: updatedPromoCode.promoCodeId,
          code: updatedPromoCode.code,
          description: updatedPromoCode.description,
          discountType: updatedPromoCode.discountType,
          discountValue: updatedPromoCode.discountValue,
          minPurchaseAmount: updatedPromoCode.minPurchaseAmount,
          maxDiscountAmount: updatedPromoCode.maxDiscountAmount,
          eventIds: updatedPromoCode.eventIds,
          usageLimit: updatedPromoCode.usageLimit,
          usedCount: updatedPromoCode.usedCount,
          userUsageLimit: updatedPromoCode.userUsageLimit,
          validFrom: updatedPromoCode.validFrom,
          validUntil: updatedPromoCode.validUntil,
          isActive: updatedPromoCode.isActive,
          createdAt: updatedPromoCode.createdAt,
          updatedAt: updatedPromoCode.updatedAt,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete promo code
 * @route   DELETE /api/promo-codes/:id
 * @access  Private (Admin/Organiser only)
 */
const deletePromoCode = async (req, res, next) => {
  try {
    const { id } = req.params;

    const promoCode = await PromoCode.findById(id);
    if (!promoCode) {
      return res.status(404).json({
        success: false,
        error: 'Promo code not found',
      });
    }

    const deleted = await PromoCode.deleteById(id);
    if (!deleted) {
      return res.status(400).json({
        success: false,
        error: 'Failed to delete promo code',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Promo code deleted successfully',
      data: {
        promoCodeId: promoCode.promoCodeId,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Validate promo code
 * @route   POST /api/promo-codes/validate
 * @access  Public
 */
const validatePromoCode = async (req, res, next) => {
  try {
    const { code, eventId, amount } = req.body;

    if (!code || !eventId || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Code, eventId, and amount are required',
      });
    }

    const userId = req.user ? req.user.id : null;
    const validation = await PromoCode.validateAndApply(code, eventId, userId, parseFloat(amount));

    res.status(200).json({
      success: true,
      message: 'Promo code is valid',
      data: {
        promoCode: {
          code: validation.promoCode.code,
          description: validation.promoCode.description,
          discountType: validation.promoCode.discountType,
          discountValue: validation.promoCode.discountValue,
        },
        originalAmount: parseFloat(amount),
        discountAmount: validation.discountAmount,
        finalAmount: validation.finalAmount,
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message || 'Invalid promo code',
    });
  }
};

module.exports = {
  createPromoCode,
  getAllPromoCodes,
  getPromoCodeById,
  updatePromoCode,
  deletePromoCode,
  validatePromoCode,
};

