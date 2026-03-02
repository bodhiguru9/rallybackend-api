# Event Reminder API Documentation

## Overview

The Event Reminder API allows users to set reminders for upcoming events. The system automatically creates two types of reminders:
1. **Event Start Reminder**: Users receive WhatsApp notifications 2 hours before the event starts
2. **Registration Start Reminder**: Users receive WhatsApp notifications when event registration opens (if registration start time is set)

The system uses a cron job to automatically check and send reminders.

## Features

- **Add Reminder**: Users can set reminders for future events (automatically creates both event start and registration start reminders if applicable)
- **Remove Reminder**: Users can remove all reminders for an event (removes both types)
- **Get My Reminders**: Users can view all their reminders (both types)
- **Check Reminder Status**: Users can check if they have reminders for a specific event
- **Automatic WhatsApp Notifications**: 
  - Event start: 2 hours before event starts
  - Registration start: At the exact registration start time
- **Time Until Start**: Event APIs now include time remaining until event starts for upcoming events

## API Endpoints

### Base URL
All endpoints are prefixed with `/api/event-reminders`

### Authentication
All endpoints require authentication. Include the JWT token in the Authorization header:
```
Authorization: Bearer <token>
```

---

## 1. Add Event Reminder

Add reminders for a future event. The system automatically creates:
- **Event Start Reminder**: User will receive a WhatsApp notification 2 hours before the event starts
- **Registration Start Reminder**: User will receive a WhatsApp notification when registration opens (if `eventRegistrationStartTime` is set and in the future)

**Endpoint:** `POST /api/event-reminders/:eventId/add`

**Parameters:**
- `eventId` (path parameter): Event ID (sequential like "E1" or MongoDB ObjectId)

**Request Body:**
None required

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Event reminders added successfully. You will receive WhatsApp notifications for: Event start: 2 hours before event (2024-12-25T16:00:00.000Z) and Registration start: at registration time (2024-12-20T10:00:00.000Z).",
  "data": {
    "reminders": [
      {
        "reminderId": "507f1f77bcf86cd799439011",
        "reminderType": "event_start",
        "reminderTime": "2024-12-25T16:00:00.000Z",
        "notificationTime": "2 hours before event (2024-12-25T16:00:00.000Z)"
      },
      {
        "reminderId": "507f1f77bcf86cd799439012",
        "reminderType": "registration_start",
        "reminderTime": "2024-12-20T10:00:00.000Z",
        "notificationTime": "At registration start time (2024-12-20T10:00:00.000Z)"
      }
    ],
    "event": {
      "eventId": "E1",
      "eventName": "Football Match",
      "eventDateTime": "2024-12-25T18:00:00.000Z",
      "eventRegistrationStartTime": "2024-12-20T10:00:00.000Z",
      "eventLocation": "Stadium A"
    },
    "totalReminders": 2
  }
}
```

**Note:** If the event doesn't have a `eventRegistrationStartTime` or if it's in the past, only the event start reminder will be created.

**Error Responses:**

**400 Bad Request - Event is past or ongoing:**
```json
{
  "success": false,
  "error": "Cannot set reminder for past or ongoing events. Only future events can have reminders.",
  "eventStatus": "past"
}
```

**400 Bad Request - Reminder already exists:**
```json
{
  "success": false,
  "error": "Reminder already set for this event"
}
```

**404 Not Found - Event not found:**
```json
{
  "success": false,
  "error": "Event not found",
  "eventId": "E999"
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/api/event-reminders/E1/add \
  -H "Authorization: Bearer <token>"
```

---

## 2. Remove Event Reminder

Remove all reminders (both event start and registration start) for an event.

**Endpoint:** `DELETE /api/event-reminders/:eventId/remove`

**Parameters:**
- `eventId` (path parameter): Event ID (sequential like "E1" or MongoDB ObjectId)

**Request Body:**
None required

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Event reminder removed successfully",
  "data": {
    "eventId": "E1"
  }
}
```

**Error Responses:**

**404 Not Found - Reminder not found:**
```json
{
  "success": false,
  "error": "Reminder not found for this event"
}
```

**Note:** This removes both event start and registration start reminders for the event.

**Example:**
```bash
curl -X DELETE http://localhost:3000/api/event-reminders/E1/remove \
  -H "Authorization: Bearer <token>"
```

---

## 3. Get My Reminders

Get all reminders set by the logged-in user.

**Endpoint:** `GET /api/event-reminders?page=1`

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- Results are paginated with 20 reminders per page

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Event reminders retrieved successfully",
  "data": {
    "reminders": [
      {
        "reminderId": "507f1f77bcf86cd799439011",
        "reminderType": "event_start",
        "event": {
          "eventId": "E1",
          "eventName": "Football Match",
          "eventDateTime": "2024-12-25T18:00:00.000Z",
          "eventRegistrationStartTime": "2024-12-20T10:00:00.000Z",
          "eventLocation": "Stadium A"
        },
        "reminderTime": "2024-12-25T16:00:00.000Z",
        "eventDateTime": "2024-12-25T18:00:00.000Z",
        "registrationStartTime": null,
        "notificationSent": false,
        "createdAt": "2024-12-20T10:00:00.000Z"
      },
      {
        "reminderId": "507f1f77bcf86cd799439012",
        "reminderType": "registration_start",
        "event": {
          "eventId": "E1",
          "eventName": "Football Match",
          "eventDateTime": "2024-12-25T18:00:00.000Z",
          "eventRegistrationStartTime": "2024-12-20T10:00:00.000Z",
          "eventLocation": "Stadium A"
        },
        "reminderTime": "2024-12-20T10:00:00.000Z",
        "eventDateTime": "2024-12-25T18:00:00.000Z",
        "registrationStartTime": "2024-12-20T10:00:00.000Z",
        "notificationSent": false,
        "createdAt": "2024-12-20T10:00:00.000Z"
      }
    ],
    "totalReminders": 5,
    "pagination": {
      "total": 5,
      "totalPages": 1,
      "currentPage": 1,
      "perPage": 20,
      "hasMore": false,
      "hasPrevious": false
    }
  }
}
```

**Example:**
```bash
curl http://localhost:3000/api/event-reminders?page=1 \
  -H "Authorization: Bearer <token>"
