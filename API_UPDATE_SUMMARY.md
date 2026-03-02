# API Update Summary - Exclude Joined Events from Home Feed

## Update Description
Updated the home feed API to exclude events that a player has already joined (both public and private events).

## Updated Endpoint

### `GET /api/events/all`
**Home Feed API** - Now excludes events that the authenticated user has already joined.

#### Changes Made:
1. **Exclusion Logic**: When a user is authenticated, the API now:
   - Fetches all events the user has joined from the `eventJoins` collection
   - Filters out those events from the home feed results
   - Works for both **public** and **private** events

2. **Pagination**: Updated to account for filtered events:
   - Fetches more events initially to ensure enough results after filtering
   - Total count calculation also excludes joined events

#### How It Works:
- **For Authenticated Users**: Events they've joined (public or private) will NOT appear in the home feed
- **For Unauthenticated Users**: All events are shown (no change)
- **Event Types**: Works for both public events (direct join) and private events (accepted from waitlist)

#### Example Request:
```http
GET /api/events/all?page=1
Authorization: Bearer <access_token>
```

#### Example Response:
```json
{
  "success": true,
  "message": "All events retrieved successfully",
  "data": {
    "events": [
      // Only events the user has NOT joined
    ],
    "pagination": {
      "total": 50,
      "totalPages": 3,
      "currentPage": 1,
      "perPage": 20,
      "hasMore": true,
      "hasPrevious": false
    }
  }
}
```

## Technical Details

### Files Modified:
- `src/controllers/event/allEvents.controller.js`
  - Added logic to fetch joined events for authenticated users
  - Added filtering to exclude joined events from results
  - Updated count query to exclude joined events from pagination

### Database Collections Used:
- `eventJoins` - To check which events a user has joined
- `events` - Main events collection

### Logic Flow:
1. Check if user is authenticated
2. If authenticated, fetch all `eventJoins` records for the user
3. Get event IDs from joined events
4. Fetch events with filters (fetching more to account for filtering)
5. Filter out events that match joined event IDs
6. Apply pagination to filtered results
7. Calculate total count excluding joined events

## Testing

### Test Cases:
1. **Authenticated user with joined events**: Should not see joined events in feed
2. **Authenticated user with no joined events**: Should see all events
3. **Unauthenticated user**: Should see all events (no change)
4. **Public events**: Joined public events should be excluded
5. **Private events**: Accepted private events should be excluded
6. **Pagination**: Should work correctly with filtered results

### Test Endpoint:
```bash
# With authentication token
curl -X GET "http://localhost:3000/api/events/all?page=1" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Without authentication (should show all events)
curl -X GET "http://localhost:3000/api/events/all?page=1"
```

## Notes

- This update only affects the `/api/events/all` endpoint (home feed)
- Other endpoints like `/api/events/my-events-status` still show joined events (as expected)
- The exclusion works for both public and private events
- Events are excluded based on entries in the `eventJoins` collection
- For private events, this means events where the user was accepted from the waitlist
