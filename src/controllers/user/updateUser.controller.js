const User = require('../../models/User');
const { validateUserUpdate } = require('../../validators/user.validator');
const { uploadProfilePic } = require('../../middleware/upload');
const { getBookingStatsByUsers } = require('../../utils/bookingStats');

/**
 * @desc    Update user profile
 * @route   PUT /api/users/:id
 * @access  Private
 * 
 * Users can update their own profile data.
 * All fields are optional - user can update any subset of their profile.
 * Profile picture can be updated via multipart/form-data.
 * Supports both sequential userId (1, 2, 3, etc.) and MongoDB ObjectId.
 */
const updateUser = async (req, res, next) => {
  // Handle file upload first
  uploadProfilePic(req, res, async (err) => {
    try {
      // Handle multer errors
      if (err) {
        return res.status(400).json({
          success: false,
          error: err.message || 'File upload error',
        });
      }

      const { id } = req.params; // User ID from route parameter
      const authenticatedUserId = req.user.id; // MongoDB ObjectId from auth middleware
      const userType = req.user.userType; // From auth middleware

      // Find user by sequential userId or MongoDB ObjectId
      let targetUser = null;
      
      // Check if it's a number (sequential userId)
      if (!isNaN(id) && parseInt(id).toString() === id) {
        targetUser = await User.findByUserId(id);
      }
      
      // If not found by userId, try MongoDB ObjectId
      if (!targetUser) {
        targetUser = await User.findById(id);
      }

      if (!targetUser) {
        // Files are already uploaded to S3, no need to delete
        return res.status(404).json({
          success: false,
          error: 'User not found',
          suggestion: 'Please provide a valid user ID (sequential userId like 5, or MongoDB ObjectId)',
        });
      }

      // Authorization check: Users can only update their own account
      if (targetUser._id.toString() !== authenticatedUserId) {
        return res.status(403).json({
          success: false,
          error: 'Not authorized to update this user account. You can only update your own account.',
        });
      }

      // Use the target user's MongoDB ObjectId for update operations
      const userId = targetUser._id.toString();
      const existingUser = targetUser;
      if (!existingUser) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
        });
      }

      // Prepare update data
      const updateData = { ...req.body };

      // Handle profile picture update (use S3 URL)
      // Support both req.file (from single) and req.files (from fields)
      const profilePicFile = req.file || req.files?.profile_pic?.[0] || req.files?.profilePic?.[0];
      if (profilePicFile) {
        // Use S3 location (public URL) instead of local path
        updateData.profilePic = profilePicFile.location;
      }

      // Normalize email to lowercase if provided
      if (updateData.email) {
        updateData.email = updateData.email.toLowerCase();
      }

      // Check if email is being changed and if it already exists
      if (updateData.email && updateData.email !== existingUser.email) {
        const emailExists = await User.emailExists(updateData.email);
        if (emailExists) {
          // Files are already uploaded to S3, no need to delete
          return res.status(400).json({
            success: false,
            error: 'Email already exists',
          });
        }
      }

      // Check if mobile number is being changed and if it already exists
      if (updateData.mobileNumber && updateData.mobileNumber !== existingUser.mobileNumber) {
        const mobileExists = await User.mobileNumberExists(updateData.mobileNumber);
        if (mobileExists) {
          // Files are already uploaded to S3, no need to delete
          return res.status(400).json({
            success: false,
            error: 'Mobile number already exists',
          });
        }
      }

      // Validate update data
      const validation = validateUserUpdate(updateData, userType);
      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          error: validation.errors,
        });
      }

      // Remove fields that shouldn't be updated directly
      delete updateData.userId; // Cannot change userId
      delete updateData.userType; // Cannot change userType
      delete updateData.createdAt; // Cannot change createdAt
      delete updateData.otp; // OTP is managed separately
      delete updateData.otpExpire; // OTP expiry is managed separately
      delete updateData.resetPasswordToken; // Reset token is managed separately
      delete updateData.resetPasswordExpire; // Reset token expiry is managed separately
      delete updateData.isEmailVerified; // Email verification is managed separately
      delete updateData.isMobileVerified; // Mobile verification is managed separately
      delete updateData.followersCount; // Followers count is managed by follow system
      delete updateData.eventsCreated; // Events created count is managed by event system
      delete updateData.totalAttendees; // Total attendees count is managed by event system
      delete updateData.followingCount; // Following count is managed by follow system

      // Update user
      const updated = await User.updateById(userId, updateData);
      if (!updated) {
        return res.status(400).json({
          success: false,
          error: 'Failed to update user',
        });
      }

      // Get updated user data
      const updatedUser = await User.findById(userId);

      // Prepare response data (exclude sensitive fields)
      const userResponse = {
        id: updatedUser.userId, // Sequential ID (1, 2, 3...)
        userId: updatedUser.userId, // Sequential ID for clarity
        mongoId: updatedUser._id.toString(), // MongoDB ObjectId (for internal use if needed)
        userType: updatedUser.userType,
        email: updatedUser.email,
        mobileNumber: updatedUser.mobileNumber,
        profilePic: updatedUser.profilePic || null, // Always include profilePic field
        isEmailVerified: updatedUser.isEmailVerified,
        isMobileVerified: updatedUser.isMobileVerified,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt,
      };

      // Add type-specific fields
      if (updatedUser.userType === 'player') {
        userResponse.fullName = updatedUser.fullName;
        userResponse.dob = updatedUser.dob;
        userResponse.gender = updatedUser.gender;
        userResponse.sport1 = updatedUser.sport1;
        userResponse.sport2 = updatedUser.sport2;
        userResponse.sports = updatedUser.sports || [];
      } else if (updatedUser.userType === 'organiser') {
        userResponse.fullName = updatedUser.fullName;
        userResponse.yourBest = updatedUser.yourBest;
        userResponse.communityName = updatedUser.communityName;
        userResponse.yourCity = updatedUser.yourCity;
        userResponse.sport1 = updatedUser.sport1;
        userResponse.sport2 = updatedUser.sport2;
        userResponse.sports = updatedUser.sports || [];
        userResponse.bio = updatedUser.bio;
        userResponse.instagramLink = updatedUser.instagramLink || null;
        userResponse.profileVisibility = updatedUser.profileVisibility || 'private';
        userResponse.followersCount = updatedUser.followersCount || 0;
        userResponse.eventsCreated = updatedUser.eventsCreated || 0;
        userResponse.totalAttendees = updatedUser.totalAttendees || 0;
      }

      // Add following count for all users
      userResponse.followingCount = updatedUser.followingCount || 0;

      const bookingStatsMap = await getBookingStatsByUsers([updatedUser._id]);
      const bookingStats = bookingStatsMap.get(updatedUser._id.toString()) || { bookedCount: 0, totalSpent: 0 };
      userResponse.totalBookedEvents = bookingStats.bookedCount;
      userResponse.totalBookingAmount = bookingStats.totalSpent;

      res.status(200).json({
        success: true,
        message: 'User profile updated successfully',
        data: {
          user: userResponse,
        },
      });
    } catch (error) {
      // No need to delete files - S3 handles storage
      // Files are already uploaded to S3 at this point
      next(error);
    }
  });
};

module.exports = {
  updateUser,
};

