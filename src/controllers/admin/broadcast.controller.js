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
const { createTransporter } = require('../../utils/email');
const { sendWhatsAppMessage } = require('../../services/twilio.service');
const Notification = require('../../models/Notification');

// Valid enum values
const VALID_AUDIENCE_TYPES = ['all', 'players', 'organisers', 'user_ids'];
const VALID_CHANNELS = ['push', 'in_app', 'both', 'email', 'whatsapp', 'all'];
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
      return await usersCollection.find({}, { projection: { _id: 1, fcmToken: 1, userType: 1, email: 1, whatsappNumber: 1, mobileNumber: 1 } }).toArray();

    case 'players':
      return await usersCollection.find(
        { userType: 'player' },
        { projection: { _id: 1, fcmToken: 1, userType: 1, email: 1, whatsappNumber: 1, mobileNumber: 1 } }
      ).toArray();

    case 'organisers':
      return await usersCollection.find(
        { userType: 'organiser' },
        { projection: { _id: 1, fcmToken: 1, userType: 1, email: 1, whatsappNumber: 1, mobileNumber: 1 } }
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
        { projection: { _id: 1, fcmToken: 1, userType: 1, email: 1, whatsappNumber: 1, mobileNumber: 1 } }
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

    let activeChannels = [];
    if (notification && Array.isArray(notification.channels)) {
      activeChannels = notification.channels;
      const validBase = ['push', 'in_app', 'email', 'whatsapp'];
      for (const ch of activeChannels) {
        if (!validBase.includes(ch)) {
          return res.status(400).json({ success: false, error: `notification.channels items must be one of: ${validBase.join(', ')}` });
        }
      }
    } else if (notification && notification.channel) {
      if (!VALID_CHANNELS.includes(notification.channel)) {
        return res.status(400).json({ success: false, error: `notification.channel must be one of: ${VALID_CHANNELS.join(', ')}` });
      }
      if (notification.channel === 'both') activeChannels = ['push', 'in_app'];
      else if (notification.channel === 'all') activeChannels = ['push', 'in_app', 'email', 'whatsapp'];
      else activeChannels = [notification.channel];
    } else {
      return res.status(400).json({ success: false, error: 'notification.channel or notification.channels is required' });
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
      notification: { 
        channel: notification.channel || 'custom', 
        channels: activeChannels,
        priority 
      },
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
    if (activeChannels.includes('push')) {
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
    if (activeChannels.includes('in_app')) {
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

    // ── 6a. Send Email ────────────────────────────────────────────────────────
    let emailSent = 0;
    if (activeChannels.includes('email')) {
      let transporter;
      try {
        transporter = createTransporter();
      } catch (err) {
        console.error('[BROADCAST] Could not create email transporter:', err.message);
      }
      
      if (transporter) {
        const emailId = process.env.Email_ID || process.env.EMAIL_ID || process.env.EMAIL_USER;
        const appName = process.env.APP_NAME || 'Rally';
        
        for (const user of users) {
          if (user.email) {
            try {
              const mailOptions = {
                from: `"${appName}" <${emailId}>`,
                to: user.email,
                subject: message.title.trim(),
                html: `
                  <!DOCTYPE html>
                  <html>
                  <head>
                    <style>
                      body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                      .footer { margin-top: 30px; font-size: 12px; color: #666; }
                      ${message.action?.url ? '.button { display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; } .button:hover { background-color: #0056b3; }' : ''}
                    </style>
                  </head>
                  <body>
                    <div class="container">
                      <h2>${message.title.trim()}</h2>
                      <p>${message.body.trim().replace(/\n/g, '<br>')}</p>
                      ${message.action?.url ? `<a href="${message.action.url}" class="button">View Action</a>` : ''}
                      <div class="footer">
                        <p>This is an automated message from ${appName}.</p>
                      </div>
                    </div>
                  </body>
                  </html>
                `,
                text: `${message.title.trim()}\n\n${message.body.trim()}${message.action?.url ? `\n\nLink: ${message.action.url}` : ''}`
              };
              await transporter.sendMail(mailOptions);
              emailSent++;
            } catch (emailErr) {
              console.error(`[BROADCAST] Email failed for user ${user._id}:`, emailErr.message);
            }
          }
        }
      }
    }

    // ── 6b. Send WhatsApp ─────────────────────────────────────────────────────
    let whatsappSent = 0;
    if (activeChannels.includes('whatsapp')) {
      for (const user of users) {
        const targetNumber = user.whatsappNumber || user.mobileNumber;
        if (targetNumber) {
          try {
            let messageText = `*${message.title.trim()}*\n\n${message.body.trim()}`;
            if (message.action?.url) {
              messageText += `\n\nLink: ${message.action.url}`;
            }
            await sendWhatsAppMessage(targetNumber, messageText);
            whatsappSent++;
          } catch (waErr) {
            console.error(`[BROADCAST] WhatsApp failed for user ${user._id}:`, waErr.message);
          }
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
          emailSent,
          whatsappSent,
          sentAt: new Date(),
          updatedAt: new Date(),
        },
      }
    );

    console.log(`✅ [BROADCAST] ${broadcastId}: sent push=${pushSent} in_app=${inAppSent} email=${emailSent} whatsapp=${whatsappSent} to ${users.length} users`);
  } catch (error) {
    next(error);
  }
};

module.exports = { createBroadcast };
