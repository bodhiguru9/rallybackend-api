# Event Join and Waitlist API Documentation

## Overview

This document explains two separate APIs for joining events:

1. **Waitlist API** - For events that are FULL (all spots booked)
2. **Private Event Join API** - For private events (regardless of spots)

Both APIs work independently and serve different purposes.

---

## 1. Waitlist API (For Full Events Only)

### Purpose
When an event has **10 spots** (or any number) and **all spots are booked**, if any other player tries to join, they must use the **Waitlist API**. 

**Important**: 
- Waitlist API **ONLY works when event is FULL** (all spots booked)
- If event has available spots → Use regular join API instead
- If event is private → Use Private Event Join API instead

### How It Works

1. **Event is Full**: All spots are booked (e.g., 10/10 spots booked)
2. **Player Tries to Join**: Player attempts to join the full event
3. **Join Waitlist**: Player calls `POST /api/events/:eventId/join-waitlist`
4. **Organizer Notification**: Organizer receives notification: "Player joined waitlist for your full event"
5. **Organizer Views Waitlist**: Organizer calls `GET /api/events/:eventId/waitlist` to see all waitlist requests
6. **Organizer Action**: 
   - Accept: `POST /api/events/:eventId/waitlist/:waitlistId/accept` → Player added to event
   - Reject: `POST /api/events/:eventId/waitlist/:waitlistId/reject` → Player removed from waitlist
7. **Player Notification**: Player receives notification about acceptance/rejection

---

### API Endpoints

#### 1. Join Waitlist (When Event is Full)
**POST** `/api/events/:eventId/join-waitlist`

Join the waitlist when an event is full.

**Headers:**
- `Authorization`: Bearer token (required)

**When to Use:**
- Event has 10 spots and **all 10 are booked** (spotsFull = true)
- Event is **public** (not private)
- Any player tries to join → Must use waitlist API

**Cannot Use If:**
- Event has available spots → Use `/api/events/:eventId/join` instead
- Event is private → Use `/api/private-events/:eventId/join-request` instead

**Response (Success):**
```json
{
  "success": true,
  "message": "You have been added to the waitlist. You will be notified when a spot becomes available.",
  "data": {
    "waitlistId": "W1",
    "requestId": "Request1",
    "spotsInfo": {
      "totalSpots": 10,
      "spotsBooked": 10,
      "spotsLeft": 0,
      "spotsFull": true
    }
  }
}
```

**Error (Event Has Available Spots):**
```json
{
  "success": false,
  "error": "Event has available spots. Please use the join endpoint instead.",
  "spotsInfo": {
    "totalSpots": 10,
    "spotsBooked": 7,
    "spotsLeft": 3,
    "spotsFull": false
  },
  "action": "join",
  "joinEndpoint": "/api/events/E1/join"
}
```

**Error (Event is Private):**
```json
{
  "success": false,
  "error": "This is a private event. Please use the private event join request endpoint instead.",
  "action": "join-private-event",
  "joinPrivateEndpoint": "/api/private-events/E1/join-request"
}
```

**Notification to Organizer:**
- Type: `event_join_request`
- Title: "Event Full - Waitlist Request"
- Message: "{Player Name} joined the waitlist for your full event: {Event Name}"

---

#### 2. Get Waitlist (Organizer Only)
**GET** `/api/events/:eventId/waitlist?page=1`

Get all waitlist requests for a full event.

**Headers:**
- `Authorization`: Bearer token (required)

**Response:**
```json
{
  "success": true,
  "message": "Waitlist retrieved successfully",
  "data": {
    "waitlist": [
      {
        "waitlistId": "W1",
        "requestId": "Request1",
        "user": {
          "userId": "U1",
          "fullName": "Player Name",
          "email": "player@example.com",
          "profilePic": "https://..."
        },
        "status": "pending",
        "createdAt": "2024-01-01T00:00:00.000Z"
      }
    ],
    "counts": {
      "totalSpots": 10,
      "joinedSpots": 10,
      "availableSpots": 0,
      "pendingWaitlist": 3
    }
  }
}
```

