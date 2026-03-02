const multer = require('multer');
const multerS3 = require('multer-s3');
const path = require('path');
const { s3Client, S3_CONFIG } = require('../config/s3');

/**
 * Get MIME type based on file extension
 */
const getContentType = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    // Images
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    // Videos
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.wmv': 'video/x-ms-wmv',
    '.flv': 'video/x-flv',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
  };
  return mimeTypes[ext] || 'application/octet-stream';
};

/**
 * Generate unique filename
 */
const generateUniqueFilename = (originalname, prefix = '') => {
  const ext = path.extname(originalname);
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
  const baseName = prefix ? `${prefix}-${uniqueSuffix}` : `file-${uniqueSuffix}`;
  return `${baseName}${ext}`;
};

/**
 * Create S3 storage configuration for multer
 * @param {Object} options - Configuration options
 * @param {string} options.folder - Folder path in S3 (e.g., 'uploads/profiles', 'uploads/events')
 * @param {string} options.prefix - Filename prefix (e.g., 'profile', 'event-image')
 * @param {Function} options.keyGenerator - Custom key generator function (optional)
 * @returns {Object} Multer S3 storage configuration
 */
const createS3Storage = ({ folder = 'uploads', prefix = '', keyGenerator = null }) => {
  // Check if bucket is configured - read from env directly to ensure it's current
  const bucket = process.env.AWS_S3_BUCKET_NAME || S3_CONFIG.bucket;
  
  if (!bucket) {
    throw new Error('AWS_S3_BUCKET_NAME is not set in environment variables. Please add AWS_S3_BUCKET_NAME=your-bucket-name to your .env file.');
  }

  return multerS3({
    s3: s3Client,
    bucket: bucket,
    // acl: 'public-read', // Make files publicly accessible
    contentType: (req, file, cb) => {
      // Automatically set Content-Type based on file extension
      const contentType = getContentType(file.originalname);
      cb(null, contentType);
    },
    key: keyGenerator || ((req, file, cb) => {
      // Generate unique filename and store in specified folder
      const filename = generateUniqueFilename(file.originalname, prefix);
      const key = folder ? `${folder}/${filename}` : filename;
      cb(null, key);
    }),
    metadata: (req, file, cb) => {
      // Store original filename in metadata
      cb(null, {
        originalName: file.originalname,
        uploadedAt: new Date().toISOString(),
      });
    },
  });
};

/**
 * File filter for images only
 */
const imageFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp|svg/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = /^image\//.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files (jpeg, jpg, png, gif, webp, svg) are allowed!'));
  }
};

/**
 * File filter for videos only
 */
const videoFilter = (req, file, cb) => {
  const allowedTypes = /mp4|mov|avi|wmv|flv|webm|mkv/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = /^video\//.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only video files (mp4, mov, avi, wmv, flv, webm, mkv) are allowed!'));
  }
};

/**
 * File filter for both images and videos
 */
const mediaFilter = (req, file, cb) => {
  const isImage = /^image\//.test(file.mimetype);
  const isVideo = /^video\//.test(file.mimetype);

  if (isImage || isVideo) {
    return cb(null, true);
  } else {
    cb(new Error('Only image and video files are allowed!'));
  }
};

/**
 * Create multer upload middleware for S3
 * @param {Object} options - Configuration options
 * @param {string} options.folder - S3 folder path (default: 'uploads')
 * @param {string} options.prefix - Filename prefix (default: '')
 * @param {number} options.maxSize - Max file size in bytes (default: 10MB for images, 100MB for videos)
 * @param {string} options.fileType - 'image', 'video', or 'media' (default: 'image')
 * @param {string} options.fieldName - Form field name (default: 'file')
 * @param {number} options.maxCount - Max number of files (for array/fields) (default: 1)
 * @returns {Function} Multer middleware
 */
const createS3Upload = (options = {}) => {
  const {
    folder = 'uploads',
    prefix = '',
    maxSize = 10 * 1024 * 1024, // 10MB default
    fileType = 'image', // 'image', 'video', or 'media'
    fieldName = 'file',
    maxCount = 1,
  } = options;

  // Select appropriate file filter
  let fileFilter;
  switch (fileType) {
    case 'image':
      fileFilter = imageFilter;
      break;
    case 'video':
      fileFilter = videoFilter;
      break;
    case 'media':
      fileFilter = mediaFilter;
      break;
    default:
      fileFilter = imageFilter;
  }

  // Create S3 storage
  const storage = createS3Storage({ folder, prefix });

  // Configure multer
  const upload = multer({
    storage,
    limits: {
      fileSize: maxSize,
    },
    fileFilter,
  });

  return upload;
};

