// Event media upload - Now uses S3
// This file maintains backward compatibility by re-exporting S3 upload middleware
const { 
  uploadEventImageS3, 
  uploadEventVideoS3, 
  uploadEventMediaS3,
  createS3Upload 
} = require('./s3Upload');

// Export S3 versions as defaults (they are lazy-loaded functions)
const uploadEventImage = uploadEventImageS3;
const uploadEventVideo = uploadEventVideoS3;
const uploadEventMedia = uploadEventMediaS3;

module.exports = {
  uploadEventImage,
  uploadEventVideo,
  uploadEventMedia,
  // Keep S3 versions for explicit usage
  uploadEventImageS3,
  uploadEventVideoS3,
  uploadEventMediaS3,
};

