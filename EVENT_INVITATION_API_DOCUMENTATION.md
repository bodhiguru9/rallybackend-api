# Event Invitation API Documentation

## Overview

The Event Invitation API allows organisers to send invitations to players for their events. Players receive notifications when invited and can accept or decline invitations. The system is optimized with parallel queries and efficient data aggregation.

## Features

- **Send Invitation**: Organisers can send invitations to individual players
- **Bulk Invitations**: Organisers can send invitations to multiple players at once
- **Get Invitations**: Players can view all their received invitations
- **Accept/Decline**: Players can accept or decline invitations
- **Cancel Invitation**: Organisers can cancel pending invitations
- **Automatic Notifications**: Players receive notifications when invited
- **Auto-Join**: Accepting an invitation automatically joins the player to the event

## API Endpoints

### Base URL
All endpoints are prefixed with `/api/event-invites`

### Authentication
All endpoints require authentication. Include the JWT token in the Authorization header:
```
Authorization: Bearer <token>
```

---

## 1. Send Event Invitation (Organiser)

Send an invitation to a single player for an event.

**Endpoint:** `POST /api/event-invites/:eventId/send`

**Parameters:**
- `eventId` (path parameter): Event ID (sequential like "E1" or MongoDB ObjectId)

**Request Body:**
```json
{
  "playerId": "507f1f77bcf86cd799439011",
  "message": "You're invited to join our event!" // Optional
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Event invitation sent successfully. The player will receive a notification.",
  "data": {
    "inviteId": "507f1f77bcf86cd799439012",
    "event": {
      "eventId": "E1",
      "eventName": "Football Match",
      "eventDateTime": "2024-12-25T18:00:00.000Z"
    },
    "player": {
      "userId": "1",
      "fullName": "John Doe"
    },
    "message": "You're invited to join our event!",
    "status": "pending",
    "createdAt": "2024-12-20T10:00:00.000Z"
  }
}
```

**Error Responses:**

**400 Bad Request - Missing playerId:**
```json
{
  "success": false,
  "error": "playerId is required"
}
```

**403 Forbidden - Not organiser:**
```json
{
  "success": false,
  "error": "Only organisers can send event invitations"
}
```

**403 Forbidden - Not event creator:**
```json
{
  "success": false,
  "error": "You can only send invitations for events you created"
}
```

**400 Bad Request - Duplicate invitation:**
```json
{
  "success": false,
  "error": "Invitation already sent to this player for this event"
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/api/event-invites/E1/send \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "playerId": "507f1f77bcf86cd799439011",
    "message": "You're invited!"
  }'
```

---

## 2. Send Bulk Invitations (Organiser)

Send invitations to multiple players at once.

**Endpoint:** `POST /api/event-invites/:eventId/send-bulk`

**Parameters:**
- `eventId` (path parameter): Event ID (sequential like "E1" or MongoDB ObjectId)

**Request Body:**
```json
{
  "playerIds": [
    "507f1f77bcf86cd799439011",
    "507f1f77bcf86cd799439012",
    "507f1f77bcf86cd799439013"
  ],
  "message": "You're all invited!" // Optional
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Invitations processed: 2 sent, 1 skipped, 0 failed",
  "data": {
    "event": {
      "eventId": "E1",
      "eventName": "Football Match"
    },
    "results": {
      "total": 3,
      "sent": 2,
      "skipped": 1,
      "failed": 0
    },
    "sent": [
      {
        "playerId": "507f1f77bcf86cd799439011",
        "inviteId": "507f1f77bcf86cd799439020"
      },
      {
        "playerId": "507f1f77bcf86cd799439012",
        "inviteId": "507f1f77bcf86cd799439021"
      }
    ],
    "skipped": [
      {
        "playerId": "507f1f77bcf86cd799439013",
        "error": "Invitation already sent"
      }
    ],
    "failed": []
  }
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/api/event-invites/E1/send-bulk \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "playerIds": ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"],
    "message": "Join us!"
  }'
```

---

## 3. Get Player Invitations

Get all invitations received by the logged-in player.

