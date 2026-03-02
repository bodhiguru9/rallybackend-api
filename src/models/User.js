const { getDB } = require('../config/database');
const { ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const Counter = require('./Counter');

/**
 * User Model
 * Handles user data operations for both Player and Organiser user types
 * Supports authentication, profile management, and type-specific fields
 */
class User {
  constructor(data) {
    // Common fields
    this.userId = data.userId; // Sequential user ID (1, 2, 3, ...)
    this.userType = data.userType; // 'player', 'organiser', or 'superadmin'
    this.email = data.email;
    this.mobileNumber = data.mobileNumber;
    this.password = data.password;
    this.profilePic = data.profilePic;
    this.whatsappNumber = data.whatsappNumber || null; // Optional WhatsApp number
    this.isEmailVerified = data.isEmailVerified || false;
    this.isMobileVerified = data.isMobileVerified || false;
    this.otp = data.otp;
    this.otpExpire = data.otpExpire;
    this.resetPasswordToken = data.resetPasswordToken;
    this.resetPasswordExpire = data.resetPasswordExpire;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;

    // Superadmin has only common fields + optional fullName
    if (data.userType === 'superadmin') {
      this.fullName = data.fullName || 'Super Admin';
    }
    // Player specific fields (dob, gender optional)
    if (data.userType === 'player') {
      this.fullName = data.fullName;
      this.dob = data.dob || null;
      this.gender = data.gender || null;
      this.sport1 = data.sport1;
      this.sport2 = data.sport2;
      this.sports = data.sports || []; // Array for additional sports
    }

    // Organiser specific fields
    if (data.userType === 'organiser') {
      this.fullName = data.fullName;
      this.yourBest = data.yourBest; // 'Organiser', 'coach', 'club'
      this.communityName = data.communityName;
      this.yourCity = data.yourCity;
      this.dob = data.dob || null;
      this.gender = data.gender || null;
      this.sport1 = data.sport1;
      this.sport2 = data.sport2;
      this.sports = data.sports || []; // Array for additional sports
      this.bio = data.bio;
      this.instagramLink = data.instagramLink; // Instagram profile link (optional)
      this.profileVisibility = data.profileVisibility || 'private'; // 'public' or 'private', default 'private'
      this.followersCount = data.followersCount || 0; // Number of followers
      this.eventsCreated = data.eventsCreated || 0; // Number of events created
      this.totalAttendees = data.totalAttendees || 0; // Total attendees across all events
    }

    // Common counts for all users
    this.followingCount = data.followingCount || 0; // Number of organisers user is following
    
    // OAuth providers
    this.oauthProviders = data.oauthProviders || []; // Array of OAuth provider connections
  }

  /**
   * Hash password before saving
   */
  async hashPassword() {
    if (this.password) {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);
    }
  }

  /**
   * Compare password with hashed password
   */
  async comparePassword(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
  }

  /**
   * Create a new user
   */
  static async create(userData) {
    const db = getDB();
    const usersCollection = db.collection('users');

    // Generate sequential user ID with uniqueness verification
    const { getNextUniqueUserId } = require('../utils/idManager');
    const userId = await getNextUniqueUserId();

    const user = new User({ ...userData, userId });
    await user.hashPassword();

    // Set timestamps only on creation
    const now = new Date();
    user.createdAt = now;
    user.updatedAt = now;

    const result = await usersCollection.insertOne({
      ...user,
      password: user.password,
    });

    // Return user data based on type
    const returnData = {
      _id: result.insertedId,
      userId: user.userId,
      userType: user.userType,
      email: user.email,
      mobileNumber: user.mobileNumber,
      whatsappNumber: user.whatsappNumber || null,
      profilePic: user.profilePic,
      isEmailVerified: user.isEmailVerified,
      isMobileVerified: user.isMobileVerified,
      otp: user.otp,
      otpExpire: user.otpExpire,
      createdAt: user.createdAt,
    };

    // Add type-specific fields
    if (user.userType === 'player') {
      returnData.fullName = user.fullName;
      returnData.dob = user.dob;
      returnData.gender = user.gender;
      returnData.sport1 = user.sport1;
      returnData.sport2 = user.sport2;
      returnData.sports = user.sports;
    } else if (user.userType === 'organiser') {
      returnData.fullName = user.fullName;
      returnData.yourBest = user.yourBest;
      returnData.communityName = user.communityName;
      returnData.yourCity = user.yourCity;
      returnData.dob = user.dob || null;
      returnData.gender = user.gender || null;
      returnData.sport1 = user.sport1;
      returnData.sport2 = user.sport2;
      returnData.sports = user.sports;
      returnData.bio = user.bio;
      returnData.instagramLink = user.instagramLink || null;
      returnData.profileVisibility = user.profileVisibility || 'private';
      returnData.followersCount = user.followersCount || 0;
      returnData.eventsCreated = user.eventsCreated || 0;
      returnData.totalAttendees = user.totalAttendees || 0;
    } else if (user.userType === 'superadmin') {
      returnData.fullName = user.fullName || 'Super Admin';
    }

    // Add following count for all users
    returnData.followingCount = user.followingCount || 0;

    // Add OAuth providers if exists
    if (user.oauthProviders) {
      returnData.oauthProviders = user.oauthProviders;
    }

    return returnData;
  }

  /**
   * Find user by email
   */
  static async findByEmail(email) {
    const db = getDB();
    const usersCollection = db.collection('users');
    return await usersCollection.findOne({ email: email.toLowerCase() });
  }

  /**
   * Find user by mobile number
   */
  static async findByMobileNumber(mobileNumber) {
    const db = getDB();
    const usersCollection = db.collection('users');
    // Normalize mobile number (remove spaces, dashes, etc.)
    const normalizedMobile = mobileNumber.replace(/\D/g, '');
    return await usersCollection.findOne({ 
      $or: [
        { mobileNumber: normalizedMobile },
        { mobileNumber: mobileNumber }
      ]
    });
  }

  /**
   * Find user by email or mobile number
   */
  static async findByEmailOrMobile(emailOrMobile) {
    const db = getDB();
    const usersCollection = db.collection('users');
    
    // Check if it's an email or mobile number
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailOrMobile);
    
    if (isEmail) {
      return await usersCollection.findOne({ email: emailOrMobile.toLowerCase() });
    } else {
      // Normalize mobile number - keep + if present, otherwise just digits
      const rawDigits = emailOrMobile.replace(/\D/g, '');
      let normalizedMobile = emailOrMobile.replace(/[^\d+]/g, '');
      if (!normalizedMobile.startsWith('+')) {
        normalizedMobile = rawDigits;
      }

      // Build common variants (e.g., +1 for 10-digit numbers)
      const variants = new Set([
        normalizedMobile,
        emailOrMobile,
        rawDigits,
        `+${rawDigits}`,
      ]);
      if (rawDigits.length === 10) {
        variants.add(`+1${rawDigits}`);
        variants.add(`+91${rawDigits}`);
      }

      return await usersCollection.findOne({
        $or: Array.from(variants).map((value) => ({ mobileNumber: value })),
      });
    }
  }

  /**
   * Find user by ID
   */
  static async findById(id) {
    const db = getDB();
    const usersCollection = db.collection('users');
    
    // Convert string ID to ObjectId if needed
    let objectId;
    try {
      objectId = typeof id === 'string' ? new ObjectId(id) : id;
    } catch (error) {
      return null; // Invalid ObjectId format
    }
    
    return await usersCollection.findOne({ _id: objectId });
  }

  /**
   * Find user by sequential userId
   */
  static async findByUserId(userId) {
    const db = getDB();
    const usersCollection = db.collection('users');
    return await usersCollection.findOne({
      userId: parseInt(userId),
    });
  }

  /**
   * Find user by reset token
   */
  static async findByResetToken(token) {
    const db = getDB();
    const usersCollection = db.collection('users');
    return await usersCollection.findOne({
      resetPasswordToken: token,
      resetPasswordExpire: { $gt: new Date() },
    });
  }

  /**
   * Find user by mobile number with valid OTP
   */
  static async findByMobileWithValidOTP(mobileNumber, otp) {
    const db = getDB();
    const usersCollection = db.collection('users');
    
    // Normalize mobile number
    let normalizedMobile = mobileNumber.replace(/[^\d+]/g, '');
    if (!normalizedMobile.startsWith('+')) {
      normalizedMobile = normalizedMobile.replace(/\D/g, '');
    }
    
    return await usersCollection.findOne({
      $or: [
        { mobileNumber: normalizedMobile },
        { mobileNumber: mobileNumber }
      ],
      otp: otp,
      otpExpire: { $gt: new Date() },
    });
  }

  /**
   * Update user
   */
  static async updateById(id, updateData) {
    const db = getDB();
    const usersCollection = db.collection('users');

    // Convert string ID to ObjectId if needed
    let objectId;
    try {
      objectId = typeof id === 'string' ? new ObjectId(id) : id;
    } catch (error) {
      return false; // Invalid ObjectId format
    }

    // If updating password, hash it
    if (updateData.password) {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(updateData.password, salt);
    }

    updateData.updatedAt = new Date();

    const result = await usersCollection.updateOne(
      { _id: objectId },
      { $set: updateData }
    );

    return result.modifiedCount > 0;
  }

  /**
   * Check if email exists
   */
  static async emailExists(email) {
    const db = getDB();
    const usersCollection = db.collection('users');
    const user = await usersCollection.findOne({ email: email.toLowerCase() });
    return !!user;
  }

  /**
   * Check if mobile number exists
   */
  static async mobileNumberExists(mobileNumber) {
    const db = getDB();
    const usersCollection = db.collection('users');
    const normalizedMobile = mobileNumber.replace(/\D/g, '');
    const user = await usersCollection.findOne({ 
      $or: [
        { mobileNumber: normalizedMobile },
        { mobileNumber: mobileNumber }
      ]
    });
    return !!user;
  }

  /**
   * Delete user by ID
   */
  static async deleteById(id) {
    const db = getDB();
    const usersCollection = db.collection('users');

    // Convert string ID to ObjectId if needed
    let objectId;
    try {
      objectId = typeof id === 'string' ? new ObjectId(id) : id;
    } catch (error) {
      return false; // Invalid ObjectId format
    }

    const result = await usersCollection.deleteOne({ _id: objectId });
    return result.deletedCount > 0;
  }
}

module.exports = User;

