const { getDB } = require('../../config/database');
const { ObjectId } = require('mongodb');
const { isOwnedSnapUrl, extractS3Key } = require('../../utils/snapUrl');
const { MAX_SNAPS } = require('../../constants/snaps');
const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { s3Client, S3_CONFIG } = require('../../config/s3');
const crypto = require('crypto');

/**
 * @desc    Add snaps for an organiser
 * @route   POST /api/users/:id/snaps
 * @access  Private (Organiser only)
 */
const addSnap = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { urls } = req.body;
    
    // Auth check
    if (req.user.id !== parseInt(id) && req.user.mongoId !== id) {
      return res.status(403).json({ success: false, error: 'Unauthorized to add snaps for this user' });
    }

    if (req.user.userType !== 'organiser') {
      return res.status(403).json({ success: false, error: 'Only organisers can add snaps' });
    }

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ success: false, error: 'urls array is required and must not be empty' });
    }

    if (urls.length > MAX_SNAPS) {
      return res.status(400).json({ success: false, error: `Cannot add more than ${MAX_SNAPS} snaps at once` });
    }

    const uniqueUrls = [...new Set(urls)];

    // Validate URLs
    for (const url of uniqueUrls) {
      if (!isOwnedSnapUrl(url, req.user.id)) {
        return res.status(400).json({ success: false, error: 'One or more URLs are invalid or not owned by this user' });
      }
    }

    const newSnaps = uniqueUrls.map((url) => ({
      id: crypto.randomUUID(),
      url,
      createdAt: new Date()
    }));

    const db = getDB();
    const usersCollection = db.collection('users');

    const objectId = req.user.mongoId ? new ObjectId(req.user.mongoId) : null;
    const filter = objectId ? { _id: objectId } : { userId: req.user.id };

    // Atomic check and push
    const result = await usersCollection.findOneAndUpdate(
      {
        ...filter,
        $expr: {
          $lte: [
            { $add: [{ $size: { $ifNull: ['$snaps', []] } }, newSnaps.length] },
            MAX_SNAPS
          ]
        }
      },
      {
        $push: { snaps: { $each: newSnaps, $position: 0 } }
      },
      { returnDocument: 'after' }
    );

    if (!result || !result.value) {
      // Best-effort delete of the just-submitted objects from S3
      for (const url of uniqueUrls) {
        const key = extractS3Key(url);
        if (key) {
          const bucket = process.env.AWS_S3_BUCKET_NAME || S3_CONFIG.bucket;
          try {
            await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
          } catch (e) {
            console.error('Failed to cleanup rejected snap from S3:', key, e);
          }
        }
      }
      return res.status(409).json({ success: false, error: `Snap limit reached. Maximum allowed is ${MAX_SNAPS}.` });
    }

    return res.status(200).json({
      success: true,
      data: { snaps: result.value.snaps || [] }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { addSnap };
