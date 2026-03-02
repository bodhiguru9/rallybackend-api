// Profile picture upload - Now uses S3
// This file maintains backward compatibility by re-exporting S3 upload middleware
const { uploadProfilePicS3 } = require('./s3Upload');

// Export S3 version as the default
const uploadProfilePic = uploadProfilePicS3;

module.exports = {
  uploadProfilePic,
  // Keep uploadProfilePicS3 for explicit S3 usage
  uploadProfilePicS3,
};

