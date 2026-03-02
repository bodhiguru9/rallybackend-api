# AWS S3 Upload Setup Guide

## Overview
This project uses AWS S3 for storing all uploaded images and videos. All files are uploaded directly to S3 and are publicly accessible via S3 URLs.

## Prerequisites

### 1. AWS Account Setup
- Create an AWS account
- Create an S3 bucket
- Configure bucket for public access
- Create IAM user with S3 permissions

### 2. Required Environment Variables
Add these to your `.env` file:

```env
# AWS S3 Configuration
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AWS_REGION=us-east-1
AWS_S3_BUCKET_NAME=your-bucket-name
```

### 3. S3 Bucket Configuration

#### Create Bucket:
1. Go to AWS S3 Console
2. Click "Create bucket"
3. Choose a unique bucket name
4. Select your region
5. **Uncheck "Block all public access"** (or configure public access settings)
6. Enable "ACLs enabled" if needed

#### Bucket Policy (for Public Read Access):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::your-bucket-name/*"
    }
  ]
}
```

#### CORS Configuration (if needed for web uploads):
```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": ["ETag"]
  }
]
```

### 4. IAM User Permissions
Create an IAM user with the following policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:PutObjectAcl",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::your-bucket-name/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket"
      ],
      "Resource": "arn:aws:s3:::your-bucket-name"
    }
  ]
}
```

## File Structure

```
src/
├── config/
│   └── s3.js                    # S3 client configuration
├── middleware/
│   └── s3Upload.js              # Reusable S3 upload middleware
└── routes/
    └── upload.routes.js         # Example upload routes
```

## Usage Examples

### 1. Single Image Upload

**Endpoint:** `POST /api/upload/image`

**Request:**
```bash
curl -X POST http://localhost:3000/api/upload/image \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "image=@/path/to/image.jpg"
```

**Response:**
```json
{
  "success": true,
  "message": "Image uploaded successfully",
  "data": {
    "url": "https://your-bucket.s3.us-east-1.amazonaws.com/uploads/images/image-1234567890.jpg",
    "key": "uploads/images/image-1234567890.jpg",
    "location": "https://your-bucket.s3.us-east-1.amazonaws.com/uploads/images/image-1234567890.jpg",
    "bucket": "your-bucket",
    "size": 123456,
    "contentType": "image/jpeg",
    "originalName": "image.jpg"
  }
}
```

### 2. Single Video Upload

**Endpoint:** `POST /api/upload/video`

**Request:**
```bash
curl -X POST http://localhost:3000/api/upload/video \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "video=@/path/to/video.mp4"
```

**Response:**
```json
{
  "success": true,
  "message": "Video uploaded successfully",
  "data": {
    "url": "https://your-bucket.s3.us-east-1.amazonaws.com/uploads/videos/video-1234567890.mp4",
    "key": "uploads/videos/video-1234567890.mp4",
    "location": "https://your-bucket.s3.us-east-1.amazonaws.com/uploads/videos/video-1234567890.mp4",
    "bucket": "your-bucket",
    "size": 12345678,
    "contentType": "video/mp4",
    "originalName": "video.mp4"
  }
}
```

### 3. Multiple Images Upload

**Endpoint:** `POST /api/upload/images`

**Request:**
```bash
curl -X POST http://localhost:3000/api/upload/images \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "images=@/path/to/image1.jpg" \
  -F "images=@/path/to/image2.jpg" \
  -F "images=@/path/to/image3.jpg"
```

**Response:**
```json
{
  "success": true,
  "message": "Images uploaded successfully",
  "data": {
    "urls": [
      "https://your-bucket.s3.us-east-1.amazonaws.com/uploads/images/image-1234567890.jpg",
      "https://your-bucket.s3.us-east-1.amazonaws.com/uploads/images/image-1234567891.jpg",
      "https://your-bucket.s3.us-east-1.amazonaws.com/uploads/images/image-1234567892.jpg"
    ],
    "count": 3,
    "files": [
      {
        "url": "https://...",
        "key": "uploads/images/image-1234567890.jpg",
        "size": 123456,
        "contentType": "image/jpeg"
      }
    ]
  }
}
```

### 4. Mixed Media Upload (Images + Video)

**Endpoint:** `POST /api/upload/media`

**Request:**
```bash
curl -X POST http://localhost:3000/api/upload/media \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "images=@/path/to/image1.jpg" \
  -F "images=@/path/to/image2.jpg" \
  -F "video=@/path/to/video.mp4"
```

## Using in Your Routes

### Basic Usage

```javascript
const { createS3Upload } = require('../middleware/s3Upload');

// Single file upload
router.post('/upload', protect, createS3Upload({
  folder: 'uploads/custom',
  prefix: 'custom',
  maxSize: 10 * 1024 * 1024, // 10MB
  fileType: 'image',
  fieldName: 'file',
}).single('file'), (req, res) => {
  res.json({
    success: true,
    url: req.file.location, // Public S3 URL
  });
});
```