---

#### 3. Accept from Waitlist (Organizer Only)
**POST** `/api/events/:eventId/waitlist/:waitlistId/accept`

Accept a waitlist request. User is added to event when a spot becomes available.

**Headers:**
- `Authorization`: Bearer token (required)

**Response:**
```json
{
  "success": true,
  "message": "User accepted from waitlist and added to event.",
  "data": {
    "waitlistId": "W1",
    "requestId": "Request1",
    "user": {
      "userId": "U1",
      "fullName": "Player Name"
    }
  }
}
```

**Notification to Player:**
- Type: `event_request_accepted`
- Title: "Request Accepted"
- Message: "Your request to join \"{Event Name}\" has been accepted by {Organizer Name}"

---

#### 4. Reject from Waitlist (Organizer Only)
**POST** `/api/events/:eventId/waitlist/:waitlistId/reject`

Reject a waitlist request.

**Headers:**
- `Authorization`: Bearer token (required)

**Response:**
```json
{
  "success": true,
  "message": "User rejected from waitlist.",
  "data": {
    "waitlistId": "W1",
    "requestId": "Request1"
  }
}
```

**Notification to Player:**
- Type: `event_request_rejected`
- Title: "Request Rejected"
- Message: "Your request to join \"{Event Name}\" has been rejected by {Organizer Name}"

---

## 2. Private Event Join API

### Purpose
For **private events**, players must send a join request **regardless of whether spots are available or not**. The organizer gets a notification and can accept or reject the request.

**Important**:
- Private Event Join API works for **private events only**
- Works whether event has available spots or is full
- Different from Waitlist API (which is only for full public events)

### How It Works

1. **Event is Private**: Event has `IsPrivateEvent: true` (can have spots available or be full)
2. **Player Sends Request**: Player calls `POST /api/private-events/:eventId/join-request`
3. **Organizer Notification**: Organizer receives notification: "Player requested to join your private event"
4. **Organizer Views Requests**: Organizer calls `GET /api/private-events/:eventId/join-requests` to see all requests
5. **Organizer Action**: 
   - Accept: `POST /api/private-events/:eventId/join-requests/:waitlistId/accept` → Player added to event (if spots available)
   - Reject: `POST /api/private-events/:eventId/join-requests/:waitlistId/reject` → Player removed from requests
6. **Player Notification**: Player receives notification about acceptance/rejection

---

### API Endpoints

#### 1. Request to Join Private Event
**POST** `/api/private-events/:eventId/join-request`

Send a join request for a private event.

**Headers:**
- `Authorization`: Bearer token (required)

**When to Use:**
- Event is private (`IsPrivateEvent: true`)
- Player wants to join → Must use private event join API

**Response (Success):**
```json
{
  "success": true,
  "message": "Join request sent successfully. The event organiser will review your request.",
  "data": {
    "requestId": "Request1",
    "joinRequestId": "W1",
    "spotsInfo": {
      "totalSpots": 15,
      "spotsBooked": 8,
      "spotsLeft": 7,
      "spotsFull": false
    },
    "counts": {
      "totalSpots": 15,
      "joinedSpots": 8,
      "availableSpots": 7,
      "pendingRequests": 2
    }
  }
}
```

**Error (Not a Private Event):**
```json
{
  "success": false,
  "error": "This is a public event. Please use the join endpoint instead.",
  "action": "join",
  "joinEndpoint": "/api/events/E1/join"
}
```

**Notification to Organizer:**
- Type: `event_join_request`
- Title: "New Join Request"
- Message: "{Player Name} requested to join your private event: {Event Name}"

---

#### 2. Get Join Requests for Private Event (Organizer Only)
**GET** `/api/private-events/:eventId/join-requests?page=1`

Get all join requests for a private event.

**Headers:**
- `Authorization`: Bearer token (required)