/**
 * Helper function to get public URL from S3 key
 */
const getPublicUrl = (key) => {
  return S3_CONFIG.getPublicUrl(key);
};

/**
 * Helper function to extract S3 key from full URL
 */
const getKeyFromUrl = (url) => {
  const bucket = S3_CONFIG.bucket;
  const region = S3_CONFIG.region;
  const pattern = new RegExp(`https://${bucket}\\.s3\\.${region}\\.amazonaws\\.com/(.+)`);
  const match = url.match(pattern);
  return match ? match[1] : null;
};

/**
 * Pre-configured upload middlewares for common use cases
 * These are lazy-loaded to avoid errors if S3 is not configured
 */

// Profile picture upload (single image, 5MB max)
// Accepts both 'profile_pic' (underscore) and 'profilePic' (camelCase) field names
const getUploadProfilePicS3 = () => {
  return createS3Upload({
    folder: 'uploads/profiles',
    prefix: 'profile',
    maxSize: 5 * 1024 * 1024, // 5MB
    fileType: 'image',
    fieldName: 'profile_pic',
  }).fields([
    { name: 'profile_pic', maxCount: 1 }, // Old field name (underscore)
    { name: 'profilePic', maxCount: 1 }, // New field name (camelCase)
    { name: 'profilePicture', maxCount: 1 }, // Alternative field name
  ]);
};

// Event image upload (single image, 10MB max)
const getUploadEventImageS3 = () => {
  return createS3Upload({
    folder: 'uploads/events/images',
    prefix: 'event-image',
    maxSize: 10 * 1024 * 1024, // 10MB
    fileType: 'image',
    fieldName: 'eventImage',
  }).single('eventImage');
};

// Event video upload (single video, 100MB max)
const getUploadEventVideoS3 = () => {
  return createS3Upload({
    folder: 'uploads/events/videos',
    prefix: 'event-video',
    maxSize: 100 * 1024 * 1024, // 100MB
    fileType: 'video',
    fieldName: 'eventVideo',
  }).single('eventVideo');
};

// Event media upload (multiple images + optional video)
// Supports both old field names (game_image, game_video) and new field names (eventImage, eventVideo)
const getUploadEventMediaS3 = () => {
  return createS3Upload({
    folder: 'uploads/events',
    prefix: 'event',
    maxSize: 100 * 1024 * 1024, // 100MB
    fileType: 'media',
  }).fields([
    { name: 'game_image', maxCount: 5 }, // Old field name - backward compatibility
    { name: 'eventImage', maxCount: 5 }, // New field name - up to 5 images
    { name: 'game_video', maxCount: 1 }, // Old field name - backward compatibility
    { name: 'eventVideo', maxCount: 1 }, // New field name - optional video
  ]);
};

// Create middleware functions that lazy-load
const uploadProfilePicS3 = (req, res, next) => {
  try {
    const middleware = getUploadProfilePicS3();
    return middleware(req, res, (err) => {
      if (err) {
        return next(err);
      }
      // Normalize file to req.file for backward compatibility
      // Check both field names and use whichever is present
      if (req.files) {
        const file = req.files.profile_pic?.[0] || req.files.profilePic?.[0] || req.files.profilePicture?.[0];
        if (file) {
          req.file = file; // Set req.file for backward compatibility
        }
      }
      next();
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || 'S3 configuration error',
    });
  }
};

const uploadEventImageS3 = (req, res, next) => {
  try {
    const middleware = getUploadEventImageS3();
    return middleware(req, res, next);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || 'S3 configuration error',
    });
  }
};

const uploadEventVideoS3 = (req, res, next) => {
  try {
    const middleware = getUploadEventVideoS3();
    return middleware(req, res, next);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || 'S3 configuration error',
    });
  }
};

const uploadEventMediaS3 = (req, res, next) => {
  try {
    const middleware = getUploadEventMediaS3();
    return middleware(req, res, next);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || 'S3 configuration error',
    });
  }
};

module.exports = {
  createS3Upload,
  createS3Storage,
  uploadProfilePicS3,
  uploadEventImageS3,
  uploadEventVideoS3,
  uploadEventMediaS3,
  getPublicUrl,
  getKeyFromUrl,
  imageFilter,
  videoFilter,
  mediaFilter,
};
