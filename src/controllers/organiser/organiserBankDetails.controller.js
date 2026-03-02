const OrganiserBankDetails = require('../../models/OrganiserBankDetails');
const User = require('../../models/User');

/**
 * @desc    Save or update Organiser bank details/KYC
 * @route   POST /api/organizers/bank-details or POST /api/organizers/:organizerId/bank-details
 * @access  Private (Organiser only)
 */
const saveBankDetails = async (req, res, next) => {
  try {
    const currentUserSeqId = req.user.userId; // Sequential userId from authenticated user
    const {
      organizerId: bodyOrganizerId,
      country,
      bankName,
      iban,
      emiratesId,
      accountNumber,
      ifscCode,
      accountHolderName,
      aadhaar,
      documentFront,
      documentBack,
      DocumentFront,
      DocumentBack,
    } = req.body;
    const { organizerId: paramOrganizerId } = req.params;

    // Verify user is an Organiser
    if (req.user.userType !== 'organiser') {
      return res.status(403).json({
        success: false,
        error: 'Only organisers can save bank details',
      });
    }

    // Determine which Organiser ID to use:
    // Priority: params > body > authenticated user
    let targetOrganizerId = paramOrganizerId || bodyOrganizerId;
    let organizerUserId = currentUserSeqId; // Default to authenticated user's sequential userId

    if (targetOrganizerId) {
      // If organizerId is provided manually, verify it exists and user has permission
      let organizer;
      
      // Try to find by sequential userId first
      const userBySeqId = await User.findByUserId(targetOrganizerId);
      if (userBySeqId) {
        organizer = userBySeqId;
      } else {
        // Try as ObjectId
        organizer = await User.findById(targetOrganizerId);
      }

      if (!organizer) {
        return res.status(404).json({
          success: false,
          error: 'Organiser not found',
        });
      }

      // Verify Organiser type
      if (organizer.userType !== 'organiser') {
        return res.status(400).json({
          success: false,
          error: 'User is not an Organiser',
        });
      }

      organizerUserId = organizer.userId; // Use sequential userId

      // Security: Users can only save bank details for themselves
      if (organizerUserId !== currentUserSeqId) {
        return res.status(403).json({
          success: false,
          error: 'You can only save bank details for your own account',
        });
      }
    }
    // If no organizerId provided, use authenticated user's sequential userId (already set as default)

    // Prepare bank details data based on country
    const bankDetailsData = {
      country,
    };

    if (country === 'UAE') {
      bankDetailsData.bankName = bankName;
      bankDetailsData.iban = iban;
      bankDetailsData.emiratesId = emiratesId;
      bankDetailsData.documentFront = documentFront || DocumentFront || null;
      bankDetailsData.documentBack = documentBack || DocumentBack || null;
    } else if (country === 'India') {
      bankDetailsData.bankName = bankName;
      bankDetailsData.accountNumber = accountNumber;
      bankDetailsData.ifscCode = ifscCode;
      bankDetailsData.accountHolderName = accountHolderName;
      bankDetailsData.aadhaar = aadhaar;
    } else {
      return res.status(400).json({
        success: false,
        error: 'Country must be either "UAE" or "India"',
      });
    }

    // Save or update bank details
    const bankDetails = await OrganiserBankDetails.upsert(organizerUserId, bankDetailsData);

    // Format response based on country
    const responseData = {
      bankDetailsId: bankDetails.bankDetailsId || null,
      organizerId: organizerUserId,
      country: bankDetails.country,
      createdAt: bankDetails.createdAt,
      updatedAt: bankDetails.updatedAt,
    };

    if (bankDetails.country === 'UAE') {
      responseData.bankName = bankDetails.bankName;
      responseData.iban = bankDetails.iban;
      responseData.emiratesId = bankDetails.emiratesId;
      responseData.documentFront = bankDetails.documentFront || null;
      responseData.documentBack = bankDetails.documentBack || null;
    } else if (bankDetails.country === 'India') {
      responseData.bankName = bankDetails.bankName;
      responseData.accountNumber = bankDetails.accountNumber;
      responseData.ifscCode = bankDetails.ifscCode;
      responseData.accountHolderName = bankDetails.accountHolderName;
      responseData.aadhaar = bankDetails.aadhaar;
    }

    res.status(200).json({
      success: true,
      message: 'Bank details saved successfully',
      data: {
        bankDetails: responseData,
      },
    });
  } catch (error) {
    if (error.message.includes('required') || error.message.includes('must be')) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
};

/**
 * @desc    Get Organiser bank details by Organiser user ID
 * @route   GET /api/organizers/bank-details
 * @access  Private (Organiser only - can only view their own)
 */
const getBankDetails = async (req, res, next) => {
  try {
    const organizerUserId = req.user.userId; // Sequential userId

    // Verify user is an Organiser
    if (req.user.userType !== 'organiser') {
      return res.status(403).json({
        success: false,
        error: 'Only organisers can view bank details',
      });
    }

    // Get bank details
    const bankDetails = await OrganiserBankDetails.findByOrganizerId(organizerUserId);

    if (!bankDetails) {
      return res.status(404).json({
        success: false,
        error: 'Bank details not found for this Organiser',
      });
    }

    // Format response based on country
    const responseData = {
      bankDetailsId: bankDetails.bankDetailsId || null,
      organizerId: organizerUserId,
      country: bankDetails.country,
      createdAt: bankDetails.createdAt,
      updatedAt: bankDetails.updatedAt,
    };

    if (bankDetails.country === 'UAE') {
      responseData.bankName = bankDetails.bankName;
      responseData.iban = bankDetails.iban;
      responseData.emiratesId = bankDetails.emiratesId;
      responseData.documentFront = bankDetails.documentFront || null;
      responseData.documentBack = bankDetails.documentBack || null;
    } else if (bankDetails.country === 'India') {
      responseData.bankName = bankDetails.bankName;
      responseData.accountNumber = bankDetails.accountNumber;
      responseData.ifscCode = bankDetails.ifscCode;
      responseData.accountHolderName = bankDetails.accountHolderName;
      responseData.aadhaar = bankDetails.aadhaar;
    }

    res.status(200).json({
      success: true,
      message: 'Bank details retrieved successfully',
      data: {
        bankDetails: responseData,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get Organiser bank details by Organiser user ID (by ID parameter)
 * @route   GET /api/organizers/:organizerId/bank-details
 * @access  Private (Organiser only - can view their own or admin)
 */
const getBankDetailsById = async (req, res, next) => {
  try {
    const { organizerId } = req.params;
    const currentUserSeqId = req.user.userId; // Sequential userId

    // Verify user is an Organiser
    if (req.user.userType !== 'organiser') {
      return res.status(403).json({
        success: false,
        error: 'Only organisers can view bank details',
      });
    }

    // Get Organiser user to verify ID
    let organizer;
    
    // Try to find by sequential userId first
    const userBySeqId = await User.findByUserId(organizerId);
    if (userBySeqId) {
      organizer = userBySeqId;
    } else {
      // Try as ObjectId
      organizer = await User.findById(organizerId);
    }

    if (!organizer) {
      return res.status(404).json({
        success: false,
        error: 'Organiser not found',
      });
    }

    // Verify organizer type
    if (organizer.userType !== 'organiser') {
      return res.status(400).json({
        success: false,
        error: 'User is not an Organiser',
      });
    }

    // Check if user is viewing their own details or is admin (for now, only own)
    const organizerUserId = organizer.userId; // Sequential userId
    if (organizerUserId !== currentUserSeqId) {
      return res.status(403).json({
        success: false,
        error: 'You can only view your own bank details',
      });
    }

    // Get bank details
    const bankDetails = await OrganiserBankDetails.findByOrganizerId(organizerUserId);

    if (!bankDetails) {
      return res.status(404).json({
        success: false,
        error: 'Bank details not found for this Organiser',
      });
    }

    // Format response based on country
    const responseData = {
      bankDetailsId: bankDetails.bankDetailsId || null,
      organizerId: organizerUserId,
      country: bankDetails.country,
      createdAt: bankDetails.createdAt,
      updatedAt: bankDetails.updatedAt,
    };

    if (bankDetails.country === 'UAE') {
      responseData.bankName = bankDetails.bankName;
      responseData.iban = bankDetails.iban;
      responseData.emiratesId = bankDetails.emiratesId;
      responseData.documentFront = bankDetails.documentFront || null;
      responseData.documentBack = bankDetails.documentBack || null;
    } else if (bankDetails.country === 'India') {
      responseData.bankName = bankDetails.bankName;
      responseData.accountNumber = bankDetails.accountNumber;
      responseData.ifscCode = bankDetails.ifscCode;
      responseData.accountHolderName = bankDetails.accountHolderName;
      responseData.aadhaar = bankDetails.aadhaar;
    }

    res.status(200).json({
      success: true,
      message: 'Bank details retrieved successfully',
      data: {
        bankDetails: responseData,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update Organiser bank details/KYC
 * @route   PUT /api/organizers/bank-details or PUT /api/organizers/:organizerId/bank-details
 * @access  Private (Organiser only)
 */
const updateBankDetails = async (req, res, next) => {
  try {
    const currentUserSeqId = req.user.userId; // Sequential userId from authenticated user
    const {
      organizerId: bodyOrganizerId,
      country,
      bankName,
      iban,
      emiratesId,
      accountNumber,
      ifscCode,
      accountHolderName,
      aadhaar,
      documentFront,
      documentBack,
      DocumentFront,
      DocumentBack,
    } = req.body;
    const { organizerId: paramOrganizerId } = req.params;

    // Verify user is an Organiser
    if (req.user.userType !== 'organiser') {
      return res.status(403).json({
        success: false,
        error: 'Only organisers can update bank details',
      });
    }

    // Determine which Organiser ID to use:
    // Priority: params > body > authenticated user
    let targetOrganizerId = paramOrganizerId || bodyOrganizerId;
    let organizerUserId = currentUserSeqId; // Default to authenticated user's sequential userId

    if (targetOrganizerId) {
      // If organizerId is provided manually, verify it exists and user has permission
      let organizer;
      
      // Try to find by sequential userId first
      const userBySeqId = await User.findByUserId(targetOrganizerId);
      if (userBySeqId) {
        organizer = userBySeqId;
      } else {
        // Try as ObjectId
        organizer = await User.findById(targetOrganizerId);
      }

      if (!organizer) {
        return res.status(404).json({
          success: false,
          error: 'Organiser not found',
        });
      }

      // Verify Organiser type
      if (organizer.userType !== 'organiser') {
        return res.status(400).json({
          success: false,
          error: 'User is not an Organiser',
        });
      }

      organizerUserId = organizer.userId; // Use sequential userId

      // Security: Users can only update bank details for themselves
      if (organizerUserId !== currentUserSeqId) {
        return res.status(403).json({
          success: false,
          error: 'You can only update bank details for your own account',
        });
      }
    }

    // Check if bank details exist
    const existingBankDetails = await OrganiserBankDetails.findByOrganizerId(organizerUserId);
    if (!existingBankDetails) {
      return res.status(404).json({
        success: false,
        error: 'Bank details not found. Please create bank details first using POST.',
      });
    }

    // Prepare update data - only include fields that are provided
    const updateData = {
      country: country || existingBankDetails.country, // Keep existing if not provided
    };

    // Update country-specific fields if provided
    if (updateData.country === 'UAE') {
      updateData.bankName = bankName !== undefined ? bankName.trim() : existingBankDetails.bankName;
      updateData.iban = iban !== undefined ? iban.trim() : existingBankDetails.iban;
      updateData.emiratesId = emiratesId !== undefined ? emiratesId.trim() : existingBankDetails.emiratesId;
      if (documentFront !== undefined || DocumentFront !== undefined) {
        updateData.documentFront = (documentFront || DocumentFront || '').trim();
      }
      if (documentBack !== undefined || DocumentBack !== undefined) {
        updateData.documentBack = (documentBack || DocumentBack || '').trim();
      }
    } else if (updateData.country === 'India') {
      updateData.bankName = bankName !== undefined ? bankName.trim() : existingBankDetails.bankName;
      updateData.accountNumber = accountNumber !== undefined ? accountNumber.trim() : existingBankDetails.accountNumber;
      updateData.ifscCode = ifscCode !== undefined ? ifscCode.trim() : existingBankDetails.ifscCode;
      updateData.accountHolderName = accountHolderName !== undefined ? accountHolderName.trim() : existingBankDetails.accountHolderName;
      updateData.aadhaar = aadhaar !== undefined ? aadhaar.trim() : existingBankDetails.aadhaar;
    } else {
      return res.status(400).json({
        success: false,
        error: 'Country must be either "UAE" or "India"',
      });
    }

    // Validate required fields for the country
    if (updateData.country === 'UAE') {
      if (!updateData.bankName || !updateData.iban || !updateData.emiratesId) {
        return res.status(400).json({
          success: false,
          error: 'Bank name, IBAN, and Emirates ID are required for UAE',
        });
      }
    } else if (updateData.country === 'India') {
      if (!updateData.bankName || !updateData.accountNumber || !updateData.ifscCode || !updateData.accountHolderName || !updateData.aadhaar) {
        return res.status(400).json({
          success: false,
          error: 'Bank name, account number, IFSC code, account holder name, and Aadhaar are required for India',
        });
      }
    }

    // Update bank details
    const bankDetails = await OrganiserBankDetails.upsert(organizerUserId, updateData);

    // Format response based on country
    const responseData = {
      bankDetailsId: bankDetails.bankDetailsId || null,
      organizerId: organizerUserId,
      country: bankDetails.country,
      createdAt: bankDetails.createdAt,
      updatedAt: bankDetails.updatedAt,
    };

    if (bankDetails.country === 'UAE') {
      responseData.bankName = bankDetails.bankName;
      responseData.iban = bankDetails.iban;
      responseData.emiratesId = bankDetails.emiratesId;
      responseData.documentFront = bankDetails.documentFront || null;
      responseData.documentBack = bankDetails.documentBack || null;
    } else if (bankDetails.country === 'India') {
      responseData.bankName = bankDetails.bankName;
      responseData.accountNumber = bankDetails.accountNumber;
      responseData.ifscCode = bankDetails.ifscCode;
      responseData.accountHolderName = bankDetails.accountHolderName;
      responseData.aadhaar = bankDetails.aadhaar;
    }

    res.status(200).json({
      success: true,
      message: 'Bank details updated successfully',
      data: {
        bankDetails: responseData,
      },
    });
  } catch (error) {
    if (error.message.includes('required') || error.message.includes('must be')) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
};

/**
 * @desc    Delete Organiser bank details/KYC
 * @route   DELETE /api/organizers/bank-details or DELETE /api/organizers/:organizerId/bank-details
 * @access  Private (Organiser only)
 */
const deleteBankDetails = async (req, res, next) => {
  try {
    const currentUserSeqId = req.user.userId; // Sequential userId from authenticated user
    const { organizerId: bodyOrganizerId } = req.body;
    const { organizerId: paramOrganizerId } = req.params;

    // Verify user is an Organiser
    if (req.user.userType !== 'organiser') {
      return res.status(403).json({
        success: false,
        error: 'Only organisers can delete bank details',
      });
    }

    // Determine which Organiser ID to use:
    // Priority: params > body > authenticated user
    let targetOrganizerId = paramOrganizerId || bodyOrganizerId;
    let organizerUserId = currentUserSeqId; // Default to authenticated user's sequential userId

    if (targetOrganizerId) {
      // If organizerId is provided manually, verify it exists and user has permission
      let organizer;
      
      // Try to find by sequential userId first
      const userBySeqId = await User.findByUserId(targetOrganizerId);
      if (userBySeqId) {
        organizer = userBySeqId;
      } else {
        // Try as ObjectId
        organizer = await User.findById(targetOrganizerId);
      }

      if (!organizer) {
        return res.status(404).json({
          success: false,
          error: 'Organiser not found',
        });
      }

      // Verify Organiser type
      if (organizer.userType !== 'organiser') {
        return res.status(400).json({
          success: false,
          error: 'User is not an Organiser',
        });
      }

      organizerUserId = organizer.userId; // Use sequential userId

      // Security: Users can only delete bank details for themselves
      if (organizerUserId !== currentUserSeqId) {
        return res.status(403).json({
          success: false,
          error: 'You can only delete bank details for your own account',
        });
      }
    }

    // Check if bank details exist
    const existingBankDetails = await OrganiserBankDetails.findByOrganizerId(organizerUserId);
    if (!existingBankDetails) {
      return res.status(404).json({
        success: false,
        error: 'Bank details not found for this Organiser',
      });
    }

    // Delete bank details
    const deleted = await OrganiserBankDetails.deleteByOrganizerId(organizerUserId);

    if (!deleted) {
      return res.status(400).json({
        success: false,
        error: 'Failed to delete bank details',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Bank details deleted successfully',
      data: {
        organizerId: organizerUserId,
        deletedAt: new Date(),
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  saveBankDetails,
  getBankDetails,
  getBankDetailsById,
  updateBankDetails,
  deleteBankDetails,
};

