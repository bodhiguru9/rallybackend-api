const Event = require('../../models/Event');
const { findEventById, validateEventId } = require('../../utils/eventHelper');
const fs = require('fs');
const path = require('path');
const { getDB } = require('../../config/database');
const Notification = require('../../models/Notification');
const User = require('../../models/User');
const { ObjectId } = require('mongodb');
const { sendEventCancelledNotification } = require('../../services/eventNotification.service');

/**
 * @desc    Delete event (Public and Private events)
 * @route   DELETE /api/events/:eventId
 * @access  Private (Creator only - works for both public and private events)
 *
 * Authorization: Only the event creator can delete their events.
 * This applies to both public and private events regardless of visibility.
 */
const deleteEvent = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const organiserId = req.user.id;

    // Validate and find event
    const validation = validateEventId(eventId);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: validation.error,
        eventId: eventId,
      });
    }

    const event = await findEventById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        error: `Event not found with ID: ${eventId}`,
        eventId: eventId,
      });
    }

    // Authorization check: Only the event creator can delete
    if (event.creatorId.toString() !== organiserId) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to delete this event. Only the event creator can delete events (both public and private).',
        eventId: event.eventId,
        visibility: event.visibility,
      });
    }

    // ✅ CANCEL NOTIFICATION: notify all affected players BEFORE deleting joins/bookings
    try {
      const db = getDB();
      const eventObjectId = event._id;

      const joinsCollection = db.collection('eventJoins');
      const bookingsCollection = db.collection('bookings');
      const notificationsCollection = db.collection('notifications');

      // Get joined users
      const joins = await joinsCollection
        .find({ eventId: eventObjectId })
        .project({ userId: 1 })
        .toArray();

      // Get confirmed booked users
      const bookedUsers = await bookingsCollection
        .find({ eventId: eventObjectId, status: 'booked' })
        .project({ userId: 1 })
        .toArray();

      // Merge and deduplicate recipient ids
      const recipientIds = [
        ...new Set(
          [...joins, ...bookedUsers]
            .map((item) => item.userId)
            .filter(Boolean)
            .map((id) => (id instanceof ObjectId ? id.toString() : String(id)))
        ),
      ];

      if (recipientIds.length > 0) {
        const now = new Date();

        // Optional: fetch organiser name for better notification text
        let organiserName = null;
        try {
          const organiser = await User.findById(organiserId);
          organiserName = organiser?.fullName || organiser?.communityName || null;
        } catch (_) {}

        const title = 'Event cancelled';
        const message = organiserName
          ? `${organiserName} cancelled: ${event.eventName || 'this event'}`
          : `Event cancelled: ${event.eventName || 'this event'}`;

        // 1. In-app notifications
        const docs = recipientIds.map((rid) => ({
          recipientId: new ObjectId(rid),
          type: 'event-cancelled',
          title,
          message,
          isRead: false,
          createdAt: now,
          data: {
            eventId: eventObjectId.toString(),
            organiserId: organiserId,
            eventTitle: event.eventName || null,
            eventDateTime: event.eventDateTime || null,
          },
        }));

        await notificationsCollection.insertMany(docs, { ordered: false });

        // 2. External notifications: email first, else WhatsApp
        for (const rid of recipientIds) {
          try {
            const user = await User.findById(rid);
            if (!user) continue;

            await sendEventCancelledNotification({
              user,
              event,
            });
          } catch (notifyError) {
            console.error(`Failed to send event cancellation notification to user ${rid}:`, notifyError);
          }
        }
      }
    } catch (error) {
      console.error('Error sending cancel notifications:', error);
      // IMPORTANT: do not fail delete because of notification issue
    }

    // Cascade delete: remove all records linked to this event
    const db = getDB();
    const eventObjectId = event._id;
    const eventIdString = eventObjectId.toString();

    // Remove joins (participants)
    try {
      const joinsCollection = db.collection('eventJoins');
      await joinsCollection.deleteMany({ eventId: eventObjectId });
    } catch (error) {
      console.error('Error cleaning up event joins:', error);
    }

    // Remove waitlist entries
    try {
      const waitlistCollection = db.collection('waitlist');
      await waitlistCollection.deleteMany({ eventId: eventObjectId });
    } catch (error) {
      console.error('Error cleaning up waitlist:', error);
    }

    // Remove pending private-event join requests
    try {
      const eventJoinRequestsCollection = db.collection('eventJoinRequests');
      await eventJoinRequestsCollection.deleteMany({ eventId: eventObjectId });
    } catch (error) {
      console.error('Error cleaning up event join requests:', error);
    }

    // Remove event invites
    try {
      const invitesCollection = db.collection('eventInvites');
      await invitesCollection.deleteMany({ eventId: eventObjectId });
    } catch (error) {
      console.error('Error cleaning up event invites:', error);
    }

    // Remove event reminders
    try {
      const remindersCollection = db.collection('eventReminders');
      await remindersCollection.deleteMany({ eventId: eventObjectId });
    } catch (error) {
      console.error('Error cleaning up event reminders:', error);
    }

    // Remove favorites for this event
    try {
      const favoritesCollection = db.collection('favorites');
      await favoritesCollection.deleteMany({ eventId: eventObjectId });
    } catch (error) {
      console.error('Error cleaning up favorites:', error);
    }

    // Remove blocks for this event
    try {
      const eventBlocksCollection = db.collection('eventBlocks');
      await eventBlocksCollection.deleteMany({ eventId: eventObjectId });
    } catch (error) {
      console.error('Error cleaning up event blocks:', error);
    }

    // Remove bookings/payments tied to this event
    try {
      const bookingsCollection = db.collection('bookings');
      await bookingsCollection.deleteMany({ eventId: eventObjectId });
    } catch (error) {
      console.error('Error cleaning up bookings:', error);
    }

    try {
      const paymentsCollection = db.collection('payments');
      await paymentsCollection.deleteMany({ eventId: eventObjectId });
    } catch (error) {
      console.error('Error cleaning up payments:', error);
    }

    // Remove notifications tied to this event, except the event-cancelled ones just created
    try {
      const notificationsCollection = db.collection('notifications');
      await notificationsCollection.deleteMany({
        $and: [
          { type: { $ne: 'event-cancelled' } },
          {
            $or: [
              { 'data.eventId': eventIdString },
              { 'data.eventId': eventObjectId },
              { 'data.eventTitle': event.eventName || null },
            ],
          },
        ],
      });
    } catch (error) {
      console.error('Error cleaning up notifications:', error);
    }

    // Remove event references from packages
    try {
      const packagesCollection = db.collection('packages');
      await packagesCollection.updateMany(
        { eventIds: eventObjectId },
        { $pull: { eventIds: eventObjectId }, $set: { updatedAt: new Date() } }
      );
    } catch (error) {
      console.error('Error cleaning up packages referencing event:', error);
    }

    // Remove event usage references from package purchases
    try {
      const purchasesCollection = db.collection('packagePurchases');
      const purchases = await purchasesCollection.find({ joinedEventIds: eventObjectId }).toArray();

      for (const purchase of purchases) {
        const currentJoined = typeof purchase.eventsJoined === 'number' ? purchase.eventsJoined : 0;
        const newJoined = Math.max(0, currentJoined - 1);

        await purchasesCollection.updateOne(
          { _id: purchase._id },
          {
            $pull: { joinedEventIds: eventObjectId },
            $set: { eventsJoined: newJoined, updatedAt: new Date() },
          }
        );
      }
    } catch (error) {
      console.error('Error cleaning up package purchase usage for event:', error);
    }

    // Delete associated files - multiple images
    const imagesToDelete = event.gameImages || (event.gameImage ? [event.gameImage] : []);
    imagesToDelete.forEach((imagePath) => {
      if (imagePath) {
        const fullPath = path.join(process.cwd(), imagePath.replace('/uploads/', 'uploads/'));
        try {
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
          }
        } catch (error) {
          console.error('Error deleting event image:', error);
        }
      }
    });

    if (event.gameVideo) {
      const videoPath = path.join(process.cwd(), event.gameVideo.replace('/uploads/', 'uploads/'));
      try {
        if (fs.existsSync(videoPath)) {
          fs.unlinkSync(videoPath);
        }
      } catch (error) {
        console.error('Error deleting event video:', error);
      }
    }

    // Delete event
    await Event.deleteById(event._id.toString(), organiserId);

    // Recalculate organiser totals
    try {
      await Event.recalculateTotalAttendees(organiserId);
    } catch (error) {
      console.error('Error recalculating organiser total attendees after event deletion:', error);
    }

    res.status(200).json({
      success: true,
      message: 'Event deleted successfully',
      data: {
        eventId: event.eventId,
        deletedAt: new Date(),
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  deleteEvent,
};