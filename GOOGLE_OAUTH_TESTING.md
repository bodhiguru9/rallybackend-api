# Testing Google OAuth in Postman

## Endpoint Details

**URL:** `POST http://localhost:3000/api/auth/oauth/google`

**Headers:**
```
Content-Type: application/json
```

## Request Body Format

### For New User (Signup):
```json
{
  "idToken": "your_google_id_token_here",
  "userType": "player",
  "mobileNumber": "+1234567890",
  "fullName": "John Doe",
  "sport1": "Football",
  "sport2": "Basketball"
}
```

### For Existing User (Login):
```json
{
  "idToken": "your_google_id_token_here"
}
```

### For Organiser:
```json
{
  "idToken": "your_google_id_token_here",
  "userType": "organiser",
  "mobileNumber": "+1234567890",
  "fullName": "Sports Club",
  "yourBest": "organiser",
  "communityName": "City Sports",
  "yourCity": "New York",
  "sport1": "Football",
  "sport2": "Basketball",
  "bio": "Experienced organizer..."
}
```

## How to Get Google ID Token

### Option 1: Using Google OAuth Playground (Easiest for Testing)
1. Go to: https://developers.google.com/oauthplayground/
2. In the left panel, find "Google OAuth2 API v2"
3. Check the scope: `https://www.googleapis.com/auth/userinfo.email` and `https://www.googleapis.com/auth/userinfo.profile`
4. Click "Authorize APIs"
5. Sign in with your Google account
6. Click "Exchange authorization code for tokens"
7. Copy the `id_token` from the response (it's a long JWT string)

### Option 2: Using a Web Application
If you have a web app with Google Sign-In:
1. Use Google Sign-In JavaScript library
2. After successful authentication, get the ID token:
   ```javascript
   google.accounts.id.initialize({
     client_id: 'YOUR_CLIENT_ID',
     callback: handleCredentialResponse
   });
   
   function handleCredentialResponse(response) {
     const idToken = response.credential;
     // Use this idToken in your API call
   }
   ```

### Option 3: Using Google Sign-In Button
```html
<div id="g_id_onload"
     data-client_id="YOUR_CLIENT_ID"
     data-callback="handleCredentialResponse">
</div>
<script src="https://accounts.google.com/gsi/client" async defer></script>
```

## Postman Setup Steps

1. **Open Postman** and create a new request
2. **Set Method:** `POST`
3. **Set URL:** `http://localhost:3000/api/auth/oauth/google`
4. **Go to Headers tab:**
   - Key: `Content-Type`
   - Value: `application/json`
5. **Go to Body tab:**
   - Select `raw`
   - Select `JSON` from dropdown
   - Paste the JSON body (see examples above)
6. **Click Send**

## Expected Response

### Success Response (New User):
```json
{
  "success": true,
  "message": "Account created and logged in successfully",
  "data": {
    "isNewUser": true,
    "user": {
      "id": 1,
      "userId": 1,
      "mongoId": "...",
      "userType": "player",
      "email": "user@gmail.com",
      "fullName": "John Doe",
      "profilePic": "...",
      ...
    },
    "token": "jwt_access_token_here",
    "refreshToken": "refresh_token_here",
    "message": "Account created and logged in successfully"
  }
}
```

### Success Response (Existing User):
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "isNewUser": false,
    "user": {
      "id": 1,
      "userId": 1,
      "userType": "player",
      "email": "user@gmail.com",
      ...
    },
    "token": "jwt_access_token_here",
    "refreshToken": "refresh_token_here",
    "message": "Login successful"
  }
}
```

### Error Response:
```json
{
  "success": false,
  "error": "Invalid Google token" // or other error message
}
```

## Common Issues

1. **"Invalid Google token"**
   - Make sure you're using a valid Google ID token (JWT format)
   - Token might be expired (ID tokens expire after 1 hour)
   - Get a fresh token from Google OAuth Playground

2. **"User type is required"**
   - Add `"userType": "player"` or `"userType": "organiser"` for new users

3. **Connection Error**
   - Make sure your server is running on port 3000
   - Check: `http://localhost:3000/health`

## Quick Test Example

**Minimal Request (for existing user):**
```json
{
  "idToken": "eyJhbGciOiJSUzI1NiIsImtpZCI6Ij..."
}
```

**Full Request (for new player):**
```json
{
  "idToken": "eyJhbGciOiJSUzI1NiIsImtpZCI6Ij...",
  "userType": "player",
  "mobileNumber": "+1234567890",
  "sport1": "Football",
  "sport2": "Basketball"
}
```

## Notes

- The `idToken` is a JWT (JSON Web Token) that starts with `eyJ...`
- ID tokens are long strings (usually 1000+ characters)
- For testing, use Google OAuth Playground to get a valid token
- The token expires after 1 hour, so you may need to get a new one
- If the user already exists (same email), it will log them in instead of creating a new account
