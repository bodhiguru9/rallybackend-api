const { getDB } = require('../config/database');
const { ObjectId } = require('mongodb');
const { sendPushToMany, sendPushNotification } = require('./push.service');
const Notification = require('../models/Notification');

/**
 * Notify subscribers (followers) of an organiser when a new package is created.
 *
 * @param {Object} options
 * @param {string|ObjectId} options.organiserId - The organiser's user ID
 * @param {Object} options.package - The newly created package document
 * @param {Object} [options.organiser] - The organiser user object (optional, will fetch if missing)
 * @returns {Promise<{success: boolean, totalSubscribers: number, pushSentCount: number, inAppCount: number}>}
 */
async function notifySubscribersOnPackageCreation({ organiserId, package: pkg, organiser = null }) {
  try {
    const db = getDB();
    const followsCollection = db.collection('follows');
    const usersCollection = db.collection('users');
    const notificationsCollection = db.collection('notifications');

    const organiserObjectId = typeof organiserId === 'string' ? new ObjectId(organiserId) : organiserId;

    // Resolve organiser details (display name and image)
    let organiserDoc = organiser;
    if (!organiserDoc || (!organiserDoc.communityName && !organiserDoc.fullName)) {
      try {
        organiserDoc = (await usersCollection.findOne({ _id: organiserObjectId })) || organiserDoc || {};
      } catch (_) {
        organiserDoc = organiserDoc || {};
      }
    }

    const organiserName =
      organiserDoc?.communityName || organiserDoc?.fullName || 'An organiser';

    // Find all followers (subscribers) of this organiser
    const followerDocs = await followsCollection
      .find({ followingId: organiserObjectId })
      .project({ followerId: 1 })
      .toArray();

    const followerIds = Array.from(
      new Set(followerDocs.map((d) => d?.followerId?.toString()).filter(Boolean))
    )
      .filter((id) => id !== organiserObjectId.toString()) // Exclude the organiser themselves
      .map((id) => new ObjectId(id));

    if (followerIds.length === 0) {
      console.log(`[PACKAGE-NOTIF] Organiser ${organiserObjectId} has no subscribers. Skipping notification.`);
      return {
        success: true,
        totalSubscribers: 0,
        pushSentCount: 0,
        inAppCount: 0,
        reason: 'No subscribers found',
      };
    }

    // Retrieve active subscriber user records
    const subscribers = await usersCollection
      .find({ _id: { $in: followerIds } })
      .project({ _id: 1, fcmToken: 1, userType: 1, fullName: 1, email: 1 })
      .toArray();

    if (subscribers.length === 0) {
      console.log(`[PACKAGE-NOTIF] No subscriber user documents found for organiser ${organiserObjectId}.`);
      return {
        success: true,
        totalSubscribers: 0,
        pushSentCount: 0,
        inAppCount: 0,
        reason: 'No subscriber accounts found',
      };
    }

    // Prepare notification details
    const packageId = pkg?.packageId ? String(pkg.packageId) : (pkg?._id ? String(pkg._id) : '');
    const packageName = pkg?.packageName || 'New Package';
    const packagePrice = pkg?.packagePrice ?? pkg?.price ?? 0;
    const imageUrl =
      pkg?.imageUri || (Array.isArray(pkg?.packageImages) && pkg.packageImages[0]) || null;

    const title = `New Package from ${organiserName}`;
    const body = `${organiserName} just published a new package: "${packageName}". Check it out!`;

    const pushData = {
      type: 'new_package',
      packageId: String(packageId),
      packageName: String(packageName),
      organiserId: organiserObjectId.toString(),
      organiserName: String(organiserName),
      packagePrice: String(packagePrice),
    };

    // 1. Send push notifications via FCM
    const fcmTokens = subscribers
      .map((s) => s.fcmToken)
      .filter((t) => t && typeof t === 'string' && t.trim() !== '');

    let pushSentCount = 0;
    if (fcmTokens.length > 0) {
      try {
        const pushResult = await sendPushToMany({
          tokens: fcmTokens,
          title,
          body,
          data: pushData,
          imageUrl: imageUrl || undefined,
        });
        pushSentCount = pushResult.sentCount || 0;
        console.log(
          `[PACKAGE-NOTIF] Push sent to ${pushSentCount}/${fcmTokens.length} subscriber devices for package "${packageName}"`
        );
      } catch (pushErr) {
        console.error('[PACKAGE-NOTIF] Failed sending push to subscribers:', pushErr.message);
      }
    } else {
      console.log(`[PACKAGE-NOTIF] None of the ${subscribers.length} subscribers have an FCM token registered.`);
    }

    // 2. Save in-app notifications so subscribers see it in their notification feed
    let inAppCount = 0;
    const now = new Date();
    const notificationDocs = subscribers.map((sub) => ({
      recipientId: sub._id,
      type: 'new_package',
      title,
      message: body,
      data: {
        packageId,
        packageName,
        packagePrice,
        organiserId: organiserObjectId.toString(),
        organiserName,
        imageUrl: imageUrl || null,
      },
      isRead: false,
      createdAt: now,
      updatedAt: now,
    }));

    if (notificationDocs.length > 0) {
      try {
        const insertResult = await notificationsCollection.insertMany(notificationDocs, {
          ordered: false,
        });
        inAppCount = insertResult.insertedCount || notificationDocs.length;
      } catch (dbErr) {
        console.error('[PACKAGE-NOTIF] Failed saving in-app notifications:', dbErr.message);
      }
    }

    return {
      success: true,
      totalSubscribers: subscribers.length,
      pushSentCount,
      inAppCount,
    };
  } catch (error) {
    console.error('[PACKAGE-NOTIF] Error in notifySubscribersOnPackageCreation:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Send in-app and FCM push notifications when a package is purchased.
 * Notifies both the organiser (new sale) and the player (purchase confirmation).
 *
 * @param {Object} options
 * @param {string|ObjectId} options.buyerId - ID of the buyer (player)
 * @param {string|ObjectId} [options.organiserId] - ID of the package creator (optional if on pkg)
 * @param {Object} options.package - The package document
 * @param {Object} options.purchase - The purchase document
 * @returns {Promise<{success: boolean, organiserPush: boolean, buyerPush: boolean}>}
 */
async function notifyOnPackagePurchase({ buyerId, organiserId, package: pkg, purchase }) {
  try {
    const db = getDB();
    const usersCollection = db.collection('users');

    const buyerObjectId = typeof buyerId === 'string' ? new ObjectId(buyerId) : buyerId;
    const targetOrganiserId = organiserId || pkg?.organiserId;
    const organiserObjectId = targetOrganiserId
      ? (typeof targetOrganiserId === 'string' ? new ObjectId(targetOrganiserId) : targetOrganiserId)
      : null;

    // Fetch buyer and organiser documents concurrently
    const [buyerDoc, organiserDoc] = await Promise.all([
      usersCollection.findOne({ _id: buyerObjectId }),
      organiserObjectId ? usersCollection.findOne({ _id: organiserObjectId }) : Promise.resolve(null),
    ]);

    const buyerName = buyerDoc?.fullName || 'A player';
    const packageName = pkg?.packageName || 'Package';
    const packageSeqId = pkg?.packageId ? String(pkg.packageId) : (pkg?._id ? String(pkg._id) : '');
    const packageMongoId = pkg?._id ? String(pkg._id) : '';
    const purchaseIdStr = purchase?._id ? String(purchase._id) : '';
    const imageUrl = pkg?.imageUri || (Array.isArray(pkg?.packageImages) && pkg.packageImages[0]) || null;

    const notifData = {
      packageId: packageSeqId,
      packageMongoId,
      purchaseId: purchaseIdStr,
      userId: buyerObjectId.toString(),
      playerId: buyerDoc?.userId ? String(buyerDoc.userId) : '',
      organiserId: organiserObjectId ? organiserObjectId.toString() : '',
    };

    let organiserPushSent = false;
    let buyerPushSent = false;

    // 1. Organiser Notification (In-App + FCM Push)
    if (organiserObjectId) {
      const organiserTitle = 'Package Purchased';
      const organiserBody = `${buyerName} has purchased your package: ${packageName}`;

      // In-app
      try {
        await Notification.create(
          organiserObjectId,
          'package_purchase',
          organiserTitle,
          organiserBody,
          notifData
        );
      } catch (inAppErr) {
        console.error('[PACKAGE-PURCHASE-NOTIF] In-app notification to organiser failed:', inAppErr.message);
      }

      // FCM Push
      if (organiserDoc?.fcmToken) {
        try {
          const pushResult = await sendPushNotification({
            token: organiserDoc.fcmToken,
            title: 'New Package Purchase! 🎉',
            body: `${buyerName} just purchased "${packageName}".`,
            data: {
              type: 'package_purchase',
              packageId: packageSeqId,
              packageMongoId,
              purchaseId: purchaseIdStr,
              userId: buyerObjectId.toString(),
              playerId: buyerDoc?.userId ? String(buyerDoc.userId) : '',
              buyerName: String(buyerName),
              packageName: String(packageName),
            },
            imageUrl: imageUrl || undefined,
          });
          organiserPushSent = !pushResult?.skipped && pushResult?.success !== false;
          console.log(`[PACKAGE-PURCHASE-NOTIF] FCM Push sent to organiser ${organiserObjectId}:`, organiserPushSent);
        } catch (pushErr) {
          console.error('[PACKAGE-PURCHASE-NOTIF] FCM push to organiser failed:', pushErr.message);
        }
      } else {
        console.log(`[PACKAGE-PURCHASE-NOTIF] Organiser ${organiserObjectId} has no registered FCM token.`);
      }
    }

    // 2. Player Notification (In-App + FCM Push)
    if (buyerObjectId) {
      const playerTitle = 'Package Purchase Confirmed';
      const playerBody = `You have successfully purchased ${packageName}!`;

      // In-app
      try {
        await Notification.create(
          buyerObjectId,
          'package_purchase_confirmed',
          playerTitle,
          playerBody,
          {
            ...notifData,
            packageName,
          }
        );
      } catch (inAppErr) {
        console.error('[PACKAGE-PURCHASE-NOTIF] In-app notification to player failed:', inAppErr.message);
      }

      // FCM Push
      if (buyerDoc?.fcmToken) {
        try {
          const pushResult = await sendPushNotification({
            token: buyerDoc.fcmToken,
            title: 'Package Purchased! 🎉',
            body: `You have successfully purchased "${packageName}".`,
            data: {
              type: 'package_purchase_confirmed',
              packageId: packageSeqId,
              packageMongoId,
              purchaseId: purchaseIdStr,
              packageName: String(packageName),
            },
            imageUrl: imageUrl || undefined,
          });
          buyerPushSent = !pushResult?.skipped && pushResult?.success !== false;
          console.log(`[PACKAGE-PURCHASE-NOTIF] FCM Push sent to buyer ${buyerObjectId}:`, buyerPushSent);
        } catch (pushErr) {
          console.error('[PACKAGE-PURCHASE-NOTIF] FCM push to buyer failed:', pushErr.message);
        }
      }
    }

    return {
      success: true,
      organiserPush: organiserPushSent,
      buyerPush: buyerPushSent,
    };
  } catch (error) {
    console.error('[PACKAGE-PURCHASE-NOTIF] Error in notifyOnPackagePurchase:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

module.exports = {
  notifySubscribersOnPackageCreation,
  notifyOnPackagePurchase,
};
