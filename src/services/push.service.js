/**
 * push.service.js
 *
 * Firebase Cloud Messaging (FCM) push notification service.
 * Uses the firebase-admin SDK (HTTP v1 API).
 *
 * Gracefully no-ops when FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL /
 * FIREBASE_PRIVATE_KEY environment variables are not set, so the app
 * still starts in local dev without credentials.
 */

let messagingInstance = null;
let initialized = false;

/**
 * Initialize the Firebase Admin SDK.
 * Call once at server startup (src/index.js).
 */
const initializePushService = () => {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    console.warn(
      '⚠️  [PUSH] Firebase credentials not configured ' +
      '(FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY). ' +
      'Push notifications will be skipped.'
    );
    initialized = false;
    return;
  }

  try {
    const { initializeApp, getApps, cert } = require('firebase-admin/app');
    const { getMessaging } = require('firebase-admin/messaging');

    if (getApps().length === 0) {
      initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n'),
        }),
      });
    }

    messagingInstance = getMessaging();
    initialized = true;
    console.log('✅ [PUSH] Firebase Admin SDK initialized for project:', projectId);
  } catch (err) {
    console.error('❌ [PUSH] Failed to initialize Firebase Admin SDK:', err.message);
    initialized = false;
  }
};

/**
 * Send a push notification to a single device.
 *
 * @param {Object} options
 * @param {string}  options.token   - FCM device token
 * @param {string}  options.title   - Notification title (shown in system tray)
 * @param {string}  options.body    - Notification body text
 * @param {Object}  [options.data]  - Key/value string pairs for client-side routing
 * @param {string}  [options.imageUrl] - Optional image URL (shown on Android / rich iOS)
 * @returns {Promise<{success: boolean, messageId?: string, skipped?: boolean}>}
 */
const sendPushNotification = async ({ token, title, body, data = {}, imageUrl = null }) => {
  if (!initialized || !messagingInstance) {
    return { success: false, skipped: true, reason: 'Push service not initialized' };
  }

  if (!token || typeof token !== 'string' || token.trim() === '') {
    console.log('⚠️  [PUSH] No valid FCM token — skipping push');
    return { success: false, skipped: true, reason: 'No FCM token' };
  }

  // FCM requires all data values to be strings
  const stringData = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== null && v !== undefined) {
      stringData[k] = String(v);
    }
  }

  const message = {
    token: token.trim(),
    notification: {
      title,
      body,
      ...(imageUrl ? { imageUrl } : {}),
    },
    data: stringData,
    android: {
      priority: 'high',
      notification: {
        sound: 'default',
        ...(imageUrl ? { imageUrl } : {}),
      },
    },
    apns: {
      headers: { 'apns-priority': '10' },
      payload: {
        aps: {
          sound: 'default',
          badge: 1,
        },
      },
      ...(imageUrl ? { fcmOptions: { imageUrl } } : {}),
    },
  };

  try {
    const messageId = await messagingInstance.send(message);
    console.log(`✅ [PUSH] Sent to token ${token.slice(0, 12)}… → messageId: ${messageId}`);
    return { success: true, messageId };
  } catch (err) {
    // Token expired / app uninstalled — log but don't crash
    console.error(`❌ [PUSH] Failed to send to token ${token.slice(0, 12)}…: ${err.message} (code: ${err.code || 'unknown'})`);
    return { success: false, error: err.message, code: err.code };
  }
};

/**
 * Send a push notification to multiple devices.
 * Uses FCM sendEach (up to 500 tokens per call; batches automatically).
 *
 * @param {Object}   options
 * @param {string[]} options.tokens  - Array of FCM device tokens (null/empty entries are filtered)
 * @param {string}   options.title
 * @param {string}   options.body
 * @param {Object}   [options.data]
 * @param {string}   [options.imageUrl]
 * @returns {Promise<{success: boolean, sentCount: number, failedCount: number, skipped?: boolean}>}
 */
const sendPushToMany = async ({ tokens, title, body, data = {}, imageUrl = null }) => {
  if (!initialized || !messagingInstance) {
    return { success: false, skipped: true, reason: 'Push service not initialized', sentCount: 0, failedCount: 0 };
  }

  // Filter out empty/null tokens
  const validTokens = (tokens || []).filter(t => t && typeof t === 'string' && t.trim() !== '');

  if (validTokens.length === 0) {
    console.log('⚠️  [PUSH] sendPushToMany: no valid tokens — skipping');
    return { success: true, skipped: true, reason: 'No valid tokens', sentCount: 0, failedCount: 0 };
  }

  const stringData = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== null && v !== undefined) {
      stringData[k] = String(v);
    }
  }

  // Build individual message objects (FCM sendEach requires one per token)
  const messages = validTokens.map(token => ({
    token,
    notification: {
      title,
      body,
      ...(imageUrl ? { imageUrl } : {}),
    },
    data: stringData,
    android: {
      priority: 'high',
      notification: { 
        title,
        body,
        sound: 'default', 
        ...(imageUrl ? { imageUrl } : {}) 
      },
    },
    apns: {
      headers: { 'apns-priority': '10' },
      payload: { aps: { sound: 'default', badge: 1 } },
      ...(imageUrl ? { fcmOptions: { imageUrl } } : {}),
    },
  }));

  // FCM sendEach handles batches of up to 500 — call in chunks if needed
  const BATCH_SIZE = 500;
  let totalSent = 0;
  let totalFailed = 0;

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    try {
      const batchResponse = await messagingInstance.sendEach(batch);
      totalSent += batchResponse.successCount;
      totalFailed += batchResponse.failureCount;

      if (batchResponse.failureCount > 0) {
        batchResponse.responses.forEach((resp, idx) => {
          if (!resp.success) {
            console.warn(`⚠️  [PUSH] Token ${batch[idx].token.slice(0, 12)}… failed: ${resp.error?.message}`);
          }
        });
      }
    } catch (err) {
      console.error('❌ [PUSH] sendEach batch failed:', err.message);
      totalFailed += batch.length;
    }
  }

  console.log(`📣 [PUSH] sendPushToMany: sent=${totalSent} failed=${totalFailed} of ${validTokens.length}`);
  return { success: totalFailed < validTokens.length, sentCount: totalSent, failedCount: totalFailed };
};

module.exports = {
  initializePushService,
  sendPushNotification,
  sendPushToMany,
};