**Response:**
```json
{
  "success": true,
  "message": "Join requests retrieved successfully",
  "data": {
    "joinRequests": [
      {
        "requestId": "Request1",
        "joinRequestId": "W1",
        "user": {
          "userId": "U1",
          "fullName": "Player Name",
          "email": "player@example.com"
        },
        "status": "pending",
        "createdAt": "2024-01-01T00:00:00.000Z"
      }
    ],
    "spotsInfo": {
      "totalSpots": 15,
      "spotsBooked": 8,
      "spotsLeft": 7,
      "spotsFull": false
    },
    "counts": {
      "totalSpots": 15,
      "joinedSpots": 8,
      "availableSpots": 7,
      "pendingRequests": 2
    }
  }
}
```

---

#### 3. Get All Join Requests (Organizer Only)
**GET** `/api/private-events/join-requests?page=1`

Get all join requests across all private events created by the organizer.

**Headers:**
- `Authorization`: Bearer token (required)

---

#### 4. Accept Join Request (Organizer Only)
**POST** `/api/private-events/:eventId/join-requests/:requestId/accept`
**OR** **POST** `/api/private-events/:eventId/join-requests/user/:userId/accept`

Accept a join request for a private event.

**Headers:**
- `Authorization`: Bearer token (required)

**Parameters:**
- `eventId`: Event ID (sequential like "E1" or MongoDB ObjectId)
- `requestId`: Join Request ID (sequential like "W1" or MongoDB ObjectId) - **Option 1**
- `userId`: User ID (MongoDB ObjectId) - **Option 2** (alternative way)

**Why We Need Both IDs:**
- An event can have **multiple pending requests** (e.g., 5 players requested to join)
- We need `eventId` to identify which event
- We need `requestId` OR `userId` to identify which **specific request** to accept
- **Option 1**: Use `requestId` from the join request response (e.g., "W1")
- **Option 2**: Use `userId` to find the pending request for that user in that event

**Examples:**
```
POST /api/private-events/E1/join-requests/W1/accept
POST /api/private-events/E1/join-requests/user/507f1f77bcf86cd799439011/accept
```

**Response:**
```json
{
  "success": true,
  "message": "Join request accepted. User has been added to the event.",
  "data": {
    "requestId": "Request1",
    "joinRequestId": "W1",
    "user": {
      "userId": "U1",
      "fullName": "Player Name"
    },
    "spotsInfo": {
      "totalSpots": 15,
      "spotsBooked": 9,
      "spotsLeft": 6,
      "spotsFull": false
    }
  }
}
```

**Notification to Player:**
- Type: `event_request_accepted`
- Title: "Request Accepted"
- Message: "Your request to join \"{Event Name}\" has been accepted by {Organizer Name}"

---

#### 5. Reject Join Request (Organizer Only)
**POST** `/api/private-events/:eventId/join-requests/:requestId/reject`
**OR** **POST** `/api/private-events/:eventId/join-requests/user/:userId/reject`

Reject a join request for a private event.

**Headers:**
- `Authorization`: Bearer token (required)

**Parameters:**
- `eventId`: Event ID (sequential like "E1" or MongoDB ObjectId)
- `requestId`: Join Request ID (sequential like "W1" or MongoDB ObjectId) - **Option 1**
- `userId`: User ID (MongoDB ObjectId) - **Option 2** (alternative way)

**Why We Need Both IDs:**
- An event can have **multiple pending requests** (e.g., 5 players requested to join)
- We need `eventId` to identify which event
- We need `requestId` OR `userId` to identify which **specific request** to reject
- **Option 1**: Use `requestId` from the join request response (e.g., "W1")
- **Option 2**: Use `userId` to find the pending request for that user in that event

**Examples:**
```
POST /api/private-events/E1/join-requests/W1/reject
POST /api/private-events/E1/join-requests/user/507f1f77bcf86cd799439011/reject
```

**Response:**
```json
{
  "success": true,
  "message": "Join request rejected. User has been removed from join requests.",
  "data": {
    "requestId": "Request1",
    "joinRequestId": "W1"
  }
}
```

