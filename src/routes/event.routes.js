const express = require('express');
const router = express.Router();
const eventController = require('../controllers/event/event.controller');
const updateEventController = require('../controllers/event/updateEvent.controller');
const deleteEventController = require('../controllers/event/deleteEvent.controller');
const eventJoinController = require('../controllers/join/eventJoin.controller');
const eventRequestController = require('../controllers/request/eventRequest.controller');
const waitlistController = require('../controllers/waitlist/waitlist.controller');
const searchEventsController = require('../controllers/event/searchEvents.controller');
const searchByTypeSportController = require('../controllers/event/searchByTypeSport.controller');
const myEventsController = require('../controllers/event/myEvents.controller');
const allEventsController = require('../controllers/event/allEvents.controller');
const shareEventController = require('../controllers/share/shareEvent.controller');
const getFilterOptionsController = require('../controllers/event/getFilterOptions.controller');
const joinPrivateEventController = require('../controllers/joinPrivate/joinPrivateEvent.controller');
const getJoinRequestsController = require('../controllers/joinPrivate/getJoinRequests.controller');
const acceptRejectRequestController = require('../controllers/joinPrivate/acceptRejectRequest.controller');
const { protect, optionalAuth } = require('../middleware/auth');
const organiserOnly = require('../middleware/organiserOnly');

/**
 * EVENT ROUTES
 */

/**
 * Create a new event
 * POST /api/events
 * Headers: Authorization: Bearer <token>
 * Content-Type: multipart/form-data
 * 
 * Form Data:
 * - eventImage: [file] (optional, up to 5 images allowed)
 *   OR game_image: [file] (optional, up to 5 images allowed, backward compatibility)
 * - eventVideo: [file] (optional)
 *   OR game_video: [file] (optional, backward compatibility)
 * - eventName: "Cricket Championship 2024" (required)
 * - eventType: "tournament" (required)
 * - eventSports: "cricket" or ["cricket", "football"] (optional)
 * - eventDateTime: "2024-12-25T10:00:00Z" (required)
 * - eventFrequency: ["daily", "weekly"] or "daily" (optional, array of frequency values)
 * - eventLocation: "Stadium Name" (required)
 * - eventDescription: "Event description" (optional)
 * - eventGender: "male" | "female" | "all" (optional)
 * - eventSportsLevel: "beginner" | "intermediate" | "advanced" | "all" (optional)
 * - eventMinAge: 18 (optional, number)
 * - eventMaxAge: 65 (optional, number)
 * - eventLevelRestriction: "Age 18+" (optional)
 * - eventMaxGuest: 50 (required, number)
 * - eventPricePerGuest: 100 (optional, number)
 * - IsPrivateEvent: true | false (optional, boolean, default: false)
 * - eventOurGuestAllowed: true | false (optional, boolean, default: false)
 * - eventApprovalReq: true | false (optional, boolean, default: false)
 * - eventDisallow: true | false (optional, boolean, default: false)
 * - eventApprovalRequired: true | false (optional, boolean, default: false)
 * - policyJoind: (optional) value - string or number, e.g. policy text or ID
 * - eventRegistrationStartTime: "2024-12-20T10:00:00Z" (optional)
 * - eventRegistrationEndTime: "2024-12-24T10:00:00Z" (optional)
 * - eventSavedraft: true | false (optional, boolean - if true, saves as draft)
 * 
 * Note: 
 * - eventCreatorName, eventCreatorEmail, eventCreatorProfilePic are automatically set from organiser's profile
 * - eventStatus is automatically calculated based on eventDateTime (past, ongoing, upcoming)
 * - If eventSavedraft is true, event is saved as draft (not live)
 * - Up to 5 images can be uploaded (optional - can be 0 to 5 images)
 * - Video is optional
 */
router.post('/', protect, organiserOnly, eventController.createEvent);

/**
 * Get all events with filters
 * GET /api/events/all?gameCategory=cricket&visibility=public&page=1
 * 
 * Returns all events with full organiser information and pagination
 * Uses page-based pagination: 20 items per page
 * 
 * Query Parameters:
 * - gameCategory: Filter by category (optional, e.g., "cricket", "swimming")
 * - gameCreatorName: Filter by creator name (optional)
 * - gameType: Filter by type (optional)
 * - visibility: Filter by visibility - 'public' or 'private' (optional)
 * - status: Filter by status (optional)
 * - startDate: Filter events from this date onwards (ISO format: YYYY-MM-DD) (optional)
 * - endDate: Filter events up to this date (ISO format: YYYY-MM-DD) (optional)
 * - sortBy: Sort by 'date' to sort by gameStartDate, default sorts by createdAt (optional)
 * - page: Page number (default: 1)
 * 
 * Response includes:
 * - All event details
 * - Full organiser/creator information (userId, fullName, email, sports, followersCount, etc.)
 * - Participants count and list (for public events)
 * - Waitlist count (for private events, if user is creator)
 * - User join status (if authenticated)
 * - Pagination information
 * 
 * NOTE: This route must come before /:eventId to prevent "all" from being matched as an eventId
 */
