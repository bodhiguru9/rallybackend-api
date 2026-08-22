const Event = require('../../models/Event');
const User = require('../../models/User');
const { validateEvent } = require('../../validators/event.validator');
const { uploadEventMedia } = require('../../middleware/eventUpload');
const { findEventById, validateEventId } = require('../../utils/eventHelper');
const { processEventData, formatEventResponse } = require('../../utils/eventFields');
const fs = require('fs');
const path = require('path');
const { getDB } = require('../../config/database');
const { ObjectId } = require('mongodb');
const { 
  sendEventCancelledNotification,
  sendWaitlistSpotAvailableNotification 
} = require('../../services/eventNotification.service');
const Waitlist = require('../../models/Waitlist');
const { sendPushToMany } = require('../../services/push.service');

/**
 * @desc    Update event (Public and Private events)
 * @route   PUT /api/events/:eventId
 * @access  Private (Creator only - works for both public and private events)
 * 
 * Authorization: Only the event creator can update their events.
 * This applies to both public and private events regardless of visibility.
 */
const updateEvent = async (req, res, next) => {
  uploadEventMedia(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        error: err.message || 'File upload error',
      });
    }

    try {
      const { eventId } = req.params;
      const organiserId = req.user.id;

      // Validate eventId format
      const eventIdValidation = validateEventId(eventId);
      if (!eventIdValidation.isValid) {
        // Files are already uploaded to S3, no need to delete
        return res.status(400).json({
          success: false,
          error: eventIdValidation.error,
          eventId: eventId,
        });
      }

      // Check if event exists
      const event = await findEventById(eventId);
      if (!event) {
        // Files are already uploaded to S3, no need to delete
        return res.status(404).json({
          success: false,
          error: `Event not found with ID: ${eventId}`,
          eventId: eventId,
        });
      }

      // Authorization check: Only the event creator can update (works for both public and private events)
      if (event.creatorId.toString() !== organiserId) {
        return res.status(403).json({
          success: false,
          error: 'Not authorized to update this event. Only the event creator can update events (both public and private).',
          eventId: event.eventId,
          visibility: event.visibility,
        });
      }

      // Validate input
      const validation = validateEvent(req.body, true);
      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          error: validation.errors,
        });
      }

      // Prepare update data using centralized function
      const organiserData = {
        fullName: null,
        email: null,
        profilePic: null,
      };
      
      // Get organiser's current data
      const currentOrganiser = await User.findById(organiserId);
      if (currentOrganiser) {
        organiserData.fullName = currentOrganiser.fullName;
        organiserData.email = currentOrganiser.email;
        organiserData.profilePic = currentOrganiser.profilePic;
      }
      
      const processedData = processEventData(req.body, organiserData);
      const updateData = {};
      
      // Only include fields that are provided in the request
      Object.keys(processedData).forEach(key => {
        if (req.body[key] !== undefined && processedData[key] !== undefined) {
          updateData[key] = processedData[key];
        }
      });
      
      // Handle eventSports separately (can be array or string)
      if (req.body.eventSports !== undefined) {
        updateData.eventSports = Array.isArray(req.body.eventSports) 
          ? req.body.eventSports.map(s => s.trim()) 
          : [req.body.eventSports.trim()];
      }
      
      // Handle eventFrequency separately (can be array or string)
      if (req.body.eventFrequency !== undefined) {
        updateData.eventFrequency = Array.isArray(req.body.eventFrequency) 
          ? req.body.eventFrequency.map(f => typeof f === 'string' ? f.trim() : f)
          : [req.body.eventFrequency];
      }
      
      // Handle IsPrivateEvent
      if (req.body.IsPrivateEvent !== undefined || req.body.isPrivateEvent !== undefined) {
        const isPrivate = req.body.IsPrivateEvent === 'true' || req.body.IsPrivateEvent === true || 
                         req.body.isPrivateEvent === 'true' || req.body.isPrivateEvent === true;
        updateData.IsPrivateEvent = isPrivate;
      }

      // Handle eventDisallow
      if (req.body.eventDisallow !== undefined || req.body.disallow !== undefined) {
        const disallow = req.body.eventDisallow === 'true' || req.body.eventDisallow === true || 
                         req.body.disallow === 'true' || req.body.disallow === true;
        updateData.eventDisallow = disallow;
      }

      // Handle eventApprovalRequired
      if (req.body.eventApprovalRequired !== undefined || req.body.approvalRequired !== undefined) {
        const approvalRequired = req.body.eventApprovalRequired === 'true' || req.body.eventApprovalRequired === true || 
                                req.body.approvalRequired === 'true' || req.body.approvalRequired === true;
        updateData.eventApprovalRequired = approvalRequired;
      }

      // Handle policyJoind (value - string, number, etc.)
      if (req.body.policyJoind !== undefined) {
        updateData.policyJoind = typeof req.body.policyJoind === 'string' ? req.body.policyJoind.trim() : req.body.policyJoind;
      }
      
      // Handle status updates - support both eventStatus field and eventSavedraft boolean
      if (req.body.eventStatus && ['draft', 'past', 'ongoing', 'upcoming', 'completed', 'cancelled'].includes(req.body.eventStatus)) {
        updateData.eventStatus = req.body.eventStatus;
      } else if (req.body.eventSavedraft !== undefined || req.body.eventSaveDraft !== undefined) {
        // If eventSavedraft is provided, set status accordingly
        if (req.body.eventSavedraft === 'true' || req.body.eventSavedraft === true || 
            req.body.eventSaveDraft === 'true' || req.body.eventSaveDraft === true) {
          updateData.eventStatus = 'draft';
        } else if (event.eventStatus === 'draft') {
          // If changing from draft to published, recalculate status based on eventDateTime
          const { calculateEventStatus } = require('../../utils/eventFields');
          const newStatus = calculateEventStatus(updateData.eventDateTime || event.eventDateTime);
          updateData.eventStatus = newStatus;
        }
      } else if (updateData.eventDateTime) {
        // If eventDateTime is updated, recalculate status
        const { calculateEventStatus } = require('../../utils/eventFields');
        updateData.eventStatus = calculateEventStatus(updateData.eventDateTime);
      }

      // Update creator name if provided, otherwise keep existing or get from organiser
      if (req.body.eventCreatorName) {
        updateData.eventCreatorName = req.body.eventCreatorName.trim();
      } else if (currentOrganiser && currentOrganiser.fullName) {
        // If not provided, get from organiser's current profile
        updateData.eventCreatorName = currentOrganiser.fullName;
      }
      
      // Update creator email and profile pic from organiser if not provided
      if (!req.body.eventCreatorEmail && currentOrganiser && currentOrganiser.email) {
        updateData.eventCreatorEmail = currentOrganiser.email;
      }
      if (!req.body.eventCreatorProfilePic && currentOrganiser && currentOrganiser.profilePic) {
        updateData.eventCreatorProfilePic = currentOrganiser.profilePic;
      }

      // Handle file uploads - multiple images (use S3 URLs)
      const imageFiles = req.files?.eventImage || req.files?.game_image;
      if (imageFiles) {
        // Process multiple game images (optional - can be empty or any number)
        // Use S3 location (public URL) instead of local path
        let gameImages = [];
        if (Array.isArray(imageFiles)) {
          gameImages = imageFiles.map((file) => file.location);
        } else {
          // Handle single file (backward compatibility)
          gameImages = [imageFiles.location];
        }
        // If no images provided, gameImages will remain an empty array (optional)

        updateData.gameImages = gameImages;
        updateData.eventImages = gameImages; // Also update new field name
      } else {
        const rawUrls = req.body.eventImages || req.body.gameImages || req.body.imageUri || req.body.eventImage || req.body.game_image;
        if (rawUrls !== undefined && rawUrls !== null) {
          const urlsArray = Array.isArray(rawUrls) ? rawUrls : [rawUrls];
          const validUrls = urlsArray.filter((u) => typeof u === 'string' && u.trim().length > 0 && !u.startsWith('file://'));
          if (validUrls.length > 0) {
            updateData.gameImages = validUrls;
            updateData.eventImages = validUrls;
          }
        }
      }

      // Handle video upload (use S3 URL)
      const videoFile = req.files?.eventVideo || req.files?.game_video;
      if (videoFile) {
        // Process video (optional)
        // Use S3 location (public URL) instead of local path
        const video = Array.isArray(videoFile) ? videoFile[0] : videoFile;
        updateData.gameVideo = video.location;
        updateData.eventVideo = video.location; // Also update new field name
      }

      // Check if there's anything to update
      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No fields provided to update. Please provide at least one field to update.',
          fields: [
            'eventName', 'eventType', 'eventSports', 'eventDateTime', 'eventFrequency', 'eventLocation', 'eventDescription',
            'eventGender', 'eventSportsLevel', 'eventMinAge', 'eventMaxAge', 'eventLevelRestriction',
            'eventMaxGuest', 'eventPricePerGuest', 'IsPrivateEvent', 'eventOurGuestAllowed', 'eventApprovalReq',
            'eventDisallow', 'eventApprovalRequired', 'policyJoind',
            'eventRegistrationStartTime', 'eventRegistrationEndTime', 'eventStatus', 'eventSavedraft',
            'eventCreatorName', 'eventCreatorEmail', 'eventCreatorProfilePic', 'game_image', 'game_video'
          ],
        });
      }

      // Update event (use MongoDB ObjectId from found event)
      // Authorization is already verified above, so we can update directly
      const eventObjectId = event._id.toString ? event._id.toString() : event._id;
      
      // Debug logging
      console.log('Update Event Debug:', {
        eventId: event.eventId,
        eventMongoId: eventObjectId,
        organiserId: organiserId,
        eventCreatorId: event.creatorId.toString(),
        creatorMatch: event.creatorId.toString() === organiserId,
        updateDataKeys: Object.keys(updateData),
        updateData: updateData,
      });

      const updated = await Event.updateById(eventObjectId, updateData);

      if (!updated) {
        // Provide more detailed error information
        return res.status(400).json({
          success: false,
          error: 'Failed to update event. The event may not exist, you may not be the creator, or the values provided are the same as existing values.',
          eventId: event.eventId,
          eventMongoId: event._id.toString(),
          attemptedUpdates: Object.keys(updateData),
          suggestion: 'Ensure you are the event creator and that you are providing different values than the current event data.',
        });
      }

      // Get updated event (use MongoDB ObjectId from found event)
      const updatedEvent = await Event.findById(event._id);
      const creator = await User.findById(updatedEvent.creatorId);

      // Cascade event date/time changes to eventJoins and bookings collections
      const oldStart = event.eventDateTime ? new Date(event.eventDateTime) : (event.gameStartDate ? new Date(event.gameStartDate) : null);
      const newStart = updatedEvent.eventDateTime ? new Date(updatedEvent.eventDateTime) : null;
      const newEnd = updatedEvent.eventEndDateTime ? new Date(updatedEvent.eventEndDateTime) : null;

      if (newStart && oldStart && (oldStart.getTime() !== newStart.getTime() || (updateData.eventEndDateTime !== undefined && event.eventEndDateTime !== updateData.eventEndDateTime))) {
        try {
          const db = getDB();
          const joinsCollection = db.collection('eventJoins');
          const bookingsCollection = db.collection('bookings');
          const isNonRecurring = !updatedEvent.eventFrequency || !Array.isArray(updatedEvent.eventFrequency) || updatedEvent.eventFrequency.length === 0;

          const newStartIso = newStart.toISOString();
          const newEndIso = newEnd ? newEnd.toISOString() : null;

          if (isNonRecurring) {
            // For non-recurring events, ALL joins and bookings should point directly to the updated eventDateTime / eventEndDateTime
            await joinsCollection.updateMany(
              { $or: [{ eventId: eventObjectId }, { eventId: event.eventId }] },
              { $set: { occurrenceStart: newStartIso, occurrenceEnd: newEndIso } }
            );
            await bookingsCollection.updateMany(
              { $or: [{ eventId: eventObjectId }, { eventId: event.eventId }] },
              { $set: { occurrenceStart: newStartIso, occurrenceEnd: newEndIso } }
            );
          } else {
            // For recurring events:
            // 1. Update joins/bookings that matched exact old start
            const oldStartIso = oldStart.toISOString();
            await joinsCollection.updateMany(
              { $or: [{ eventId: eventObjectId }, { eventId: event.eventId }], occurrenceStart: oldStartIso },
              { $set: { occurrenceStart: newStartIso, occurrenceEnd: newEndIso } }
            );
            await bookingsCollection.updateMany(
              { $or: [{ eventId: eventObjectId }, { eventId: event.eventId }], occurrenceStart: oldStartIso },
              { $set: { occurrenceStart: newStartIso, occurrenceEnd: newEndIso } }
            );

            // 2. Adjust any other occurrence timestamps by the time delta so all sessions stay aligned
            const deltaMs = newStart.getTime() - oldStart.getTime();
            if (deltaMs !== 0) {
              const allJoins = await joinsCollection.find({ $or: [{ eventId: eventObjectId }, { eventId: event.eventId }], occurrenceStart: { $ne: newStartIso } }).toArray();
              for (const j of allJoins) {
                if (j.occurrenceStart) {
                  const adjStart = new Date(new Date(j.occurrenceStart).getTime() + deltaMs);
                  const adjEnd = j.occurrenceEnd ? new Date(new Date(j.occurrenceEnd).getTime() + deltaMs) : (newEnd ? new Date(adjStart.getTime() + (newEnd.getTime() - newStart.getTime())) : null);
                  await joinsCollection.updateOne(
                    { _id: j._id },
                    { $set: { occurrenceStart: adjStart.toISOString(), occurrenceEnd: adjEnd ? adjEnd.toISOString() : null } }
                  );
                }
              }
              const allBookings = await bookingsCollection.find({ $or: [{ eventId: eventObjectId }, { eventId: event.eventId }], occurrenceStart: { $ne: newStartIso } }).toArray();
              for (const b of allBookings) {
                if (b.occurrenceStart) {
                  const adjStart = new Date(new Date(b.occurrenceStart).getTime() + deltaMs);
                  const adjEnd = b.occurrenceEnd ? new Date(new Date(b.occurrenceEnd).getTime() + deltaMs) : (newEnd ? new Date(adjStart.getTime() + (newEnd.getTime() - newStart.getTime())) : null);
                  await bookingsCollection.updateOne(
                    { _id: b._id },
                    { $set: { occurrenceStart: adjStart.toISOString(), occurrenceEnd: adjEnd ? adjEnd.toISOString() : null } }
                  );
                }
              }
            }
          }
        } catch (cascadeErr) {
          console.error('⚠️ Failed to cascade event date/time update to joins and bookings:', cascadeErr);
        }
      }
      
      // If event was just cancelled, notify all participants
      if (updateData.eventStatus === 'cancelled' && event.eventStatus !== 'cancelled') {
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
            const organiserName = creator?.fullName || creator?.communityName || null;

            const title = 'Event cancelled';
            const message = organiserName
              ? `${organiserName} cancelled: ${event.eventName || 'this event'}`
              : `Event cancelled: ${event.eventName || 'this event'}`;

            // In-app notifications
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

            // Email/WhatsApp notifications
            for (const rid of recipientIds) {
              try {
                const recipientUser = await User.findById(rid);
                if (!recipientUser) continue;
                await sendEventCancelledNotification({ user: recipientUser, event });
              } catch (notifyError) {
                console.error(`Failed to send event cancellation notification to user ${rid}:`, notifyError);
              }
            }
          }
        } catch (cancelNotifError) {
          console.error('Error sending event cancellation notifications:', cancelNotifError);
        }
      } else if (updatedEvent.eventStatus !== 'draft') {
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
            const organiserName = creator?.fullName || creator?.communityName || 'The organiser';

            const title = 'Event Updated';
            const message = `${organiserName} has updated the details for "${updatedEvent.eventName || 'an event'}". Check the event page for the latest information.`;

            // In-app notifications
            const docs = recipientIds.map((rid) => ({
              recipientId: new ObjectId(rid),
              type: 'event_update',
              title,
              message,
              isRead: false,
              createdAt: now,
              updatedAt: now,
              data: {
                eventId: eventObjectId.toString(),
                organiserId: organiserId,
                eventTitle: updatedEvent.eventName || null,
                eventName: updatedEvent.eventName || null,
                eventDateTime: updatedEvent.eventDateTime || null,
              },
            }));

            await notificationsCollection.insertMany(docs, { ordered: false });

            // Push notification to attendees (session details updated)
            const EventJoinModel = require('../../models/EventJoin');
            const attendeeUserIds = await EventJoinModel.getAllParticipantUserIds(eventObjectId, null);
            const pushTokens = [];
            for (const uid of (attendeeUserIds || [])) {
              try {
                const attendee = await User.findById(uid.toString());
                if (attendee && attendee.fcmToken) pushTokens.push(attendee.fcmToken);
              } catch (_) { /* non-fatal */ }
            }
            if (pushTokens.length > 0) {
              sendPushToMany({
                tokens: pushTokens,
                title,
                body: message,
                data: {
                  type: 'event_update',
                  eventId: eventObjectId.toString(),
                  eventSeqId: event.eventId ? String(event.eventId) : '',
                },
              }).catch(err => console.error('[PUSH] event_update batch failed:', err.message));
            }
          }
        } catch (updateNotifError) {
          console.error('Error sending event update notifications:', updateNotifError);
        }
      }

      // Check if capacity increased and notify waitlist
      if (updateData.eventMaxGuest !== undefined && event.eventMaxGuest !== undefined && updateData.eventMaxGuest > event.eventMaxGuest) {
        try {
          const EventJoin = require('../../models/EventJoin');
          const currentOccupied = await EventJoin.getParticipantCount(updatedEvent._id);
          const availableSpots = updateData.eventMaxGuest - currentOccupied;
          
          if (availableSpots > 0) {
            const waitlistUsers = await Waitlist.getEventWaitlist(updatedEvent._id);
            if (waitlistUsers && waitlistUsers.length > 0) {
              console.log(`📣 [UPDATE-EVENT] Capacity increased. Notifying ${waitlistUsers.length} waitlisted users for event: ${updatedEvent._id}`);
              waitlistUsers.forEach(waitlistItem => {
                if (waitlistItem.user) {
                  sendWaitlistSpotAvailableNotification({
                    user: waitlistItem.user,
                    event: updatedEvent
                  }).catch(err => console.error('Waitlist notification failed:', err.message));
                }
              });
            }
          }
        } catch (capacityErr) {
          console.error('Error processing capacity increase waitlist notifications:', capacityErr);
        }
      }

      // Get creator details
      const creatorEmail = creator ? creator.email : null;
      const creatorProfilePic = creator ? creator.profilePic : null;

      const isDraft = updatedEvent.eventStatus === 'draft';
      res.status(200).json({
        success: true,
        message: isDraft ? 'Event saved as draft successfully' : 'Event updated successfully',
        data: {
          event: formatEventResponse(updatedEvent),
        },
      });
    } catch (error) {
      // Files are already uploaded to S3, no need to delete
      next(error);
    }
  });
};

module.exports = {
  updateEvent,
};

