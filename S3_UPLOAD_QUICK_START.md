# AWS S3 Upload - Quick Start Guide

## Setup (5 minutes)

### 1. Add Environment Variables to `.env`:
```env
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AWS_REGION=us-east-1
AWS_S3_BUCKET_NAME=your-bucket-name
```

### 2. Configure S3 Bucket:
- Create bucket in AWS S3
- Unblock public access
- Add bucket policy (see AWS_S3_UPLOAD_SETUP.md)

## Usage Examples

### Example 1: Upload Profile Picture
```javascript
const { uploadProfilePicS3 } = require('../middleware/s3Upload');

router.post('/profile', protect, uploadProfilePicS3, (req, res) => {
  res.json({
    success: true,
    profilePic: req.file.location // Public S3 URL
  });
});
```

### Example 2: Custom Upload
```javascript
const { createS3Upload } = require('../middleware/s3Upload');

router.post('/upload', protect, createS3Upload({
  folder: 'uploads/custom',
  prefix: 'custom',
  maxSize: 10 * 1024 * 1024, // 10MB
  fileType: 'image',
}).single('file'), (req, res) => {
  res.json({
    success: true,
    url: req.file.location
  });
});
```

### Example 3: Multiple Files
```javascript
router.post('/upload', protect, createS3Upload({
  folder: 'uploads/gallery',
  fileType: 'image',
}).array('images', 10), (req, res) => {
  const urls = req.files.map(f => f.location);
  res.json({ success: true, urls });
});
```

## API Endpoints (Ready to Use)

All endpoints require authentication (`Authorization: Bearer <token>`):

1. **POST /api/upload/image** - Single image
2. **POST /api/upload/video** - Single video  
3. **POST /api/upload/images** - Multiple images
4. **POST /api/upload/media** - Images + video

## Response Format

```json
{
  "success": true,
  "message": "Image uploaded successfully",
  "data": {
    "url": "https://bucket.s3.region.amazonaws.com/uploads/images/image-123.jpg",
    "key": "uploads/images/image-123.jpg",
    "location": "https://bucket.s3.region.amazonaws.com/uploads/images/image-123.jpg",
    "bucket": "your-bucket",
    "size": 123456,
    "contentType": "image/jpeg"
  }
}
```

## Test with Postman

1. Method: POST
2. URL: `http://localhost:3000/api/upload/image`
3. Headers: `Authorization: Bearer <token>`
4. Body → form-data → Key: `image`, Type: File

## Files Created

- `src/config/s3.js` - S3 client configuration
- `src/middleware/s3Upload.js` - Reusable upload middleware
- `src/routes/upload.routes.js` - Example routes

See `AWS_S3_UPLOAD_SETUP.md` for detailed documentation.