**Endpoint:** `GET /api/event-invites/player?page=1&status=pending`

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `status` (optional): Filter by status - 'pending', 'accepted', 'declined', 'cancelled'

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Player invitations retrieved successfully",
  "data": {
    "invitations": [
      {
        "inviteId": "507f1f77bcf86cd799439012",
        "event": {
          "eventId": "E1",
          "eventName": "Football Match",
          "eventDateTime": "2024-12-25T18:00:00.000Z",
          "eventLocation": "Stadium A",
          "eventImages": ["https://..."],
          "IsPrivateEvent": false
        },
        "organiser": {
          "userId": "2",
          "fullName": "Jane Organiser",
          "profilePic": "https://...",
          "communityName": "Sports Club"
        },
        "message": "You're invited!",
        "status": "pending",
        "createdAt": "2024-12-20T10:00:00.000Z",
        "acceptedAt": null,
        "declinedAt": null,
        "cancelledAt": null
      }
    ],
    "totalInvitations": 5,
    "pagination": {
      "total": 5,
      "totalPages": 1,
      "currentPage": 1,
      "perPage": 20,
      "hasMore": false,
      "hasPrevious": false
    },
    "filter": {
      "status": "pending"
    }
  }
}
```

**Example:**
```bash
curl http://localhost:3000/api/event-invites/player?page=1&status=pending \
  -H "Authorization: Bearer <token>"
```

---

## 4. Get Organiser Sent Invitations

Get all invitations sent by the logged-in organiser.

**Endpoint:** `GET /api/event-invites/organiser?page=1&eventId=E1&status=pending`

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `eventId` (optional): Filter by event ID
- `status` (optional): Filter by status - 'pending', 'accepted', 'declined', 'cancelled'

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Organiser invitations retrieved successfully",
  "data": {
    "invitations": [
      {
        "inviteId": "507f1f77bcf86cd799439012",
        "event": {
          "eventId": "E1",
          "eventName": "Football Match",
          "eventDateTime": "2024-12-25T18:00:00.000Z"
        },
        "player": {
          "userId": "1",
          "fullName": "John Doe",
          "profilePic": "https://..."
        },
        "message": "You're invited!",
        "status": "pending",
        "createdAt": "2024-12-20T10:00:00.000Z",
        "acceptedAt": null,
        "declinedAt": null,
        "cancelledAt": null
      }
    ],
    "totalInvitations": 10,
    "filter": {
      "eventId": "E1",
      "status": "pending"
    }
  }
}
```

**Example:**
```bash
curl http://localhost:3000/api/event-invites/organiser?page=1&eventId=E1 \
  -H "Authorization: Bearer <token>"
```

---

## 5. Accept Invitation (Player)

Accept an event invitation. This automatically joins the player to the event.

**Endpoint:** `POST /api/event-invites/:inviteId/accept`

