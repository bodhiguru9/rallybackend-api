const { S3Client } = require('@aws-sdk/client-s3');

/**
 * AWS S3 Client Configuration
 * Uses environment variables for credentials
 */
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

/**
 * S3 Configuration Constants
 */
const S3_CONFIG = {
  bucket: process.env.AWS_S3_BUCKET_NAME,
  region: process.env.AWS_REGION || 'us-east-1',
  // Base URL for public S3 objects
  getPublicUrl: (key) => {
    const bucket = process.env.AWS_S3_BUCKET_NAME;
    const region = process.env.AWS_REGION || 'us-east-1';
    return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  },
};

// Validate required environment variables
if (!S3_CONFIG.bucket) {
  console.warn('⚠️  AWS_S3_BUCKET_NAME is not set. S3 uploads will fail.');
}

if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  console.warn('⚠️  AWS credentials are not set. S3 uploads will fail.');
}

module.exports = {
  s3Client,
  S3_CONFIG,
};
