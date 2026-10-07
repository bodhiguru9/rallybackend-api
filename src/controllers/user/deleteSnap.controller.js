const { getDB } = require('../../config/database');
const { ObjectId } = require('mongodb');
const { extractS3Key } = require('../../utils/snapUrl');
const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { s3Client, S3_CONFIG } = require('../../config/s3');

/**
 * @desc    Delete a snap for an organiser
 * @route   DELETE /api/users/:id/snaps/:snapId
 * @access  Private (Organiser only)
 */
const deleteSnap = async (req, res, next) => {
  try {
    const { id, snapId } = req.params;

    // Auth check
    if (req.user.id !== parseInt(id) && req.user.mongoId !== id) {
      return res.status(403).json({ success: false, error: 'Unauthorized to delete snaps for this user' });
    }

    if (req.user.userType !== 'organiser') {
      return res.status(403).json({ success: false, error: 'Only organisers can delete snaps' });
    }

    const db = getDB();
    const usersCollection = db.collection('users');

    const objectId = req.user.mongoId ? new ObjectId(req.user.mongoId) : null;
    const filter = objectId ? { _id: objectId } : { userId: req.user.id };

    // Pull the snap from the array and return the original document to get the URL
    // Actually, findOneAndUpdate with returnDocument: 'before' gets the document before modification
    const result = await usersCollection.findOneAndUpdate(
      filter,
      {
        $pull: { snaps: { id: snapId } }
      },
      { returnDocument: 'before' }
    );

    if (!result || !result.value) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const removedSnap = (result.value.snaps || []).find(s => s.id === snapId);
    if (!removedSnap) {
      return res.status(404).json({ success: false, error: 'Snap not found' });
    }

    // Get the updated user document to return
    const updatedUser = await usersCollection.findOne(filter);

    // Best-effort delete from S3
    const key = extractS3Key(removedSnap.url);
    if (key) {
      const bucket = process.env.AWS_S3_BUCKET_NAME || S3_CONFIG.bucket;
      try {
        await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      } catch (e) {
        console.error('Failed to cleanup deleted snap from S3:', key, e);
      }
    }

    return res.status(200).json({
      success: true,
      data: { snaps: updatedUser.snaps || [] }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { deleteSnap };
