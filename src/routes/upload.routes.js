const express = require('express');
const router = express.Router();
const {
  createS3Upload,
  getPublicUrl,
} = require('../middleware/s3Upload');
const { protect } = require('../middleware/auth');

/**
 * UPLOAD ROUTES - Examples for S3 Upload
 */

/**
 * Upload single image
 * POST /api/upload/image
 * Content-Type: multipart/form-data
 * 
 * Form Data:
 * - image: [file] (required)
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Image uploaded successfully",
 *   "data": {
 *     "url": "https://bucket.s3.region.amazonaws.com/uploads/images/file-1234567890.jpg",
 *     "key": "uploads/images/file-1234567890.jpg",
 *     "location": "https://bucket.s3.region.amazonaws.com/uploads/images/file-1234567890.jpg"
 *   }
 * }
 */
router.post('/image', protect, createS3Upload({
  folder: 'uploads/images',
  prefix: 'image',
  maxSize: 10 * 1024 * 1024, // 10MB
  fileType: 'image',
  fieldName: 'image',
}).single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image file provided',
      });
    }

    // req.file.location contains the public S3 URL
    res.status(200).json({
      success: true,
      message: 'Image uploaded successfully',
      data: {
        url: req.file.location,
        key: req.file.key,
        location: req.file.location,
        bucket: req.file.bucket,
        size: req.file.size,
        contentType: req.file.contentType,
        originalName: req.file.metadata?.originalName || req.file.originalname,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload image',
    });
  }
});

/**
 * Upload single video
 * POST /api/upload/video
 * Content-Type: multipart/form-data
 * 
 * Form Data:
 * - video: [file] (required)
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Video uploaded successfully",
 *   "data": {
 *     "url": "https://bucket.s3.region.amazonaws.com/uploads/videos/file-1234567890.mp4",
 *     "key": "uploads/videos/file-1234567890.mp4",
 *     "location": "https://bucket.s3.region.amazonaws.com/uploads/videos/file-1234567890.mp4"
 *   }
 * }
 */
router.post('/video', protect, createS3Upload({
  folder: 'uploads/videos',
  prefix: 'video',
  maxSize: 100 * 1024 * 1024, // 100MB
  fileType: 'video',
  fieldName: 'video',
}).single('video'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No video file provided',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Video uploaded successfully',
      data: {
        url: req.file.location,
        key: req.file.key,
        location: req.file.location,
        bucket: req.file.bucket,
        size: req.file.size,
        contentType: req.file.contentType,
        originalName: req.file.metadata?.originalName || req.file.originalname,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload video',
    });
  }
});

/**
 * Upload multiple images
 * POST /api/upload/images
 * Content-Type: multipart/form-data
 * 
 * Form Data:
 * - images: [file, file, ...] (required, multiple files)
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Images uploaded successfully",
 *   "data": {
 *     "urls": [
 *       "https://bucket.s3.region.amazonaws.com/uploads/images/file-1234567890.jpg",
 *       "https://bucket.s3.region.amazonaws.com/uploads/images/file-1234567891.jpg"
 *     ],
 *     "count": 2,
 *     "files": [
 *       {
 *         "url": "...",
 *         "key": "...",
 *         "size": 12345
 *       }
 *     ]
 *   }
 * }
 */
router.post('/images', protect, createS3Upload({
  folder: 'uploads/images',
  prefix: 'image',
  maxSize: 10 * 1024 * 1024, // 10MB per file
  fileType: 'image',
  fieldName: 'images',
}).array('images', 10), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No image files provided',
      });
    }

    const files = req.files.map((file) => ({
      url: file.location,
      key: file.key,
      location: file.location,
      bucket: file.bucket,
      size: file.size,
      contentType: file.contentType,
      originalName: file.metadata?.originalName || file.originalname,
    }));

    res.status(200).json({
      success: true,
      message: 'Images uploaded successfully',
      data: {
        urls: files.map((f) => f.url),
        count: files.length,
        files,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload images',
    });
  }
});

/**
 * Upload mixed media (images + video)
 * POST /api/upload/media
 * Content-Type: multipart/form-data
 * 
 * Form Data:
 * - images: [file, file, ...] (optional, multiple files)
 * - video: [file] (optional, single file)
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Media uploaded successfully",
 *   "data": {
 *     "images": [
 *       {
 *         "url": "...",
 *         "key": "..."
 *       }
 *     ],
 *     "video": {
 *       "url": "...",
 *       "key": "..."
 *     }
 *   }
 * }
 */
router.post('/media', protect, createS3Upload({
  folder: 'uploads/media',
  prefix: 'media',
  maxSize: 100 * 1024 * 1024, // 100MB
  fileType: 'media',
}).fields([
  { name: 'images', maxCount: 10 },
  { name: 'video', maxCount: 1 },
]), (req, res) => {
  try {
    const result = {
      images: [],
      video: null,
    };

    if (req.files.images) {
      result.images = req.files.images.map((file) => ({
        url: file.location,
        key: file.key,
        location: file.location,
        size: file.size,
        contentType: file.contentType,
        originalName: file.metadata?.originalName || file.originalname,
      }));
    }

    if (req.files.video && req.files.video.length > 0) {
      const file = req.files.video[0];
      result.video = {
        url: file.location,
        key: file.key,
        location: file.location,
        size: file.size,
        contentType: file.contentType,
        originalName: file.metadata?.originalName || file.originalname,
      };
    }

    if (result.images.length === 0 && !result.video) {
      return res.status(400).json({
        success: false,
        error: 'No media files provided',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Media uploaded successfully',
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload media',
    });
  }
});

module.exports = router;
