const { getDB } = require('../config/database');
const { getNextUniqueBankDetailsId } = require('../utils/idManager');

/**
 * OrganiserBankDetails Model
 * Handles bank details and KYC information for Organisers
 * Supports UAE (bank name, IBAN, Emirates ID) and India (bank details, Aadhaar)
 */
class OrganiserBankDetails {
  constructor(data) {
    this.bankDetailsId = data.bankDetailsId; // Sequential bank details ID (BANK1, BANK2, ...)
    this.organizerId = data.organizerId; // Sequential userId (1, 2, 3, etc.)
    this.country = data.country; // 'UAE' or 'India'
    
    // UAE specific fields
    if (data.country === 'UAE') {
      this.bankName = data.bankName;
      this.iban = data.iban;
      this.emiratesId = data.emiratesId;
      this.documentFront = data.documentFront || null;
      this.documentBack = data.documentBack || null;
    }
    
    // India specific fields
    if (data.country === 'India') {
      this.bankName = data.bankName;
      this.accountNumber = data.accountNumber;
      this.ifscCode = data.ifscCode;
      this.accountHolderName = data.accountHolderName;
      this.aadhaar = data.aadhaar;
    }
    
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  /**
   * Create or update bank details for an Organiser
   */
  static async upsert(organizerId, bankDetailsData) {
    const db = getDB();
    const bankDetailsCollection = db.collection('organizerBankDetails');

    // Convert organiserId to number (sequential userId)
    let userId;
    try {
      // If it's already a number, use it
      if (typeof organizerId === 'number') {
        userId = organizerId;
      } else if (typeof organizerId === 'string') {
        // Try to parse as number (sequential userId)
        userId = parseInt(organizerId);
        if (isNaN(userId)) {
          // If not a number, try to find user by MongoDB ObjectId and get their userId
          const User = require('./User');
          const user = await User.findById(organizerId);
          if (!user) {
            throw new Error('Invalid Organiser ID format');
          }
          userId = user.userId;
        }
      } else {
        throw new Error('Invalid Organiser ID format');
      }
    } catch (error) {
      throw new Error('Invalid Organiser ID format');
    }

    // Validate country
    if (!bankDetailsData.country || !['UAE', 'India'].includes(bankDetailsData.country)) {
      throw new Error('Country must be either "UAE" or "India"');
    }

    // Validate UAE fields
    if (bankDetailsData.country === 'UAE') {
      if (!bankDetailsData.bankName || !bankDetailsData.bankName.trim()) {
        throw new Error('Bank name is required for UAE');
      }
      if (!bankDetailsData.iban || !bankDetailsData.iban.trim()) {
        throw new Error('IBAN is required for UAE');
      }
      if (!bankDetailsData.emiratesId || !bankDetailsData.emiratesId.trim()) {
        throw new Error('Emirates ID is required for UAE');
      }
    }

    // Validate India fields
    if (bankDetailsData.country === 'India') {
      if (!bankDetailsData.bankName || !bankDetailsData.bankName.trim()) {
        throw new Error('Bank name is required for India');
      }
      if (!bankDetailsData.accountNumber || !bankDetailsData.accountNumber.trim()) {
        throw new Error('Account number is required for India');
      }
      if (!bankDetailsData.ifscCode || !bankDetailsData.ifscCode.trim()) {
        throw new Error('IFSC code is required for India');
      }
      if (!bankDetailsData.accountHolderName || !bankDetailsData.accountHolderName.trim()) {
        throw new Error('Account holder name is required for India');
      }
      if (!bankDetailsData.aadhaar || !bankDetailsData.aadhaar.trim()) {
        throw new Error('Aadhaar number is required for India');
      }
    }

    // Prepare update data
    const updateData = {
      organizerId: userId,
      country: bankDetailsData.country,
      updatedAt: new Date(),
    };

    // Add country-specific fields
    if (bankDetailsData.country === 'UAE') {
      updateData.bankName = bankDetailsData.bankName.trim();
      updateData.iban = bankDetailsData.iban.trim();
      updateData.emiratesId = bankDetailsData.emiratesId.trim();
      if (bankDetailsData.documentFront !== undefined) updateData.documentFront = bankDetailsData.documentFront || null;
      if (bankDetailsData.documentBack !== undefined) updateData.documentBack = bankDetailsData.documentBack || null;
    } else if (bankDetailsData.country === 'India') {
      updateData.bankName = bankDetailsData.bankName.trim();
      updateData.accountNumber = bankDetailsData.accountNumber.trim();
      updateData.ifscCode = bankDetailsData.ifscCode.trim();
      updateData.accountHolderName = bankDetailsData.accountHolderName.trim();
      updateData.aadhaar = bankDetailsData.aadhaar.trim();
    }

    // Check if bank details already exist for this Organiser
    const existing = await bankDetailsCollection.findOne({ organizerId: userId });

    if (existing) {
      // Update existing record
      const result = await bankDetailsCollection.updateOne(
        { organizerId: userId },
        { $set: updateData }
      );
      
      if (result.modifiedCount === 0) {
        throw new Error('Failed to update bank details');
      }
      
      // Return updated document
      return await bankDetailsCollection.findOne({ organizerId: userId });
    } else {
      // Create new record
      // Generate custom/sequential bankDetailsId (no MongoDB _id usage required by API)
      updateData.bankDetailsId = await getNextUniqueBankDetailsId();
      updateData.createdAt = new Date();

      // For UAE, enforce documents on create (KYC)
      if (bankDetailsData.country === 'UAE') {
        if (!bankDetailsData.documentFront || !String(bankDetailsData.documentFront).trim()) {
          throw new Error('DocumentFront is required for UAE');
        }
        if (!bankDetailsData.documentBack || !String(bankDetailsData.documentBack).trim()) {
          throw new Error('DocumentBack is required for UAE');
        }
        updateData.documentFront = String(bankDetailsData.documentFront).trim();
        updateData.documentBack = String(bankDetailsData.documentBack).trim();
      }

      const result = await bankDetailsCollection.insertOne(updateData);
      
      return await bankDetailsCollection.findOne({ _id: result.insertedId });
    }
  }

  /**
   * Get bank details by Organiser ID
   */
  static async findByOrganizerId(organizerId) {
    const db = getDB();
    const bankDetailsCollection = db.collection('organizerBankDetails');

    // Convert organiserId to sequential userId
    let userId;
    try {
      // If it's already a number, use it
      if (typeof organizerId === 'number') {
        userId = organizerId;
      } else if (typeof organizerId === 'string') {
        // Try to parse as number (sequential userId)
        userId = parseInt(organizerId);
        if (isNaN(userId)) {
          // If not a number, try to find user by MongoDB ObjectId and get their userId
          const User = require('./User');
          const user = await User.findById(organizerId);
          if (!user) {
            return null; // Invalid ID format
          }
          userId = user.userId;
        }
      } else {
        return null; // Invalid ID format
      }
    } catch (error) {
      return null; // Invalid ID format
    }

    return await bankDetailsCollection.findOne({ organizerId: userId });
  }

  /**
   * Delete bank details by Organiser ID
   */
  static async deleteByOrganizerId(organizerId) {
    const db = getDB();
    const bankDetailsCollection = db.collection('organizerBankDetails');

    // Convert organiserId to sequential userId
    let userId;
    try {
      // If it's already a number, use it
      if (typeof organizerId === 'number') {
        userId = organizerId;
      } else if (typeof organizerId === 'string') {
        // Try to parse as number (sequential userId)
        userId = parseInt(organizerId);
        if (isNaN(userId)) {
          // If not a number, try to find user by MongoDB ObjectId and get their userId
          const User = require('./User');
          const user = await User.findById(organizerId);
          if (!user) {
            return false; // Invalid ID format
          }
          userId = user.userId;
        }
      } else {
        return false; // Invalid ID format
      }
    } catch (error) {
      return false; // Invalid ID format
    }

    const result = await bankDetailsCollection.deleteOne({ organizerId: userId });
    return result.deletedCount > 0;
  }
}

module.exports = OrganiserBankDetails;