router.get('/all', optionalAuth, allEventsController.getAllEvents);

/**
 * Get unique filter options (sports, eventTypes, locations, prices)
 * GET /api/events/filter-options
 * 
 * Returns unique/distinct values for:
 * - sports: Array of unique sports names from eventSports
 * - eventTypes: Array of unique event types
 * - locations: Array of unique event locations
 * - prices: Array of unique prices (sorted)
 * 
 * All values are deduplicated - no repeats
 * 
 * NOTE: This route must come before /:eventId to prevent "filter-options" from being matched as an eventId
 */
router.get('/filter-options', getFilterOptionsController.getFilterOptions);

/**
 * Search events by eventType OR eventSports (at least one required)
 * GET /api/events/search/type-sport?eventType=tournament&eventSports=cricket,football&page=1&limit=10
 * GET /api/events/search/type-sport?eventType=tournament&page=1&limit=10
 * GET /api/events/search/type-sport?eventSports=cricket,football&page=1&limit=10
 *
 * NOTE: Must come before /:eventId
 */
router.get('/search/type-sport', optionalAuth, searchByTypeSportController.searchByTypeAndSport);

/**
 * Search events by gameTitle, category, and date
 * GET /api/events/search?gameTitle=Championship&category=cricket&startDate=2024-12-01&page=1&limit=10
 * 
 * Query Parameters:
 * - gameTitle: Search by event title or creator name (optional, case-insensitive)
 * - category: Filter by game category (optional, e.g., "cricket", "swimming")
 * - startDate: Filter events on this exact date (ISO format: YYYY-MM-DD) (optional)
 *   Example: ?startDate=2026-01-20 will show only events on January 20, 2026
 * - page: Page number (default: 1)
 * - limit: Number of results per page (default: 10, max: 100)
 * 
 * Returns:
 * - Event data with creator info
 * - Participants count (for public events)
 * - Waitlist count (for private events)
 * - User join status (if authenticated)
 * - Available spots and full status
 * - Pagination information
 * - Filter options (unique sports, eventTypes, locations, prices)
 * 
 * NOTE: This route must come before /:eventId to prevent "search" from being matched as an eventId
 */
router.get('/search', optionalAuth, searchEventsController.searchEvents);

/**
 * Get my events (Organiser only)
 * GET /api/events/my-events?limit=50&skip=0
 * Headers: Authorization: Bearer <token>
 * 
 * NOTE: This route must come before /:eventId to prevent "my-events" from being matched as an eventId
 */
router.get('/my-events', protect, organiserOnly, eventController.getMyEvents);

/**
 * Get events created by logged-in organiser
 * GET /api/events/organiser/created-events?page=1&limit=20
 * Headers: Authorization: Bearer <token>
 * 
 * Returns all events created by the authenticated organiser.
 * Uses page-based pagination: 20 items per page (default)
 * 
 * Query Parameters:
 * - page: Page number (default: 1)
 * - limit: Number of events per page (default: 20, max: 100)
 * 
 * Response includes:
 * - All event details with full information
 * - Participants count (for public events)
 * - Waitlist count (for private events)
 * - Organiser information
 * - Pagination information
 * 
 * NOTE: This route must come before /:eventId to prevent "organiser" from being matched as an eventId
 */
router.get('/organiser/created-events', protect, organiserOnly, eventController.getOrganiserCreatedEvents);

/**
 * Get my join requests (see all my pending requests)
 * GET /api/events/my-requests?page=1
 * Headers: Authorization: Bearer <token>
 * 
 * Returns all pending join requests made by the authenticated user.
 * Uses page-based pagination: 20 items per page
 * Query parameter: page (default: 1)
 * NOTE: This route must come before /:eventId to prevent "my-requests" from being matched as an eventId
 */
router.get('/my-requests', protect, eventRequestController.getMyJoinRequests);

