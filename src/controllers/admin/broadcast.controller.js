/**
 * broadcast.controller.js
 *
 * POST /api/admin/broadcasts
 *
 * Generic broadcast endpoint for superadmins to push messages
 * to subsets of users (or all users) via push and/or in-app notifications.
 *
 * Request body (all fields required unless noted):
 * {
 *   audience: {
 *     type: "all" | "players" | "organisers" | "user_ids",
 *     userIds?: string[]   // only when type === "user_ids"
 *   },
 *   message: {
 *     title: string,
 *     body: string,
 *     action?: {
 *       type: "deep_link" | "external_url" | "none",
 *       url?: string
 *     }
 *   },
 *   metadata?: {
 *     category?: "maintenance" | "update" | "promotion" | "security" | "announcement"
 *   },
 *   notification: {
 *     channel: "push" | "in_app" | "both",
 *     priority?: "high" | "normal"
 *   }
 * }
 *
 * Response: { broadcast_id, status: "queued" }
 */

const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../../config/database');
const { ObjectId } = require('mongodb');
const { sendPushToMany } = require('../../services/push.service');
const Notification = require('../../models/Notification');

// Valid enum values
const VALID_AUDIENCE_TYPES = ['all', 'players', 'organisers', 'user_ids'];
const VALID_CHANNELS = ['push', 'in_app', 'both'];
const VALID_PRIORITIES = ['high', 'normal'];
const VALID_CATEGORIES = ['maintenance', 'update', 'promotion', 'security', 'announcement'];
const VALID_ACTION_TYPES = ['deep_link', 'external_url', 'none'];

/**
 * Resolve the list of target users from the audience definition.
 * Returns an array of user documents.
 */
const resolveAudience = async (db, audience) => {
  const usersCollection = db.collection('users');

  switch (audience.type) {
    case 'all':
      return await usersCollection.find({}, { projection: { _id: 1, fcmToken: 1, userType: 1 } }).toArray();

    case 'players':
      return await usersCollection.find(
        { userType: 'player' },
        { projection: { _id: 1, fcmToken: 1, userType: 1 } }
      ).toArray();

    case 'organisers':
      return await usersCollection.find(
        { userType: 'organiser' },
        { projection: { _id: 1, fcmToken: 1, userType: 1 } }
      ).toArray();

    case 'user_ids': {
      if (!Array.isArray(audience.userIds) || audience.userIds.length === 0) {
        throw new Error('userIds array is required when audience.type is "user_ids"');
      }
      const objectIds = audience.userIds.map(id => {
        try { return new ObjectId(id); } catch (_) { return null; }
      }).filter(Boolean);
      return await usersCollection.find(
        { _id: { $in: objectIds } },
        { projection: { _id: 1, fcmToken: 1, userType: 1 } }
      ).toArray();
    }

    default:
      throw new Error(`Unknown audience type: ${audience.type}`);
  }
};

/**
 * @desc    Send a broadcast push and/or in-app notification to a set of users
 * @route   POST /api/admin/broadcasts
 * @access  Private (superadmin only)
 */
