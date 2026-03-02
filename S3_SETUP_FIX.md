# S3 Setup Fix - Error: bucket is required

## Problem
If you see the error: `Error: bucket is required`, it means the AWS S3 bucket name is not configured.

## Solution

### 1. Add to your `.env` file:
```env
AWS_ACCESS_KEY_ID=your_access_key_id_here
AWS_SECRET_ACCESS_KEY=your_secret_access_key_here
AWS_REGION=us-east-1
AWS_S3_BUCKET_NAME=your-bucket-name-here
```

### 2. Make sure `.env` file is in the project root:
```
rally-node/
├── .env          ← Should be here
├── src/
├── package.json
└── ...
```

### 3. Restart your server:
```bash
npm start
# or
npm run dev
```

## Quick Test

After adding the environment variables, the server should start without errors. You can test an upload:

```bash
curl -X POST http://localhost:3000/api/upload/image \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "image=@test.jpg"
```

## Common Issues

1. **`.env` file not loaded**: Make sure `dotenv` is configured (it's already in `src/index.js`)
2. **Wrong variable name**: Must be exactly `AWS_S3_BUCKET_NAME` (case-sensitive)
3. **Bucket doesn't exist**: Create the bucket in AWS S3 first
4. **Credentials wrong**: Verify your AWS credentials are correct

## Verification

Check if variables are loaded:
```javascript
console.log('Bucket:', process.env.AWS_S3_BUCKET_NAME);
console.log('Region:', process.env.AWS_REGION);
```

The middleware now reads from `process.env` directly, so it will work as long as the `.env` file is properly configured.