/**
 * Get my events categorized by status (upcoming, ongoing, past, cancelled)
 * GET /api/events/my-events-status
 * Headers: Authorization: Bearer <token>
 * 
 * Returns all events the user has joined or created, categorized by:
 * - upcoming: Events with status 'upcoming' or future dates
 * - ongoing: Events with status 'ongoing' or currently happening
 * - past: Events with status 'completed' or past dates
 * - cancelled: Events with status 'cancelled'
 * 
 * Response includes:
 * - upcoming: Array of upcoming events
 * - ongoing: Array of ongoing events
 * - past: Array of past events
 * - cancelled: Array of cancelled events
 * - summary: Count of events in each category
 * 
 * NOTE: This route must come before /:eventId to prevent "my-events-status" from being matched as an eventId
 */
router.get('/my-events-status', protect, myEventsController.getMyEventsByStatus);

/**
 * Access event via share link
 * GET /api/events/share/:eventId?token=...
 * 
 * Public endpoint to access events via share link.
 * Works for both public and private events.
 * 
 * For private events accessed via share link:
 * - Shows event details
 * - Indicates that authentication is required to join
 * 
 * NOTE: This route must come before /:eventId to prevent "share" from being matched as an eventId
 */
router.get('/share/:eventId', shareEventController.accessEventViaShareLink);

/**
 * Generate shareable link for event
 * GET /api/events/:eventId/share-link
 * Headers: Authorization: Bearer <token> (optional for public events, required for private events)
 * 
 * Returns shareable links for the event:
 * - Simple link: /api/events/share/:eventId
 * - Secure link: /api/events/share/:eventId?token=...
 * 
 * For private events, only the creator can generate share links.
 * For public events, anyone can generate share links.
 * 
 * NOTE: This route must come before /:eventId to prevent "share-link" from being matched as an eventId
 */
router.get('/:eventId/share-link', optionalAuth, shareEventController.generateShareLink);

/**
 * Get event creator profile by eventId
 * GET /api/events/:eventId/creator
 * 
 * Supports both sequential eventId (E1, E2, etc.) and MongoDB ObjectId
 * 
 * Response includes:
 * - Full creator/organiser profile details
 * - Follower count (for organisers)
 * - Follow status (if authenticated)
 * - Event information (eventId, eventName, eventType, eventDateTime)
 * 
 * For organisers, shows:
 * - followersCount: Number of followers
 * - isFollowing: Whether authenticated user is following (if logged in)
 * - canFollow: Whether organiser can be followed (if public)
 * 
 * NOTE: This route must come before /:eventId to prevent "creator" from being matched as an eventId
 */
router.get('/:eventId/creator', optionalAuth, eventController.getEventCreatorProfile);

/**
 * Get event details
 * GET /api/events/:eventId
 * 
 * Supports both sequential eventId (E1, E2, etc.) and MongoDB ObjectId
 * 
 * Response includes:
 * - Event details
 * - Creator information (name, profile, events created, total attendees)
 * - Participants list (if public or user is creator)
 * - Waitlist (if private and user is creator)
 */
router.get('/:eventId', optionalAuth, eventController.getEventDetails);

/**
 * Update event
 * PUT /api/events/:eventId
 * Headers: Authorization: Bearer <token>
 * Content-Type: multipart/form-data
 * 
 * Form Data: (all optional, only include fields to update)
 * - game_image: [file]
 * - game_video: [file]
 * - game_type: "tournament"
 * - game_category: "cricket"
 * - game_start_date: "2024-12-25T10:00:00Z"
 * - game_time: "10:00 AM" (optional)
 * - game_spots: "50"
 * - game_location_arena: "Stadium Name"
 * - game_join_price: "100"
 * - game_creator_name: "John Doe"
 * - game_restrictions: "Age 18+"
 * - visibility: "public" | "private"
 * - status: "upcoming" | "ongoing" | "completed" | "cancelled"
 */
router.put('/:eventId', protect, organiserOnly, updateEventController.updateEvent);

/**
 * Delete event
 * DELETE /api/events/:eventId
 * Headers: Authorization: Bearer <token>
 * 
 * Note: Supports both sequential eventId (E1, E2, etc.) and MongoDB ObjectId
 * Deletes event and associated image/video files
 */
router.delete('/:eventId', protect, organiserOnly, deleteEventController.deleteEvent);

/**
 * EVENT JOIN ROUTES
 */

/**
 * Join a public event (only for public events)
 * POST /api/events/:eventId/join
 * Headers: Authorization: Bearer <token>
 * 
 * Only works for public events. For private events, use request-join endpoint.
 */
router.post('/:eventId/join', protect, eventJoinController.joinEvent);

/**
 * Join waitlist for a private event
 * POST /api/events/:eventId/join-waitlist
 * Headers: Authorization: Bearer <token>
 * 
 * Only works for private events. Adds user to waitlist for organiser approval.
 */
router.post('/:eventId/join-waitlist', protect, eventRequestController.joinWaitlist);