```

---

## 4. Check Reminder Status

Check if the user has set a reminder for a specific event.

**Endpoint:** `GET /api/event-reminders/:eventId/check`

**Parameters:**
- `eventId` (path parameter): Event ID (sequential like "E1" or MongoDB ObjectId)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "hasReminder": true,
    "eventId": "E1"
  }
}
```

**Example:**
```bash
curl http://localhost:3000/api/event-reminders/E1/check \
  -H "Authorization: Bearer <token>"
```

---

## Event API Updates

All event APIs now include `timeUntilStart` for upcoming events. This field provides detailed information about how much time remains until the event starts.

### Updated Event Response Format

For upcoming events, the response now includes:

```json
{
  "eventId": "E1",
  "eventName": "Football Match",
  "eventDateTime": "2024-12-25T18:00:00.000Z",
  "eventStatus": "upcoming",
  "timeUntilStart": {
    "milliseconds": 432000000,
    "seconds": 432000,
    "minutes": 7200,
    "hours": 120,
    "days": 5,
    "timeRemaining": "5 days 0 hours",
    "timeRemainingShort": "5d 0h",
    "startsAt": "2024-12-25T18:00:00.000Z",
    "startsAtFormatted": "Wednesday, December 25, 2024, 06:00 PM"
  },
  // ... other event fields
}
```

**Note:** `timeUntilStart` is only included for events with `eventStatus: "upcoming"`. For past or ongoing events, this field will be `null`.

### Affected APIs

The following event APIs now include `timeUntilStart`:

1. `GET /api/events/all` - Get all events
2. `GET /api/events/:eventId` - Get event details
3. `GET /api/events/search` - Search events
4. `GET /api/events` - Get events with filters
5. `GET /api/events/my-events` - Get my events (organiser)
6. `GET /api/events/organiser/created-events` - Get organiser created events
7. `GET /api/events/all/organiser/:organiserId` - Get events by organiser

---

## WhatsApp Notification System

### How It Works

1. **Reminder Creation**: When a user adds a reminder, the system automatically creates:
   - **Event Start Reminder**: Calculates reminder time (2 hours before event start) and stores it
   - **Registration Start Reminder**: Uses the exact registration start time (if `eventRegistrationStartTime` exists and is in the future)

