const User = require('../../models/User');
const Follow = require('../../models/Follow');
const EventJoin = require('../../models/EventJoin');
const Request = require('../../models/Request');
const Waitlist = require('../../models/Waitlist');
const Event = require('../../models/Event');
const fs = require('fs');
const path = require('path');
const { getDB } = require('../../config/database');

/**
 * @desc    Delete user account
 * @route   DELETE /api/users/:id
 * @access  Private
 * 
 * Users can only delete their own account.
 * Supports both sequential userId (1, 2, 3, etc.) and MongoDB ObjectId.
 * This will:
 * - Delete user's profile picture
 * - Remove all follow relationships (as follower and following)
 * - Remove user from all event joins
 * - Remove all user's requests
 * - Remove user from all waitlists
 * - Delete all events created by the user (if organiser)
 * - Delete the user account
 */
const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params; // User ID from route parameter
    const authenticatedUserId = req.user.id; // MongoDB ObjectId from auth middleware

    // Find user by sequential userId or MongoDB ObjectId
    let user = null;
    
    // Check if it's a number (sequential userId)
    if (!isNaN(id) && parseInt(id).toString() === id) {
      user = await User.findByUserId(id);
    }
    
    // If not found by userId, try MongoDB ObjectId
    if (!user) {
      user = await User.findById(id);
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        suggestion: 'Please provide a valid user ID (sequential userId like 5, or MongoDB ObjectId)',
      });
    }

    // Authorization: users can delete their own account; super admin can delete any account
    const { isSuperAdmin } = require('../../middleware/auth');
    const canDelete = user._id.toString() === authenticatedUserId || isSuperAdmin(req);
    if (!canDelete) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to delete this user account. You can only delete your own account.',
      });
    }

    // Use the user's MongoDB ObjectId for deletion operations
    const userId = user._id.toString();

    const userObjectId = user._id;

    // Delete profile picture if exists
    if (user.profilePic) {
      try {
        const picPath = path.join(process.cwd(), user.profilePic.replace('/uploads/', 'uploads/'));
        if (fs.existsSync(picPath)) {
          fs.unlinkSync(picPath);
        }
      } catch (error) {
        console.error('Error deleting profile picture:', error);
        // Continue with deletion even if file deletion fails
      }
    }

    // Clean up follow relationships where user is a follower
    try {
      const db = getDB();
      const followsCollection = db.collection('follows');
      
      // Find all follows where user is follower
      const followsAsFollower = await followsCollection.find({ followerId: userObjectId }).toArray();
      
      // Update follower counts for organisers being unfollowed
      for (const follow of followsAsFollower) {
        await Follow.updateFollowerCount(follow.followingId, -1);
      }
      
      // Delete all follows where user is follower
      await followsCollection.deleteMany({ followerId: userObjectId });
      
      // Update following count for user (set to 0)
      await Follow.updateFollowingCount(userObjectId, -followsAsFollower.length);
    } catch (error) {
      console.error('Error cleaning up follows as follower:', error);
    }

    // Clean up follow relationships where user is being followed (if organiser)
    try {
      const db = getDB();
      const followsCollection = db.collection('follows');
      
      // Find all follows where user is being followed
      const followsAsFollowing = await followsCollection.find({ followingId: userObjectId }).toArray();
      
      // Update following counts for users who were following this organiser
      for (const follow of followsAsFollowing) {
        await Follow.updateFollowingCount(follow.followerId, -1);
      }
      
      // Delete all follows where user is being followed
      await followsCollection.deleteMany({ followingId: userObjectId });
      
      // Update follower count for user (set to 0)
      await Follow.updateFollowerCount(userObjectId, -followsAsFollowing.length);
    } catch (error) {
      console.error('Error cleaning up follows as following:', error);
    }

    // Clean up event joins
    try {
      const db = getDB();
      const joinsCollection = db.collection('eventJoins');
      
      // Find all event joins for this user
      const eventJoins = await joinsCollection.find({ userId: userObjectId }).toArray();
      
      // Update attendee counts for events
      for (const join of eventJoins) {
        try {
          await Event.updateAttendeeCount(join.eventId.toString(), -1);
        } catch (error) {
          console.error('Error updating attendee count:', error);
        }
      }
      
      // Delete all event joins for this user
      await joinsCollection.deleteMany({ userId: userObjectId });
    } catch (error) {
      console.error('Error cleaning up event joins:', error);
    }

    // Clean up pending private event join requests
    try {
      const db = getDB();
      const eventJoinRequestsCollection = db.collection('eventJoinRequests');
      await eventJoinRequestsCollection.deleteMany({ userId: userObjectId });
    } catch (error) {
      console.error('Error cleaning up event join requests:', error);
    }

    // Clean up requests (where user requested to join organiser)
    try {
      const db = getDB();
      const requestsCollection = db.collection('requests');
      
      // Delete all requests where user is the requester
      await requestsCollection.deleteMany({ userId: userObjectId });
    } catch (error) {
      console.error('Error cleaning up requests:', error);
    }

    // Clean up waitlists
    try {
      const db = getDB();
      const waitlistCollection = db.collection('waitlist');
      
      // Delete all waitlist entries for this user
      await waitlistCollection.deleteMany({ userId: userObjectId });
    } catch (error) {
      console.error('Error cleaning up waitlists:', error);
    }

    // Clean up auth/login tokens (refresh tokens stored in DB)
    try {
      const db = getDB();
      const tokensCollection = db.collection('tokens');
      await tokensCollection.deleteMany({ userId: userObjectId });
    } catch (error) {
      console.error('Error cleaning up tokens:', error);
    }

    // Clean up package purchases (player purchases)
    try {
      const db = getDB();
      const packagePurchasesCollection = db.collection('packagePurchases');
      await packagePurchasesCollection.deleteMany({ userId: userObjectId });
    } catch (error) {
      console.error('Error cleaning up package purchases:', error);
    }

    // Clean up bookings made by the user
    try {
      const db = getDB();
      const bookingsCollection = db.collection('bookings');
      await bookingsCollection.deleteMany({ userId: userObjectId });
    } catch (error) {
      console.error('Error cleaning up bookings:', error);
    }

    // Clean up payments made by the user
    try {
      const db = getDB();
      const paymentsCollection = db.collection('payments');
      await paymentsCollection.deleteMany({ userId: userObjectId });
    } catch (error) {
      console.error('Error cleaning up payments:', error);
    }

    // Clean up notifications:
    // - Notifications received by the user (recipientId)
    // - Notifications where this user was referenced in payload (data.userId / data.organiserId / data.playerId)
    try {
      const db = getDB();
      const notificationsCollection = db.collection('notifications');
      await notificationsCollection.deleteMany({
        $or: [
          { recipientId: userObjectId },
          { 'data.userId': userId },
          { 'data.userId': userObjectId },
          { 'data.organiserId': userId },
          { 'data.organiserId': userObjectId },
          { 'data.playerId': userId },
          { 'data.playerId': userObjectId },
        ],
      });
    } catch (error) {
      console.error('Error cleaning up notifications:', error);
    }

    // Clean up favorites
    try {
      const db = getDB();
      const favoritesCollection = db.collection('favorites');
      await favoritesCollection.deleteMany({ userId: userObjectId });
    } catch (error) {
      console.error('Error cleaning up favorites:', error);
    }

    // Clean up saved cards (tokenized references)
    try {
      const db = getDB();
      const savedCardsCollection = db.collection('savedCards');
      await savedCardsCollection.deleteMany({ userId: userObjectId });
    } catch (error) {
      console.error('Error cleaning up saved cards:', error);
    }

    // Clean up user blocks (as blocker or blocked)
    try {
      const db = getDB();
      const blocksCollection = db.collection('blocks');
      await blocksCollection.deleteMany({
        $or: [{ blockerId: userObjectId }, { blockedId: userObjectId }],
      });
    } catch (error) {
      console.error('Error cleaning up blocks:', error);
    }

    // Clean up blocked events
    try {
      const db = getDB();
      const eventBlocksCollection = db.collection('eventBlocks');
      await eventBlocksCollection.deleteMany({ userId: userObjectId });
    } catch (error) {
      console.error('Error cleaning up event blocks:', error);
    }

    // Clean up event reminders
    try {
      const db = getDB();
      const remindersCollection = db.collection('eventReminders');
      await remindersCollection.deleteMany({ userId: userObjectId });
    } catch (error) {
      console.error('Error cleaning up event reminders:', error);
    }

    // Clean up event invites (sent or received)
    try {
      const db = getDB();
      const invitesCollection = db.collection('eventInvites');
      await invitesCollection.deleteMany({
        $or: [{ organiserId: userObjectId }, { playerId: userObjectId }],
      });
    } catch (error) {
      console.error('Error cleaning up event invites:', error);
    }

    // If user is an organiser, delete all events created by them
    if (user.userType === 'organiser') {
      try {
        const db = getDB();
        const eventsCollection = db.collection('events');
        
        // Find all events created by this user
        const events = await eventsCollection.find({ creatorId: userObjectId }).toArray();
        
        // Delete event files and events
        for (const event of events) {
          // Delete event images if they exist (handle both gameImages array and gameImage string for backward compatibility)
          const imagesToDelete = event.gameImages || (event.gameImage ? [event.gameImage] : []);
          imagesToDelete.forEach((imagePath) => {
            if (imagePath) {
              try {
                const fullPath = path.join(process.cwd(), imagePath.replace('/uploads/', 'uploads/'));
                if (fs.existsSync(fullPath)) {
                  fs.unlinkSync(fullPath);
                }
              } catch (error) {
                console.error('Error deleting event image:', error);
              }
            }
          });
          
          // Delete event video if exists
          if (event.gameVideo) {
            try {
              const videoPath = path.join(process.cwd(), event.gameVideo.replace('/uploads/', 'uploads/'));
              if (fs.existsSync(videoPath)) {
                fs.unlinkSync(videoPath);
              }
            } catch (error) {
              console.error('Error deleting event video:', error);
            }
          }
          
          // Delete event joins for this event
          const joinsCollection = db.collection('eventJoins');
          await joinsCollection.deleteMany({ eventId: event._id });
          
          // Delete waitlist entries for this event
          const waitlistCollection = db.collection('waitlist');
          await waitlistCollection.deleteMany({ eventId: event._id });
        }
        
        // Update events count before deleting (decrement by number of events)
        if (events.length > 0) {
          await Event.updateEventsCount(userObjectId.toString(), -events.length);
        }
        
        // Delete all events created by this user
        await eventsCollection.deleteMany({ creatorId: userObjectId });
      } catch (error) {
        console.error('Error cleaning up events:', error);
      }
    }

    // If user is an organiser, also delete organiser-specific related data (packages, organiser purchases, bank details)
    if (user.userType === 'organiser') {
      // Delete packages created by organiser
      try {
        const db = getDB();
        const packagesCollection = db.collection('packages');
        await packagesCollection.deleteMany({ organiserId: userObjectId });
      } catch (error) {
        console.error('Error cleaning up packages:', error);
      }

      // Delete package purchases tied to this organiser (since organiser no longer exists)
      try {
        const db = getDB();
        const packagePurchasesCollection = db.collection('packagePurchases');
        await packagePurchasesCollection.deleteMany({ organiserId: userObjectId });
      } catch (error) {
        console.error('Error cleaning up organiser package purchases:', error);
      }

      // Delete organiser bank details (stored by sequential userId in organizerBankDetails collection)
      try {
        const db = getDB();
        const bankDetailsCollection = db.collection('organizerBankDetails');
        await bankDetailsCollection.deleteMany({ organizerId: user.userId });
      } catch (error) {
        console.error('Error cleaning up organiser bank details:', error);
      }
    }

    // Finally, delete the user account
    const deleted = await User.deleteById(userId);
    if (!deleted) {
      return res.status(400).json({
        success: false,
        error: 'Failed to delete user account',
      });
    }

    res.status(200).json({
      success: true,
      message: 'User account deleted successfully',
      data: {
        userId: user.userId,
        deletedAt: new Date(),
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  deleteUser,
};

