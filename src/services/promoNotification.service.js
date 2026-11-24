/**
 * Push + in-app notification to an organiser's subscribers (followers) about a promo code.
 * Pattern copied from packageNotification.service.js. Anyone eligible can still use the code;
 * this only tells followers about it.
 */
const { ObjectId } = require('mongodb');
const { getDB } = require('../config/database');
const { sendPushToMany } = require('./push.service');

const describeOffer = (code) =>
  code.discountType === 'percentage' ? `${code.discountValue}% off` : `AED ${code.discountValue} off`;

/**
 * @param {{organiserId: string|ObjectId, promoCode: object}} p
 * @returns {Promise<{success: boolean, totalSubscribers: number, pushSentCount: number, inAppCount: number}>}
 */
async function notifyFollowersOfPromo({ organiserId, promoCode }) {
  try {
    const db = getDB();
    const organiserObjectId = typeof organiserId === 'string' ? new ObjectId(organiserId) : organiserId;

    const organiser = await db.collection('users').findOne({ _id: organiserObjectId });
    const organiserName = (organiser && (organiser.communityName || organiser.fullName)) || 'An organiser';

    const followerDocs = await db
      .collection('follows')
      .find({ followingId: organiserObjectId })
      .project({ followerId: 1 })
      .toArray();
    const followerIds = [...new Set(followerDocs.map((d) => d.followerId && d.followerId.toString()).filter(Boolean))]
      .filter((id) => id !== organiserObjectId.toString())
      .map((id) => new ObjectId(id));

    if (followerIds.length === 0) {
      return { success: true, totalSubscribers: 0, pushSentCount: 0, inAppCount: 0 };
    }

    const subscribers = await db
      .collection('users')
      .find({ _id: { $in: followerIds } })
      .project({ _id: 1, fcmToken: 1 })
      .toArray();

    const title = `${organiserName} has a promo code for you`;
    const body = `Use code ${promoCode.code} for ${describeOffer(promoCode)}${
      promoCode.validUntil ? ` until ${new Date(promoCode.validUntil).toISOString().slice(0, 10)}` : ''
    }.`;

    const tokens = subscribers.map((s) => s.fcmToken).filter((t) => typeof t === 'string' && t.trim() !== '');
    let pushSentCount = 0;
    if (tokens.length > 0) {
      try {
        const result = await sendPushToMany({
          tokens,
          title,
          body,
          data: {
            type: 'promo_code',
            code: String(promoCode.code),
            organiserId: organiserObjectId.toString(),
            organiserName: String(organiserName),
          },
        });
        pushSentCount = result.sentCount || 0;
      } catch (pushErr) {
        console.error('[PROMO-NOTIF] push failed:', pushErr.message);
      }
    }

    let inAppCount = 0;
    const now = new Date();
    const docs = subscribers.map((sub) => ({
      recipientId: sub._id,
      type: 'promo_code',
      title,
      message: body,
      data: { code: promoCode.code, organiserId: organiserObjectId.toString(), organiserName },
      isRead: false,
      createdAt: now,
      updatedAt: now,
    }));
    if (docs.length > 0) {
      try {
        const res = await db.collection('notifications').insertMany(docs, { ordered: false });
        inAppCount = res.insertedCount || docs.length;
      } catch (dbErr) {
        console.error('[PROMO-NOTIF] saving in-app notifications failed:', dbErr.message);
      }
    }

    return { success: true, totalSubscribers: subscribers.length, pushSentCount, inAppCount };
  } catch (error) {
    console.error('[PROMO-NOTIF] error:', error.message);
    return { success: false, totalSubscribers: 0, pushSentCount: 0, inAppCount: 0, error: error.message };
  }
}

module.exports = { notifyFollowersOfPromo };