### Advanced Usage

```javascript
// Multiple files with different types
router.post('/upload', protect, createS3Upload({
  folder: 'uploads/events',
  prefix: 'event',
  maxSize: 100 * 1024 * 1024, // 100MB
  fileType: 'media', // Allows both images and videos
}).fields([
  { name: 'images', maxCount: 5 },
  { name: 'video', maxCount: 1 },
]), (req, res) => {
  const images = req.files.images || [];
  const video = req.files.video ? req.files.video[0] : null;
  
  res.json({
    success: true,
    images: images.map(f => f.location),
    video: video ? video.location : null,
  });
});
```

## Pre-configured Middlewares

The `s3Upload.js` file includes pre-configured middlewares:

```javascript
const {
  uploadProfilePicS3,    // Profile picture upload
  uploadEventImageS3,    // Event image upload
  uploadEventVideoS3,    // Event video upload
  uploadEventMediaS3,    // Event media (images + video)
} = require('../middleware/s3Upload');

// Use in routes
router.post('/profile', protect, uploadProfilePicS3, (req, res) => {
  res.json({ url: req.file.location });
});
```

## Helper Functions

```javascript
const { getPublicUrl, getKeyFromUrl } = require('../middleware/s3Upload');

// Get public URL from S3 key
const url = getPublicUrl('uploads/images/file.jpg');
// Returns: https://bucket.s3.region.amazonaws.com/uploads/images/file.jpg

// Extract key from URL
const key = getKeyFromUrl('https://bucket.s3.region.amazonaws.com/uploads/images/file.jpg');
// Returns: uploads/images/file.jpg
```

## File Organization in S3

Files are organized in S3 as follows:

```
your-bucket/
├── uploads/
│   ├── profiles/
│   │   └── profile-1234567890.jpg
│   ├── events/
│   │   ├── images/
│   │   │   └── event-image-1234567890.jpg
│   │   └── videos/
│   │       └── event-video-1234567890.mp4
│   ├── images/
│   │   └── image-1234567890.jpg
│   └── videos/
│       └── video-1234567890.mp4
```

## Supported File Types

### Images:
- JPEG/JPG
- PNG
- GIF
- WebP
- SVG

### Videos:
- MP4
- MOV
- AVI
- WMV
- FLV
- WebM
- MKV

## File Size Limits

Default limits (can be customized):
- Images: 10MB
- Videos: 100MB
- Profile pictures: 5MB

## Error Handling

The middleware automatically handles:
- Invalid file types
- File size limits
- S3 upload errors
- Missing files

Example error response:
```json
{
  "success": false,
  "error": "Only image files (jpeg, jpg, png, gif, webp, svg) are allowed!"
}
```

## Security Considerations

1. **Authentication**: All upload routes should be protected with authentication middleware
2. **File Validation**: File types and sizes are validated automatically
3. **Public Access**: Files are set to `public-read` ACL - ensure bucket policy allows this
4. **Environment Variables**: Never commit AWS credentials to version control

## Testing

### Test with Postman:
1. Create a new POST request
2. Set URL: `http://localhost:3000/api/upload/image`
3. Add Authorization header with Bearer token
4. Go to Body → form-data
5. Add key: `image`, type: File, select a file
6. Send request

### Test with cURL:
```bash
curl -X POST http://localhost:3000/api/upload/image \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "image=@test-image.jpg"
```

## Troubleshooting

### Issue: "Access Denied" error
- Check IAM user permissions
- Verify bucket policy allows public read
- Ensure ACL is set to `public-read`

### Issue: "Bucket not found"
- Verify `AWS_S3_BUCKET_NAME` in `.env`
- Check bucket name spelling
- Ensure bucket exists in the specified region

### Issue: "Invalid credentials"
- Verify `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in `.env`
- Check IAM user is active
- Regenerate access keys if needed

### Issue: Files not publicly accessible
- Check bucket public access settings
- Verify bucket policy
- Ensure ACL is set correctly in upload middleware

## Migration from Local Storage

If you're migrating from local file storage:

1. Update existing routes to use S3 middleware
2. Files will automatically upload to S3
3. Old local files can be migrated using AWS CLI or SDK
4. Update database records with new S3 URLs

## Best Practices

1. **Use environment variables** for all AWS configuration
2. **Set appropriate file size limits** based on your needs
3. **Organize files** in folders (uploads/profiles, uploads/events, etc.)
4. **Use unique filenames** (already handled automatically)
5. **Validate file types** (already handled automatically)
6. **Monitor S3 costs** and set up billing alerts
7. **Use CloudFront** for better performance (optional)

## Additional Resources

- [AWS S3 Documentation](https://docs.aws.amazon.com/s3/)
- [AWS SDK v3 for JavaScript](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/)
- [Multer Documentation](https://github.com/expressjs/multer)
- [Multer-S3 Documentation](https://github.com/badunk/multer-s3)