2. **Cron Job**: A background cron job runs every 5 minutes to check for reminders that need to be sent.

3. **Notification Sending**: When a reminder's time arrives (within the next 5 minutes), the system:
   - Retrieves the event details
   - Retrieves the user's mobile number
   - Sends a WhatsApp message via Twilio (with different messages for event start vs registration start)
   - Marks the reminder as sent

### Notification Message Format

The WhatsApp notification message varies based on reminder type:

**Event Start Reminder (2 hours before):**
```
🔔 Rally Event Reminder

Your event "Football Match" is starting in 2 hours!

📅 Date & Time: Wednesday, December 25, 2024, 06:00 PM
📍 Location: Stadium A

See you there! 🎉
```

**Registration Start Reminder (when registration opens):**
```
🔔 Rally Registration Reminder

Registration for "Football Match" is now open!

📅 Registration Started: Friday, December 20, 2024, 10:00 AM
📅 Event Date & Time: Wednesday, December 25, 2024, 06:00 PM
📍 Location: Stadium A

Register now to secure your spot! 🎉
```

### Cron Job Configuration

- **Interval**: Every 5 minutes
- **Check Window**: Reminders are sent if their `reminderTime` is within the next 5 minutes
- **Automatic Start**: The cron job starts automatically when the server starts

### Requirements

- **Twilio Configuration**: The system requires Twilio credentials to send WhatsApp messages:
  - `TWILIO_ACCOUNT_SID`
  - `TWILIO_AUTH_TOKEN`
  - `TWILIO_WHATSAPP_NUMBER` (optional, defaults to UAE number)

- **User Mobile Number**: Users must have a valid mobile number in their profile to receive WhatsApp notifications.

### Error Handling

- If Twilio is not configured, the system logs a message but continues running
- If a user doesn't have a mobile number, the reminder is skipped
- If an event is not found or has passed, the reminder is marked as sent to avoid retrying
- Failed notifications are logged but don't stop the cron job

---

## Database Schema

### EventReminder Collection

```javascript
{
  _id: ObjectId,
  userId: ObjectId,                    // User who set the reminder
  eventId: ObjectId,                   // Event for which reminder is set
  reminderType: String,                // 'event_start' or 'registration_start'
  eventDateTime: Date,                 // Event start date/time
  registrationStartTime: Date,          // Registration start time (only for registration_start type)
  reminderTime: Date,                   // When to send reminder
                                      // - For event_start: 2 hours before event
                                      // - For registration_start: exact registration start time
  notificationSent: Boolean,           // Whether notification has been sent
  notificationSentAt: Date,             // When notification was sent (if sent)
  createdAt: Date,                     // When reminder was created
  updatedAt: Date                      // Last update time
}
```

---

## Error Codes

| Status Code | Description |
|------------|-------------|
| 200 | Success |
| 400 | Bad Request (invalid input, reminder already exists, event is past) |
| 401 | Unauthorized (missing or invalid token) |
| 404 | Not Found (event or reminder not found) |
| 500 | Internal Server Error |

---

## Usage Examples

### Complete Flow

1. **User browses events and finds an upcoming event:**
```bash
GET /api/events/all
```

2. **User checks if they have a reminder for the event:**
```bash
GET /api/event-reminders/E1/check
```

3. **User adds a reminder:**
```bash
POST /api/event-reminders/E1/add
```

4. **User views all their reminders:**
```bash
GET /api/event-reminders?page=1
```

5. **2 hours before event, user receives WhatsApp notification automatically**

6. **User can remove reminder if needed:**
```bash
DELETE /api/event-reminders/E1/remove
```

---

## Notes

- Reminders can only be set for future events (events with `eventStatus: "upcoming"`)
- When adding a reminder, the system automatically creates both event start and registration start reminders (if registration start time exists and is in the future)
- Each user can only have reminders set once per event (adding again will return an error)
- Removing a reminder removes both event start and registration start reminders for that event
- Reminders are automatically cleaned up if the event is deleted or cancelled
- The cron job runs continuously while the server is running
- WhatsApp notifications require valid Twilio configuration
- Users must have a mobile number in their profile to receive notifications
- Registration start reminders are only created if `eventRegistrationStartTime` is set and is in the future

---

## Support

For issues or questions, please contact the development team or refer to the main API documentation.