/**
 * Request to join a private event (deprecated - use join-waitlist instead)
 * POST /api/events/:eventId/request-join
 * Headers: Authorization: Bearer <token>
 * 
 * Only works for private events. Sends a join request to the event organiser.
 * @deprecated Use /api/events/:eventId/join-waitlist instead
 */
router.post('/:eventId/request-join', protect, eventRequestController.joinWaitlist);

/**
 * Leave an event
 * DELETE /api/events/:eventId/join
 * Headers: Authorization: Bearer <token>
 */
router.delete('/:eventId/join', protect, eventJoinController.leaveEvent);

/**
 * JOIN REQUEST (private or eventApprovalRequired events – one API for players)
 * Player creates join request; organiser receives notification on same flow.
 */

/**
 * Create join request (player) – private or approval-required events
 * POST /api/events/:eventId/join-request
 * Headers: Authorization: Bearer <token>
 *
 * Sends join request to organiser. Organiser gets notification. Same API as /api/private-events/:eventId/join-request.
 */
router.post('/:eventId/join-request', protect, joinPrivateEventController.joinPrivateEventRequest);

/**
 * Get join requests for event (Organiser only)
 * GET /api/events/:eventId/join-requests?page=1
 */
router.get('/:eventId/join-requests', protect, organiserOnly, getJoinRequestsController.getEventJoinRequests);

/**
 * Get pending join requests only (Organiser only)
 * GET /api/events/:eventId/pending-requests?page=1
 */
router.get('/:eventId/pending-requests', protect, organiserOnly, getJoinRequestsController.getEventPendingRequests);

/**
 * Accept join request (Organiser only)
 * POST /api/events/:eventId/join-requests/:requestId/accept
 * POST /api/events/:eventId/join-requests/user/:userId/accept
 */
router.post('/:eventId/join-requests/user/:userId/accept', protect, organiserOnly, acceptRejectRequestController.acceptJoinRequest);
router.post('/:eventId/join-requests/:requestId/accept', protect, organiserOnly, acceptRejectRequestController.acceptJoinRequest);

/**
 * Reject / remove join request (Organiser only)
 * POST /api/events/:eventId/join-requests/:requestId/reject
 * POST /api/events/:eventId/join-requests/user/:userId/reject
 */
router.post('/:eventId/join-requests/user/:userId/reject', protect, organiserOnly, acceptRejectRequestController.rejectJoinRequest);
router.post('/:eventId/join-requests/:requestId/reject', protect, organiserOnly, acceptRejectRequestController.rejectJoinRequest);

/**
 * Get event participants
 * GET /api/events/:eventId/participants?page=1
 * 
 * Public events: Anyone can view
 * Private events: Only creator can view (requires authentication)
 * Uses page-based pagination: 20 items per page
 * Query parameter: page (default: 1)
 */
router.get('/:eventId/participants', optionalAuth, eventJoinController.getParticipants);

/**
 * Remove participant from event (Creator only)
 * DELETE /api/events/:eventId/participants/:userId
 * Headers: Authorization: Bearer <token>
 */
router.delete('/:eventId/participants/:userId', protect, organiserOnly, eventJoinController.removeParticipant);

/**
 * Check join status
 * GET /api/events/:eventId/join-status
 * Headers: Authorization: Bearer <token>
 * 
 * Response:
 * {
 *   "hasJoined": true/false,
 *   "inWaitlist": true/false,
 *   "visibility": "public" | "private"
 * }
 */
router.get('/:eventId/join-status', protect, eventJoinController.getJoinStatus);

/**
 * WAITLIST ROUTES (Private Events)
 */

/**
 * Get waitlist for private event (Creator only)
 * GET /api/events/:eventId/waitlist?page=1
 * Headers: Authorization: Bearer <token>
 * 
 * Uses page-based pagination: 20 items per page
 * Query parameter: page (default: 1)
 */
router.get('/:eventId/waitlist', protect, organiserOnly, waitlistController.getEventWaitlist);

/**
 * Accept user from waitlist
 * POST /api/events/:eventId/waitlist/:waitlistId/accept
 * Headers: Authorization: Bearer <token>
 */
router.post('/:eventId/waitlist/:waitlistId/accept', protect, organiserOnly, waitlistController.acceptFromWaitlist);
router.post('/:eventId/notify-attendees', protect, eventJoinController.notifyAttendees);
/**
 * Reject user from waitlist
 * POST /api/events/:eventId/waitlist/:waitlistId/reject
 * Headers: Authorization: Bearer <token>
 */
router.post('/:eventId/waitlist/:waitlistId/reject', protect, organiserOnly, waitlistController.rejectFromWaitlist);

module.exports = router;