**Parameters:**
- `inviteId` (path parameter): Invitation ID (MongoDB ObjectId)

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Invitation accepted successfully. You have been added to the event.",
  "data": {
    "inviteId": "507f1f77bcf86cd799439012",
    "event": {
      "eventId": "E1",
      "eventName": "Football Match"
    },
    "status": "accepted"
  }
}
```

**Error Responses:**

**404 Not Found:**
```json
{
  "success": false,
  "error": "Invitation not found"
}
```

**403 Forbidden:**
```json
{
  "success": false,
  "error": "You can only accept your own invitations"
}
```

**400 Bad Request - Already processed:**
```json
{
  "success": false,
  "error": "Invitation has already been accepted",
  "status": "accepted"
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/api/event-invites/507f1f77bcf86cd799439012/accept \
  -H "Authorization: Bearer <token>"
```

---

## 6. Decline Invitation (Player)

Decline an event invitation.

**Endpoint:** `POST /api/event-invites/:inviteId/decline`

**Parameters:**
- `inviteId` (path parameter): Invitation ID (MongoDB ObjectId)

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Invitation declined successfully",
  "data": {
    "inviteId": "507f1f77bcf86cd799439012",
    "event": {
      "eventId": "E1",
      "eventName": "Football Match"
    },
    "status": "declined"
  }
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/api/event-invites/507f1f77bcf86cd799439012/decline \
  -H "Authorization: Bearer <token>"
```

---

## 7. Cancel Invitation (Organiser)

Cancel a pending invitation.

**Endpoint:** `POST /api/event-invites/:inviteId/cancel`

**Parameters:**
- `inviteId` (path parameter): Invitation ID (MongoDB ObjectId)

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Invitation cancelled successfully",
  "data": {
    "inviteId": "507f1f77bcf86cd799439012",
    "status": "cancelled"
  }
}
```

**Error Responses:**

**403 Forbidden:**
```json
{
  "success": false,
  "error": "You can only cancel invitations you sent"
}
```

**400 Bad Request:**
```json
{
  "success": false,
  "error": "Cannot cancel invitation that is already accepted",
  "status": "accepted"
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/api/event-invites/507f1f77bcf86cd799439012/cancel \
  -H "Authorization: Bearer <token>"
```

---

## Notification System

### Notification Types

1. **`event_invitation`**: Sent to player when they receive an invitation
   - Title: "Event Invitation"
   - Message: "{organiserName} invited you to join \"{eventName}\""
   - Data includes: `inviteId`, `eventId`, `eventName`, `organiserId`, `organiserName`, `message`

2. **`event_invitation_accepted`**: Sent to organiser when player accepts invitation
   - Title: "Invitation Accepted"
   - Message: "{playerName} accepted your invitation to join \"{eventName}\""
   - Data includes: `inviteId`, `eventId`, `eventName`, `playerId`, `playerName`

3. **`event_invitation_declined`**: Sent to organiser when player declines invitation
   - Title: "Invitation Declined"
   - Message: "{playerName} declined your invitation to join \"{eventName}\""
   - Data includes: `inviteId`, `eventId`, `eventName`, `playerId`, `playerName`

### Notification Flow

1. **Organiser sends invitation** → Player receives `event_invitation` notification
2. **Player accepts invitation** → Organiser receives `event_invitation_accepted` notification + Player automatically joins event
3. **Player declines invitation** → Organiser receives `event_invitation_declined` notification

---

## Database Schema

### EventInvite Collection

```javascript
{
  _id: ObjectId,
  organiserId: ObjectId,        // Organiser who sent the invitation
  playerId: ObjectId,           // Player who received the invitation
  eventId: ObjectId,            // Event for which invitation is sent
  message: String,               // Optional invitation message
  status: String,                // 'pending', 'accepted', 'declined', 'cancelled'
  createdAt: Date,               // When invitation was sent
  acceptedAt: Date,              // When invitation was accepted (if accepted)
  declinedAt: Date,              // When invitation was declined (if declined)
  cancelledAt: Date,             // When invitation was cancelled (if cancelled)
  updatedAt: Date               // Last update time
}
```

---

## Optimization Features

1. **Parallel Queries**: Events and users are fetched in parallel for better performance
2. **Bulk Operations**: Support for sending multiple invitations at once
3. **Efficient Filtering**: Status and event-based filtering at database level
4. **Indexed Queries**: Uses indexed fields (organiserId, playerId, eventId, status) for fast lookups
5. **Single Query Aggregation**: Combines related data in minimal database queries

---

## Error Codes

| Status Code | Description |
|------------|-------------|
| 200 | Success |
| 400 | Bad Request (invalid input, duplicate invitation, already processed) |
| 403 | Forbidden (not organiser/player, not event creator, not invitation owner) |
| 404 | Not Found (event, player, or invitation not found) |
| 500 | Internal Server Error |

---

## Usage Examples

### Complete Flow

1. **Organiser sends invitation:**
```bash
POST /api/event-invites/E1/send
{
  "playerId": "507f1f77bcf86cd799439011",
  "message": "Join our event!"
}
```

2. **Player receives notification** (automatic)

3. **Player views invitations:**
```bash
GET /api/event-invites/player?status=pending
```

4. **Player accepts invitation:**
```bash
POST /api/event-invites/507f1f77bcf86cd799439012/accept
```

5. **Player is automatically added to event** (automatic)

6. **Organiser receives acceptance notification** (automatic)

---

## Notes

- Only organisers can send invitations
- Organisers can only send invitations for events they created
- Players can only accept/decline their own invitations
- Accepting an invitation automatically joins the player to the event
- Duplicate invitations are prevented (one pending/accepted invitation per player per event)
- Notifications are sent automatically for all invitation actions
- Bulk invitations process each player independently (some may succeed, others may fail)

---

## Support

For issues or questions, please contact the development team or refer to the main API documentation.