const createBroadcast = async (req, res, next) => {
  try {
    const db = getDB();
    const broadcastsCollection = db.collection('broadcasts');

    // ── 1. Validate payload ───────────────────────────────────────────────────
    const { audience, message, metadata, notification } = req.body;

    if (!audience || !audience.type) {
      return res.status(400).json({ success: false, error: 'audience.type is required' });
    }
    if (!VALID_AUDIENCE_TYPES.includes(audience.type)) {
      return res.status(400).json({ success: false, error: `audience.type must be one of: ${VALID_AUDIENCE_TYPES.join(', ')}` });
    }

    if (!message || typeof message.title !== 'string' || !message.title.trim()) {
      return res.status(400).json({ success: false, error: 'message.title is required and must be a non-empty string' });
    }
    if (!message || typeof message.body !== 'string' || !message.body.trim()) {
      return res.status(400).json({ success: false, error: 'message.body is required and must be a non-empty string' });
    }

    if (message.action) {
      if (!VALID_ACTION_TYPES.includes(message.action.type)) {
        return res.status(400).json({ success: false, error: `message.action.type must be one of: ${VALID_ACTION_TYPES.join(', ')}` });
      }
      if (['deep_link', 'external_url'].includes(message.action.type) && !message.action.url) {
        return res.status(400).json({ success: false, error: 'message.action.url is required for deep_link and external_url action types' });
      }
    }

    if (!notification || !notification.channel) {
      return res.status(400).json({ success: false, error: 'notification.channel is required' });
    }
    if (!VALID_CHANNELS.includes(notification.channel)) {
      return res.status(400).json({ success: false, error: `notification.channel must be one of: ${VALID_CHANNELS.join(', ')}` });
    }

    const priority = notification.priority || 'normal';
    if (!VALID_PRIORITIES.includes(priority)) {
      return res.status(400).json({ success: false, error: `notification.priority must be one of: ${VALID_PRIORITIES.join(', ')}` });
    }

    const category = metadata?.category;
    if (category && !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, error: `metadata.category must be one of: ${VALID_CATEGORIES.join(', ')}` });
    }

    // ── 2. Deduplication guard ────────────────────────────────────────────────
    // Reject if same title+body+audience was sent in the last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const duplicate = await broadcastsCollection.findOne({
      'message.title': message.title.trim(),
      'message.body': message.body.trim(),
      'audience.type': audience.type,
      status: 'sent',
      sentAt: { $gte: fiveMinutesAgo },
    });
    if (duplicate) {
      return res.status(409).json({
        success: false,
        error: 'Duplicate broadcast detected. This broadcast was already sent within the last 5 minutes.',
        existing_broadcast_id: duplicate.broadcastId,
      });
    }

    // ── 3. Generate broadcast ID and record ───────────────────────────────────
    const broadcastId = `brd_${uuidv4().replace(/-/g, '').slice(0, 20)}`;
    const now = new Date();

    const broadcastDoc = {
      broadcastId,
      audience,
      message: {
        title: message.title.trim(),
        body: message.body.trim(),
        action: message.action || null,
      },
      metadata: { category: category || null },
      notification: { channel: notification.channel, priority },
      sentBy: req.user.id,
      status: 'queued',
      createdAt: now,
    };

    await broadcastsCollection.insertOne(broadcastDoc);

    // Respond immediately — processing is fire-and-forget
    res.status(200).json({ broadcast_id: broadcastId, status: 'queued' });

    // ── 4. Resolve audience ───────────────────────────────────────────────────
    let users;
    try {
      users = await resolveAudience(db, audience);
    } catch (resolveErr) {
      await broadcastsCollection.updateOne(
        { broadcastId },
        { $set: { status: 'failed', error: resolveErr.message, updatedAt: new Date() } }
      );
      console.error(`[BROADCAST] ${broadcastId} audience resolution failed:`, resolveErr.message);
      return;
    }

    if (!users.length) {
      await broadcastsCollection.updateOne(
        { broadcastId },
        { $set: { status: 'sent', recipientCount: 0, sentAt: new Date(), updatedAt: new Date() } }
      );
      return;
    }

    const channel = notification.channel;
    const pushData = {
      type: 'broadcast',
      broadcastId,
      category: category || '',
      action_type: message.action?.type || 'none',
      action_url: message.action?.url || '',
    };

    // ── 5. Send push ──────────────────────────────────────────────────────────
    let pushSent = 0;
    if (channel === 'push' || channel === 'both') {
      const tokens = users.map(u => u.fcmToken).filter(t => t && t.trim());
      if (tokens.length > 0) {
        const pushResult = await sendPushToMany({
          tokens,
          title: message.title.trim(),
          body: message.body.trim(),
          data: pushData,
        });
        pushSent = pushResult.sentCount || 0;
      }
    }

    // ── 6. Send in-app ────────────────────────────────────────────────────────
    let inAppSent = 0;
    if (channel === 'in_app' || channel === 'both') {
      for (const user of users) {
        try {
          await Notification.create(
            user._id,
            'broadcast',
            message.title.trim(),
            message.body.trim(),
            {
              broadcastId,
              category: category || null,
              action: message.action || null,
            }
          );
          inAppSent++;
        } catch (notifErr) {
          console.error(`[BROADCAST] In-app notification failed for user ${user._id}:`, notifErr.message);
        }
      }
    }

    // ── 7. Update broadcast status ────────────────────────────────────────────
    await broadcastsCollection.updateOne(
      { broadcastId },
      {
        $set: {
          status: 'sent',
          recipientCount: users.length,
          pushSent,
          inAppSent,
          sentAt: new Date(),
          updatedAt: new Date(),
        },
      }
    );

    console.log(`✅ [BROADCAST] ${broadcastId}: sent push=${pushSent} in_app=${inAppSent} to ${users.length} users`);
  } catch (error) {
    next(error);
  }
};

module.exports = { createBroadcast };