**Notification to Player:**
- Type: `event_request_rejected`
- Title: "Request Rejected"
- Message: "Your request to join \"{Event Name}\" has been rejected by {Organizer Name}"

---

#### 6. Get My Join Requests (Player)
**GET** `/api/private-events/my-requests?page=1`

Get all join requests made by the logged-in player.

**Headers:**
- `Authorization`: Bearer token (required)

---

## Key Differences

| Feature | Waitlist API | Private Event Join API |
|---------|--------------|------------------------|
| **When to Use** | Event is FULL (all spots booked) | Event is PRIVATE |
| **Spots Check** | Only works when spots are full | Works regardless of spots |
| **Public Events** | Yes (when full) | No |
| **Private Events** | Yes (when full) | Yes (always) |
| **Endpoint** | `/api/events/:eventId/join-waitlist` | `/api/private-events/:eventId/join-request` |
| **View Requests** | `/api/events/:eventId/waitlist` | `/api/private-events/:eventId/join-requests` |
| **Accept** | `/api/events/:eventId/waitlist/:waitlistId/accept` | `/api/private-events/:eventId/join-requests/:waitlistId/accept` |
| **Reject** | `/api/events/:eventId/waitlist/:waitlistId/reject` | `/api/private-events/:eventId/join-requests/:waitlistId/reject` |

---

## Workflow Examples

### Example 1: Waitlist API (Full Event)

**Scenario**: Event has 10 spots, all 10 are booked

1. Player tries to join → Event is full
2. Player calls `POST /api/events/E1/join-waitlist`
3. Organizer receives notification: "Player joined waitlist for your full event"
4. Organizer views waitlist: `GET /api/events/E1/waitlist`
5. Organizer accepts: `POST /api/events/E1/waitlist/W1/accept`
6. Player receives notification: "Your request has been accepted"
7. Player is added to event

---

### Example 2: Private Event Join API

**Scenario**: Event is private (can have available spots or be full)

1. Player wants to join private event
2. Player calls `POST /api/private-events/E1/join-request`
3. Organizer receives notification: "Player requested to join your private event"
4. Organizer views requests: `GET /api/private-events/E1/join-requests`
5. Organizer accepts: `POST /api/private-events/E1/join-requests/W1/accept`
6. Player receives notification: "Your request has been accepted"
7. Player is added to event

---

## Notification Types

### For Organizers

1. **event_join_request** (Waitlist - Full Event)
   - Title: "Event Full - Waitlist Request"
   - Message: "{Player} joined the waitlist for your full event: {Event}"

2. **event_join_request** (Private Event)
   - Title: "New Join Request"
   - Message: "{Player} requested to join your private event: {Event}"

### For Players

1. **event_request_accepted**
   - Title: "Request Accepted"
   - Message: "Your request to join \"{Event}\" has been accepted by {Organizer}"

2. **event_request_rejected**
   - Title: "Request Rejected"
   - Message: "Your request to join \"{Event}\" has been rejected by {Organizer}"

---

## Important Notes

1. **Waitlist API** is ONLY for full events (all spots booked)
2. **Private Event Join API** is ONLY for private events (regardless of spots)
3. Both APIs send notifications to organizer and player
4. Both APIs support accept/reject functionality
5. Organizer must be the event creator to accept/reject requests
6. Players cannot join their own events

---

## Error Handling

### Common Errors

**Event Not Full (Waitlist API):**
```json
{
  "success": false,
  "error": "Event has available spots. Please use the join endpoint instead."
}
```

**Not a Private Event:**
```json
{
  "success": false,
  "error": "This is a public event. Please use the join endpoint instead."
}
```

**Already in Waitlist/Request Sent:**
```json
{
  "success": false,
  "error": "Request already sent. Waiting for organiser approval."
}
```

**Event Full (Cannot Accept):**
```json
{
  "success": false,
  "error": "Event is full. Cannot accept more participants."
}
```

---

## Support

For questions or issues:
- Check API responses for detailed error messages
- Verify event type (public/private) and spots status
- Ensure proper authentication tokens are used
- Check notification endpoints for status updates
