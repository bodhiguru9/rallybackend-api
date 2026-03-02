# Rally API Documentation

Complete API documentation for the Rally Node.js Backend application.

## Table of Contents

1. [Base URL](#base-url)
2. [Authentication](#authentication)
3. [API Endpoints](#api-endpoints)
   - [Authentication APIs](#authentication-apis)
   - [User APIs](#user-apis)
   - [Event APIs](#event-apis)
   - [Follow/Subscribe APIs](#followsubscribe-apis)
   - [Favorite APIs](#favorite-apis)
   - [Request/Join APIs](#requestjoin-apis)
   - [Notification APIs](#notification-apis)
   - [Organizer APIs](#organizer-apis)
   - [Payment APIs](#payment-apis)
   - [Promo Code APIs](#promo-code-apis)
   - [Sport APIs](#sport-apis)
   - [Block APIs](#block-apis)
   - [Event Block APIs](#event-block-apis)

---

## Base URL

```
http://localhost:3000/api
```

---

## Authentication

Most endpoints require authentication using JWT tokens. Include the token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

---

## API Endpoints

### Authentication APIs

#### 1. Send Signup OTP
**POST** `/api/auth/send-signup-otp`

Send OTP for user registration via email or mobile number.

**Request Body:**
```json
{
  "email": "user@example.com",        // OR
  "mobileNumber": "+1234567890",      // Provide ONE of these
  "userType": "player" | "organiser"  // Required
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP has been sent to your email/mobile number"
}
```

---

#### 2. Verify Signup OTP
**POST** `/api/auth/verify-signup-otp`

Verify OTP and get signup token.

**Request Body:**
```json
{
  "email": "user@example.com",     // OR
  "mobileNumber": "+1234567890",   // Provide ONE of these
  "otp": "123456"                  // Required (6-digit OTP)
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP verified successfully",
  "data": {
    "signupToken": "token_here"
  }
}
```

---

#### 3. Complete Signup
**POST** `/api/auth/signup`

Complete user registration with signup token.

**Request Body (Player):**
```json
{
  "signupToken": "token_from_verify_otp",
  "password": "SecurePass123!",
  "fullName": "John Doe",
  "dob": "1990-01-01",
  "gender": "male",
  "sport1": "Football",
  "sport2": "Basketball"
}
```

**Request Body (Organiser):**
```json
{
  "signupToken": "token_from_verify_otp",
  "password": "SecurePass123!",
  "fullName": "Sports Club",
  "yourBest": "organiser",
  "communityName": "City Sports",
  "yourCity": "New York",
  "sport1": "Football",
  "sport2": "Basketball",
  "bio": "Experienced organizer...",
  "profileVisibility": "public"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "token": "jwt_token_here",
    "user": { ... }
  }
}
```

---

#### 4. Sign In
**POST** `/api/auth/signin`

Sign in with email/mobile and password.

**Request Body:**
```json
{
  "emailOrMobile": "user@example.com",  // OR mobile number
  "password": "SecurePass123!"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Sign in successful",
  "data": {
    "token": "jwt_token_here",
    "user": { ... }
  }
}
```

---

#### 5. Email Login (OTP-based)
**POST** `/api/auth/email-login`

Login using email OTP (no password required).

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP sent to email"
}
```

---

#### 6. WhatsApp Login (OTP-based)
**POST** `/api/auth/whatsapp-login`

Login using WhatsApp OTP.

**Request Body:**
```json
{
  "mobileNumber": "+1234567890"
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP sent to WhatsApp"
}
```

---

#### 7. OAuth Login (Google/Facebook)
**POST** `/api/auth/oauth`

Login using OAuth providers.

**Request Body:**
```json
{
  "provider": "google" | "facebook",
  "accessToken": "oauth_access_token"
}
```

---

#### 8. Forgot Password
**POST** `/api/auth/forgot-password`

Request password reset.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

---

#### 9. Reset Password
**POST** `/api/auth/reset-password`

Reset password with token.

**Request Body:**
```json
{
  "token": "reset_token",
  "password": "NewSecurePass123!"
}
```

---

### User APIs

#### 1. Get All Users
**GET** `/api/users?page=1&userType=player`

Get paginated list of users.

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `userType` (optional): Filter by 'player' or 'organiser'

**Headers:**
- `Authorization` (optional): Bearer token

**Response:**
```json
{
  "success": true,
  "data": {
    "users": [...],
    "pagination": {
      "totalCount": 100,
      "totalPages": 5,
      "currentPage": 1,
      "perPage": 20
    }
  }
}
```

---

#### 2. Get Player Profile
**GET** `/api/users/player/profile`

Get comprehensive player profile data (following, favorites, joined events, requests).

**Headers:**
- `Authorization`: Bearer token (required)

**Response:**
```json
{
  "success": true,
  "data": {
    "followingCount": 3,
    "followingOrganizers": [...],
    "favoriteEventsCount": 5,
    "favoriteEventIds": ["E1", "E2", "E3"],
    "joinedEventsCount": 3,
    "joinedEvents": [
      {
        "eventId": "E1",
        "eventName": "Football Match"
      }
    ],
    "privateEventRequestsCount": 2,
    "privateEventRequests": [...]
  }
}
```

---

#### 3. Get User Profile
**GET** `/api/users/:id`

Get user profile by ID (supports sequential userId or MongoDB ObjectId).

**Headers:**
- `Authorization` (optional): Bearer token

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "userId": 5,
      "userType": "organiser",
      "fullName": "John Doe",
      "followersCount": 10,
      "isFollowing": true
    }
  }
}
```

---

#### 4. Update User Profile
**PUT** `/api/users/:id`

Update user profile (users can only update their own account).

**Headers:**
- `Authorization`: Bearer token (required)
- `Content-Type`: multipart/form-data (for profile picture) or application/json

**Request Body (Player):**
```json
{
  "full_name": "John Doe",
  "email": "newemail@example.com",
  "sport_1": "Football",
  "sport_2": "Basketball"
}
```

**Request Body (Organiser):**
```json
{
  "full_name": "Sports Club",
  "community_name": "City Sports",
  "bio": "Updated bio...",
  "profileVisibility": "public"
}
```

---

#### 5. Delete User Account
**DELETE** `/api/users/:id`

Delete user account (users can only delete their own account).

**Headers:**
- `Authorization`: Bearer token (required)

---

### Event APIs

#### 1. Create Event
**POST** `/api/events`

Create a new event (Organiser only).

**Headers:**
- `Authorization`: Bearer token (required)
- `Content-Type`: multipart/form-data

**Form Data:**
- `eventName`: "Cricket Championship 2024" (required)
- `eventType`: "tournament" (required)
- `eventSports`: "cricket" or ["cricket", "football"] (optional)
- `eventDateTime`: "2024-12-25T10:00:00Z" (required)
- `eventLocation`: "Stadium Name" (required)
- `eventMaxGuest`: 50 (required)
- `eventPricePerGuest`: 100 (optional)
- `IsPrivateEvent`: true | false (optional)
- `eventImage`: [file] (optional, up to 5 images)
- `eventVideo`: [file] (optional)
- `eventSavedraft`: true (optional, saves as draft)

**Response:**
```json
{
  "success": true,
  "message": "Event created successfully",
  "data": {
    "event": {
      "eventId": "E1",
      "eventName": "Cricket Championship 2024",
      ...
    }
  }
}
```

---

#### 2. Get All Events
**GET** `/api/events/all?page=1&eventType=tournament&eventSports=cricket`

Get paginated list of all events.

**Query Parameters:**
- `page` (optional): Page number
- `eventType` (optional): Filter by event type
- `eventSports` (optional): Filter by sport
- `eventStatus` (optional): Filter by status
- `startDate` (optional): Filter from date
- `endDate` (optional): Filter to date

**Headers:**
- `Authorization` (optional): Bearer token

---

#### 3. Search Events
**GET** `/api/events/search?q=football&page=1`

Search events by keyword.

**Query Parameters:**
- `q` (required): Search keyword
- `page` (optional): Page number

---

#### 4. Get My Events
**GET** `/api/events/my-events?page=1&status=upcoming`

Get events created by logged-in organizer.

**Headers:**
- `Authorization`: Bearer token (required)

**Query Parameters:**
- `page` (optional): Page number
- `status` (optional): Filter by status (upcoming, ongoing, past, draft)

---

#### 5. Get Event by ID
**GET** `/api/events/:eventId`

Get event details by ID.

**Headers:**
- `Authorization` (optional): Bearer token

---

#### 6. Update Event
**PUT** `/api/events/:eventId`

Update event (only event creator can update).

**Headers:**
- `Authorization`: Bearer token (required)
- `Content-Type`: multipart/form-data

---

#### 7. Delete Event
**DELETE** `/api/events/:eventId`

Delete event (only event creator can delete).

**Headers:**
- `Authorization`: Bearer token (required)

---

#### 8. Join Public Event
**POST** `/api/events/:eventId/join`

Join a public event.

**Headers:**
- `Authorization`: Bearer token (required)

**Response:**
```json
{
  "success": true,
  "message": "Successfully joined event"
}
```

---

#### 9. Leave Event
**DELETE** `/api/events/:eventId/join`

Leave an event (sends notification to organizer).

**Headers:**
- `Authorization`: Bearer token (required)

---

#### 10. Get Event Participants
**GET** `/api/events/:eventId/participants?page=1`

Get list of participants for an event.

**Headers:**
- `Authorization`: Bearer token (required)

---

#### 11. Check Join Status
**GET** `/api/events/:eventId/join-status`

Check if user has joined the event.

**Headers:**
- `Authorization`: Bearer token (required)

**Response:**
```json
{
  "success": true,
  "data": {
    "hasJoined": true,
    "inWaitlist": false,
    "IsPrivateEvent": false
  }
}
```

---

#### 12. Request to Join Private Event
**POST** `/api/events/:eventId/join-waitlist`

Request to join a private event (sends notification to organizer).

**Headers:**
- `Authorization`: Bearer token (required)

**Response:**
```json
{
  "success": true,
  "message": "Join request sent successfully",
  "data": {
    "waitlistId": "W1",
    "requestId": "Request1"
  }
}
```

---

#### 13. Get My Join Requests
**GET** `/api/events/my-requests?page=1`

Get all join requests made by the user.

**Headers:**
- `Authorization`: Bearer token (required)

---

#### 14. Get Event Waitlist
**GET** `/api/events/:eventId/waitlist?page=1`

Get waitlist for an event (Organiser only).

**Headers:**
- `Authorization`: Bearer token (required)

---

#### 15. Accept from Waitlist
**POST** `/api/events/:eventId/waitlist/:waitlistId/accept`

Accept a waitlist request (sends notification to player).

**Headers:**
- `Authorization`: Bearer token (required)

---

#### 16. Reject from Waitlist
**POST** `/api/events/:eventId/waitlist/:waitlistId/reject`

Reject a waitlist request.

**Headers:**
- `Authorization`: Bearer token (required)

---

### Follow/Subscribe APIs

#### 1. Follow Organiser
**POST** `/api/follow/:organiserId`

Follow/subscribe to a public organiser (sends notification to organizer).

**Headers:**
- `Authorization`: Bearer token (required)

**Response:**
```json
{
  "success": true,
  "message": "Successfully followed organiser",
  "data": {
    "followerCount": 10,
    "followingCount": 5
  }
}
```

---

#### 2. Unfollow Organiser
**DELETE** `/api/follow/:organiserId`

Unfollow an organiser.

**Headers:**
- `Authorization`: Bearer token (required)

---

#### 3. Get My Followers
**GET** `/api/follow/me/followers?page=1`

Get followers list for logged-in organiser.

**Headers:**
- `Authorization`: Bearer token (required)

---

#### 4. Get Organiser Followers
**GET** `/api/follow/:organiserId/followers?page=1`

Get followers list for an organiser.

---

#### 5. Get Following List
**GET** `/api/follow/:userId/following?page=1`

Get list of organisers a user is following.

---

#### 6. Check Follow Status
**GET** `/api/follow/:organiserId/status`

Check if user is following an organiser.

**Headers:**
- `Authorization`: Bearer token (required)

**Response:**
```json
{
  "success": true,
  "data": {
    "isFollowing": true
  }
}
```

---

### Favorite APIs

#### 1. Add to Favorites
**POST** `/api/favorites/:eventId`

Add event to favorites.

**Headers:**
- `Authorization`: Bearer token (required)

**Response:**
```json
{
  "success": true,
  "message": "Event added to favorites successfully",
  "data": {
    "favoriteId": "FAV1"
  }
}
```

---

#### 2. Remove from Favorites
**DELETE** `/api/favorites/:eventId`

Remove event from favorites.

**Headers:**
- `Authorization`: Bearer token (required)

---

#### 3. Get My Favorites
**GET** `/api/favorites?page=1&limit=20`

Get user's favorite events.

**Headers:**
- `Authorization`: Bearer token (required)

---

#### 4. Check Favorite Status
**GET** `/api/favorites/check/:eventId`

Check if event is favorited.

**Headers:**
- `Authorization`: Bearer token (required)

---

#### 5. Get Favorite Count
**GET** `/api/favorites/count/:eventId`

Get favorite count for an event (public).

---

### Request/Join APIs

#### 1. Request to Join Private Organiser
**POST** `/api/request/:organiserId`

Request to join a private organiser.

**Headers:**
- `Authorization`: Bearer token (required)

**Response:**
```json
{
  "success": true,
  "message": "Join request sent successfully",
  "data": {
    "requestId": "R1"
  }
}
```

---

#### 2. Get Pending Requests
**GET** `/api/request/pending?page=1`

Get pending requests for logged-in organiser.

**Headers:**
- `Authorization`: Bearer token (required)

---

#### 3. Get Accepted Users
**GET** `/api/request/accepted?page=1`

Get accepted users for organiser.

**Headers:**
- `Authorization`: Bearer token (required)

---

#### 4. Accept Request
**POST** `/api/request/:requestId/accept`

Accept a join request.

**Headers:**
- `Authorization`: Bearer token (required)

---

#### 5. Reject Request
**POST** `/api/request/:requestId/reject`

Reject a join request.

**Headers:**
- `Authorization`: Bearer token (required)

---

#### 6. Remove Accepted User
**DELETE** `/api/request/accepted/:userId`

Remove an accepted user.

**Headers:**
- `Authorization`: Bearer token (required)

---

### Notification APIs

#### Organiser Notifications

##### 1. Get Organiser Notifications
**GET** `/api/notifications/organiser?page=1`

Get notifications for logged-in organiser (event join requests, event leaves, new followers).

**Headers:**
- `Authorization`: Bearer token (required)

**Response:**
```json
{
  "success": true,
  "data": {
    "unreadCount": 5,
    "notifications": [
      {
        "notificationId": "...",
        "type": "event_join_request",
        "title": "New Join Request",
        "message": "John Doe requested to join your private event",
        "isRead": false,
        "createdAt": "2024-01-01T00:00:00.000Z",
        "user": {
          "userId": 5,
          "fullName": "John Doe",
          "email": "john@example.com"
        },
        "event": {
          "eventId": "E1",
          "eventName": "Football Match"
        }
      }
    ],
    "pagination": { ... }
  }
}
```

**Notification Types:**
- `event_join_request`: Player requested to join private event
- `event_leave`: Player left/cancelled event
- `organiser_follow`: Player subscribed to organizer

---

##### 2. Mark Notification as Read
**PUT** `/api/notifications/organiser/:notificationId/read`

Mark a notification as read.

**Headers:**
- `Authorization`: Bearer token (required)

---

##### 3. Mark All as Read
**PUT** `/api/notifications/organiser/read-all`

Mark all notifications as read.

**Headers:**
- `Authorization`: Bearer token (required)

---

#### Player Notifications

##### 1. Get Player Notifications
**GET** `/api/notifications/player?page=1`

Get notifications for logged-in player (event request accepted, etc.).

**Headers:**
- `Authorization`: Bearer token (required)

**Response:**
```json
{
  "success": true,
  "data": {
    "unreadCount": 3,
    "notifications": [
      {
        "notificationId": "...",
        "type": "event_request_accepted",
        "title": "Request Accepted",
        "message": "Your request to join Football Match has been accepted",
        "isRead": false,
        "createdAt": "2024-01-01T00:00:00.000Z",
        "organiser": {
          "userId": 10,
          "fullName": "Sports Club"
        },
        "event": {
          "eventId": "E1",
          "eventName": "Football Match"
        }
      }
    ],
    "pagination": { ... }
  }
}
```

**Notification Types:**
- `event_request_accepted`: Organizer accepted private event request

---

##### 2. Mark Notification as Read
**PUT** `/api/notifications/player/:notificationId/read`

Mark a notification as read.

**Headers:**
- `Authorization`: Bearer token (required)

---

##### 3. Mark All as Read
**PUT** `/api/notifications/player/read-all`

Mark all notifications as read.

**Headers:**
- `Authorization`: Bearer token (required)

---

### Organizer APIs

#### 1. Save Bank Details
**POST** `/api/organizers/bank-details`

Save organizer bank details/KYC.

**Headers:**
- `Authorization`: Bearer token (required)

**Request Body (UAE):**
```json
{
  "country": "UAE",
  "bankName": "Emirates NBD",
  "iban": "AE123456789012345678901",
  "emiratesId": "784-1234-5678901-1"
}
```

**Request Body (India):**
```json
{
  "country": "India",
  "bankName": "State Bank of India",
  "accountNumber": "1234567890",
  "ifscCode": "SBIN0001234",
  "accountHolderName": "John Doe",
  "aadhaar": "1234 5678 9012"
}
```

---

#### 2. Get Bank Details
**GET** `/api/organizers/bank-details`

Get bank details for logged-in organizer.

**Headers:**
- `Authorization`: Bearer token (required)

---

#### 3. Update Bank Details
**PUT** `/api/organizers/bank-details`

Update bank details.

**Headers:**
- `Authorization`: Bearer token (required)

---

#### 4. Delete Bank Details
**DELETE** `/api/organizers/bank-details`

Delete bank details.

**Headers:**
- `Authorization`: Bearer token (required)

---

#### 5. Get Organizer Analytics
**GET** `/api/organizers/analytics?revenuePeriod=thisMonth&sport=cricket`

Get organizer analytics (revenue, events, transactions).

**Headers:**
- `Authorization`: Bearer token (required)

**Query Parameters:**
- `revenuePeriod`: "today", "lastWeek", "thisMonth", "6months", "lifetime"
- `sport`: Filter by sport
- `startDate`: Filter from date
- `endDate`: Filter to date

**Response:**
```json
{
  "success": true,
  "data": {
    "stats": {
      "totalEvents": 10,
      "upcomingEvents": 3,
      "totalRevenue": 50000,
      "totalTransactions": 25
    },
    "revenue": {
      "total": 50000,
      "bySport": {
        "cricket": 30000,
        "football": 20000
      }
    }
  }
}
```

---

### Payment APIs

#### 1. Create Payment Order
**POST** `/api/payments/create-order`

Create Stripe payment intent.

**Headers:**
- `Authorization`: Bearer token (required)

**Request Body:**
```json
{
  "eventId": "E1",
  "promoCode": "SUMMER20"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Payment intent created successfully",
  "data": {
    "paymentIntent": {
      "id": "pi_xxx",
      "clientSecret": "pi_xxx_secret_xxx",
      "amount": 1000,
      "currency": "usd",
      "status": "requires_payment_method"
    },
    "payment": {
      "paymentId": "PAY1",
      "originalAmount": 10,
      "discountAmount": 2,
      "finalAmount": 8,
      "promoCode": "SUMMER20"
    },
    "publishableKey": "pk_test_xxx"
  }
}
```

---

#### 2. Verify Payment
**POST** `/api/payments/verify`

Verify Stripe payment.

**Headers:**
- `Authorization`: Bearer token (required)

**Request Body:**
```json
{
  "payment_intent_id": "pi_xxx"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Payment verified successfully",
  "data": {
    "payment": {
      "paymentId": "PAY1",
      "status": "success",
      "amount": 10,
      "discountAmount": 2,
      "finalAmount": 8,
      "promoCode": "SUMMER20",
      "stripePaymentIntentId": "pi_xxx",
      "stripePaymentId": "pi_xxx",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

---

#### 3. Get Payment History
**GET** `/api/payments/history?page=1`

Get payment history for logged-in user.

**Headers:**
- `Authorization`: Bearer token (required)

---

### Promo Code APIs

#### 1. Create Promo Code
**POST** `/api/promo-codes`

Create a new promo code (Organiser only).

**Headers:**
- `Authorization`: Bearer token (required)

**Request Body:**
```json
{
  "code": "SUMMER20",
  "description": "Summer discount",
  "discountType": "percentage",
  "discountValue": 20,
  "minPurchaseAmount": 100,
  "maxDiscountAmount": 500,
  "usageLimit": 100,
  "userUsageLimit": 1,
  "validFrom": "2024-01-01",
  "validUntil": "2024-12-31",
  "isActive": true
}
```

---

#### 2. Get All Promo Codes
**GET** `/api/promo-codes?isActive=true`

Get all promo codes.

**Query Parameters:**
- `isActive`: Filter by active status

---

#### 3. Get Promo Code by ID
**GET** `/api/promo-codes/:promoCodeId`

Get promo code details.

---

#### 4. Validate Promo Code
**POST** `/api/promo-codes/validate`

Validate a promo code for an event.

**Request Body:**
```json
{
  "code": "SUMMER20",
  "eventId": "E1",
  "amount": 1000
}
```

---

#### 5. Update Promo Code
**PUT** `/api/promo-codes/:promoCodeId`

Update promo code (Organiser only).

**Headers:**
- `Authorization`: Bearer token (required)

---

#### 6. Delete Promo Code
**DELETE** `/api/promo-codes/:promoCodeId`

Delete promo code (Organiser only).

**Headers:**
- `Authorization`: Bearer token (required)

---

### Sport APIs

#### 1. Create Sport
**POST** `/api/sports`

Create a new sport (Organiser only).

**Headers:**
- `Authorization`: Bearer token (required)

**Request Body:**
```json
{
  "name": "Cricket",
  "description": "A bat-and-ball game",
  "icon": "https://example.com/cricket-icon.png",
  "isActive": true
}
```

---

#### 2. Get All Sports
**GET** `/api/sports?isActive=true`

Get all sports.

**Query Parameters:**
- `isActive`: Filter by active status

---

#### 3. Get Sport by ID
**GET** `/api/sports/:sportId`

Get sport details.

---

#### 4. Update Sport
**PUT** `/api/sports/:sportId`

Update sport (Organiser only).

**Headers:**
- `Authorization`: Bearer token (required)

---

#### 5. Delete Sport
**DELETE** `/api/sports/:sportId`

Delete sport (Organiser only).

**Headers:**
- `Authorization`: Bearer token (required)

---

### Block APIs

#### 1. Block User
**POST** `/api/block/:userId`

Block a user (player or organiser).

**Headers:**
- `Authorization`: Bearer token (required)

**Response:**
```json
{
  "success": true,
  "message": "User blocked successfully",
  "data": {
    "blockedUser": {
      "userId": 5,
      "fullName": "John Doe"
    },
    "isBlocked": true
  }
}
```

---

#### 2. Unblock User
**DELETE** `/api/block/:userId`

Unblock a user.

**Headers:**
- `Authorization`: Bearer token (required)

---

#### 3. Get Blocked Users
**GET** `/api/block/blocked?page=1`

Get list of blocked users.

**Headers:**
- `Authorization`: Bearer token (required)

---

#### 4. Check Block Status
**GET** `/api/block/:userId/status`

Check if user is blocked.

**Headers:**
- `Authorization`: Bearer token (required)

---

### Event Block APIs

#### 1. Block Event
**POST** `/api/event-block/:eventId`

Block an event.

**Headers:**
- `Authorization`: Bearer token (required)

---

#### 2. Unblock Event
**DELETE** `/api/event-block/:eventId`

Unblock an event.

**Headers:**
- `Authorization`: Bearer token (required)

---

#### 3. Get Blocked Events
**GET** `/api/event-block/blocked?page=1`

Get list of blocked events.

**Headers:**
- `Authorization`: Bearer token (required)

---

## Error Responses

All APIs follow a consistent error response format:

```json
{
  "success": false,
  "error": "Error message here",
  "suggestion": "Optional suggestion"
}
```

**Common HTTP Status Codes:**
- `200`: Success
- `201`: Created
- `400`: Bad Request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `500`: Internal Server Error

---

## Pagination

Most list endpoints support pagination with the following query parameters:
- `page`: Page number (default: 1)
- `perPage` or `limit`: Items per page (default: 20)

**Pagination Response:**
```json
{
  "pagination": {
    "totalCount": 100,
    "totalPages": 5,
    "currentPage": 1,
    "perPage": 20,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

---

## ID Formats

The API supports two ID formats:

1. **Sequential IDs** (Primary - Exposed in API):
   - Users: `1`, `2`, `3`, ...
   - Events: `E1`, `E2`, `E3`, ...
   - Requests: `R1`, `R2`, `R3`, ...
   - Waitlist: `W1`, `W2`, `W3`, ...
   - Promo Codes: `PRO1`, `PRO2`, `PRO3`, ...
   - Sports: `SP1`, `SP2`, `SP3`, ...

2. **MongoDB ObjectIds** (Internal - Also supported):
   - 24-character hexadecimal strings

---

## Notes

- All timestamps are in ISO 8601 format (UTC)
- File uploads use `multipart/form-data`
- Most endpoints require authentication
- Organiser-only endpoints require `organiserOnly` middleware
- Private events require waitlist/request approval
- Public events can be joined directly
- Notifications are automatically created for relevant actions

---

## Support

For issues or questions, please contact the development team.

