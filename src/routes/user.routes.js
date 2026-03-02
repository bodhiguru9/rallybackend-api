const express = require('express');
const router = express.Router();
const { protect, optionalAuth } = require('../middleware/auth');
const organiserOnly = require('../middleware/organiserOnly');
const getAllUsersController = require('../controllers/user/getAllUsers.controller');
const getUserController = require('../controllers/user/getUser.controller');
const updateUserController = require('../controllers/user/updateUser.controller');
const deleteUserController = require('../controllers/user/deleteUser.controller');
const playerProfileController = require('../controllers/user/playerProfile.controller');
const getAllOrganisersController = require('../controllers/user/getAllOrganisers.controller');
const getTopOrganisersController = require('../controllers/user/getTopOrganisers.controller');
const getCommunityDetailsController = require('../controllers/user/getCommunityDetails.controller');
const getCommunityStatusController = require('../controllers/user/getCommunityStatus.controller');
const getOrganiserEventsController = require('../controllers/user/getOrganiserEvents.controller');
const getUserJoinedEventsController = require('../controllers/user/getUserJoinedEvents.controller');

/**
 * GET ALL USERS LIST
 * GET /api/users?page=1&userType=player
 * Authorization: Bearer <token> (optional)
 * 
 * Returns list of all users (both players and organisers) with pagination
 * Uses page-based pagination: 20 items per page
 * 
 * Query Parameters (all optional):
 * - page: Page number (default: 1)
 * - userType: Filter by user type - 'player' or 'organiser' (default: all users)
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "users": [
 *       {
 *         "userId": 1,
 *         "userType": "player",
 *         "fullName": "John Doe",
 *         "email": "john@example.com",
 *         "sport1": "Football",
 *         "sport2": "Basketball",
 *         ...
 *       },
 *       ...
 *     ],
 *     "pagination": {
 *       "totalCount": 100,
 *       "totalPages": 5,
 *       "currentPage": 1,
 *       "perPage": 20,
 *       "hasNextPage": true,
 *       "hasPrevPage": false
 *     },
 *     "filter": {
 *       "userType": "player"
 *     }
 *   }
 * }
 * 
 * NOTE: This route must come before /:id to prevent conflicts
 */
router.get('/', optionalAuth, getAllUsersController.getAllUsers);

/**
 * GET PLAYER PROFILE DATA
 * GET /api/users/player/profile
 * Authorization: Bearer <token> (required)
 * 
 * Returns following organizers, favorite events, joined events, and private event requests for the signed-in player:
 * - Following count (number of organizers they follow)
 * - List of organizers they follow (with profile picture, full name, email)
 * - Favorite events count (how many events they've added to their list)
 * - List of event IDs they've added to favorites
 * - Joined events count (how many events they've joined)
 * - List of joined events (event names and IDs)
 * - Private event requests count (how many private events they've requested to join)
 * - List of private event requests (event names and IDs)
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Player profile data retrieved successfully",
 *   "data": {
 *     "followingCount": 3,
 *     "followingOrganizers": [
 *       {
 *         "userId": 10,
 *         "mongoId": "507f1f77bcf86cd799439012",
 *         "fullName": "Sports Club",
 *         "email": "club@example.com",
 *         "profilePic": "https://...",
 *         "communityName": "City Sports",
 *         "yourCity": "New York",
 *         "profileVisibility": "public"
 *       }
 *     ],
 *     "favoriteEventsCount": 5,
 *     "favoriteEventIds": ["E1", "E2", "E3", "E4", "E5"],
 *     "joinedEventsCount": 3,
 *     "joinedEvents": [
 *       {
 *         "eventId": "E1",
 *         "eventName": "Football Match"
 *       },
 *       {
 *         "eventId": "E2",
 *         "eventName": "Basketball Tournament"
 *       }
 *     ],
 *     "privateEventRequestsCount": 2,
 *     "privateEventRequests": [
 *       {
 *         "eventId": "E10",
 *         "eventName": "Private Tennis Event"
 *       }
 *     ]
 *   }
 * }
 * 
 * NOTE: This route must come before /:id to prevent conflicts
 */
router.get('/player/profile', protect, playerProfileController.getPlayerProfile);

/**
 * GET ALL ORGANISERS LIST
 * GET /api/users/organisers/all?page=1
 * Authorization: Bearer <token> (optional - for following status)
 * 
 * Returns list of all organisers with following status:
 * - If user is logged in:
 *   - First: organisers they follow (including private ones they follow)
 *   - Then: public organisers they don't follow
 * - If user is not logged in:
 *   - Only public organisers
 * 
 * Uses page-based pagination: 20 items per page
 * Query parameter: page (default: 1)
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Organisers retrieved successfully",
 *   "data": {
 *     "organisers": [
 *       {
 *         "userId": 5,
 *         "userType": "organiser",
 *         "fullName": "Sports Club",
 *         "email": "club@example.com",
 *         "profilePic": "https://...",
 *         "communityName": "City Sports",
 *         "yourCity": "New York",
 *         "profileVisibility": "public",
 *         "followersCount": 10,
 *         "isFollowing": true,
 *         "canFollow": true,
 *         ...
 *       }
 *     ],
 *     "pagination": {
 *       "totalCount": 50,
 *       "totalPages": 3,
 *       "currentPage": 1,
 *       "perPage": 20,
 *       "hasNextPage": true,
 *       "hasPrevPage": false
 *     },
 *     "summary": {
 *       "totalOrganisers": 50,
 *       "followingCount": 5,
 *       "notFollowingCount": 45
 *     }
 *   }
 * }
 * 
 * NOTE: This route must come before /:id to prevent conflicts
 */
router.get('/organisers/all', optionalAuth, getAllOrganisersController.getAllOrganisers);

/**
 * GET TOP ORGANISERS
 * GET /api/users/organisers/top?page=1
 * Authorization: None (Public)
 * 
 * Returns list of organisers sorted by:
 * 1. Most followers (descending)
 * 2. Most total attendees across all events (descending)
 * 3. Most events created (descending)
 * 
 * Response includes only:
 * - userId
 * - profilePic
 * - fullName
 * - isVerified (true if email or mobile is verified)
 * 
 * Uses page-based pagination: 20 items per page
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Top organisers retrieved successfully",
 *   "data": {
 *     "organisers": [
 *       {
 *         "userId": 5,
 *         "profilePic": "https://...",
 *         "fullName": "Sports Club",
 *         "isVerified": true
 *       }
 *     ],
 *     "pagination": {
 *       "totalCount": 50,
 *       "totalPages": 3,
 *       "currentPage": 1,
 *       "perPage": 20
 *     }
 *   }
 * }
 * 
 * NOTE: This route must come before /:id to prevent conflicts
 */
router.get('/organisers/top', getTopOrganisersController.getTopOrganisers);

/**
 * GET ALL COMMUNITIES LIST
 * GET /api/users/community?page=1
 * Authorization: None (Public)
 * 
 * Returns list of all communities (organisers with communityName):
 * - userId
 * - profilePic
 * - fullName
 * - communityName
 * 
 * Uses page-based pagination: 20 items per page
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "All communities retrieved successfully",
 *   "data": {
 *     "communities": [
 *       {
 *         "userId": 5,
 *         "profilePic": "https://...",
 *         "fullName": "Sports Club",
 *         "communityName": "City Sports Community"
 *       }
 *     ],
 *     "pagination": {
 *       "totalCount": 50,
 *       "totalPages": 3,
 *       "currentPage": 1,
 *       "perPage": 20
 *     }
 *   }
 * }
 * 
 * NOTE: This route must come before /community/:communityName to avoid conflicts
 */
router.get('/community', getCommunityDetailsController.getAllCommunities);

/**
 * GET COMMUNITY STATUS FOR LOGGED-IN USER
 * GET /api/users/community/:communityName/status
 * Authorization: Bearer <token>
 */
router.get('/community/:communityName/status', protect, getCommunityStatusController.getCommunityStatus);

/**
 * GET ORGANISER EVENTS WITH PARTICIPANTS
 * GET /api/users/organiser/:userId/events?page=1&perPage=20
 * Authorization: Optional (Bearer <token>)
 * 
 * userId is the sequential userId (not MongoDB ObjectId). Use "me" for the
 * logged-in organiser.
 */

router.get('/organiser/:userId/events', optionalAuth, getOrganiserEventsController.getOrganiserEventsWithParticipants);

/**
 * GET COMMUNITY DETAILS
 * GET /api/users/community/:communityName?page=1
 * Authorization: None (Public)
 * 
 * Returns organiser community details with all their events:
 * - Organiser details: userId, profilePic, fullName, communityName
 * - All events created by that organiser
 * - Full event details including spots information
 * 
 * Uses page-based pagination: 20 items per page
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Community details retrieved successfully",
 *   "data": {
 *     "organiser": {
 *       "userId": 5,
 *       "profilePic": "https://...",
 *       "fullName": "Sports Club",
 *       "communityName": "City Sports Community"
 *     },
 *     "events": [
 *       {
 *         "eventId": "E1",
 *         "eventName": "Cricket Championship",
 *         "eventDateTime": "2024-12-25T10:00:00Z",
 *         "spotsInfo": {
 *           "totalSpots": 50,
 *           "spotsBooked": 30,
 *           "spotsLeft": 20,
 *           "spotsFull": false
 *         },
 *         ...
 *       }
 *     ],
 *     "pagination": {
 *       "totalCount": 10,
 *       "totalPages": 1,
 *       "currentPage": 1,
 *       "perPage": 20
 *     },
 *     "summary": {
 *       "totalEvents": 10
 *     }
 *   }
 * }
 * 
 * NOTE: This route must come before /:id to prevent conflicts
 */
router.get('/community/:communityName', getCommunityDetailsController.getCommunityDetails);

/**
 * GET USER JOINED EVENTS (PUBLIC)
 * GET /api/users/:userId/joined-events?page=1&perPage=20
 * Authorization: None (Public)
 *
 * userId is the sequential userId (not MongoDB ObjectId)
 *
 * NOTE: This route must come before /:id to prevent conflicts
 */
router.get('/:userId/joined-events', getUserJoinedEventsController.getUserJoinedEvents);

/**
 * GET PLAYER JOINED EVENTS (PUBLIC)
 * GET /api/users/player/:userId/events?page=1&perPage=20
 * Authorization: None (Public)
 *
 * userId is the sequential userId (not MongoDB ObjectId)
 *
 * NOTE: This route must come before /:id to prevent conflicts
 */
router.get('/player/:userId/events', getUserJoinedEventsController.getUserJoinedEvents);

/**
 * GET USER PROFILE
 * GET /api/users/:id
 * Authorization: Bearer <token> (optional - for follow status)
 * 
 * Supports both sequential userId (1, 2, 3, etc.) and MongoDB ObjectId.
 * For organisers, shows:
 * - followersCount: Number of followers
 * - isFollowing: Whether authenticated user is following (if logged in)
 * - canFollow: Whether organiser can be followed (if public)
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "user": {
 *       "userId": 5,
 *       "userType": "organiser",
 *       "fullName": "John Doe",
 *       "followersCount": 10,
 *       "isFollowing": true,
 *       "canFollow": true,
 *       ...
 *     }
 *   }
 * }
 */
router.get('/:id', optionalAuth, getUserController.getUser);

/**
 * UPDATE USER PROFILE
 * PUT /api/users/:id
 * Content-Type: multipart/form-data (for profile picture) or application/json
 * Authorization: Bearer <token>
 * 
 * Supports both sequential userId (1, 2, 3, etc.) and MongoDB ObjectId.
 * Users can only update their own account.
 * All fields are optional - user can update any subset of their profile.
 * 
 * For Player:
 * - profile_pic: [file] (optional)
 * - email: "player@example.com" (optional)
 * - mobile_number: "+1234567890" (optional)
 * - full_name: "John Doe" (optional)
 * - dob: "1990-01-01" (optional, format: YYYY-MM-DD)
 * - gender: "male" | "female" | "other" | "prefer not to say" (optional)
 * - sport_1: "Football" (optional)
 * - sport_2: "Basketball" (optional)
 * - password: "1234" (optional, can be any password)
 * 
 * For Organiser:
 * - profile_pic: [file] (optional)
 * - email: "organiser@example.com" (optional)
 * - mobile_number: "+1234567890" (optional)
 * - full_name: "John Doe" (optional)
 * - your_best: "organiser" | "coach" | "club" (optional)
 * - community_name: "Sports Club" (optional)
 * - your_city: "New York" (optional)
 * - sport_1: "Football" (optional)
 * - sport_2: "Basketball" (optional)
 * - bio: "Experienced coach..." (optional, min 10 chars if provided)
 * - instagram_link: "https://instagram.com/username" (optional)
 * - profileVisibility: "public" | "private" (optional)
 * - password: "1234" (optional, can be any password)
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "User profile updated successfully",
 *   "data": {
 *     "user": { ... }
 *   }
 * }
 */
router.put('/:id', protect, updateUserController.updateUser);

/**
 * DELETE USER ACCOUNT
 * DELETE /api/users/:id
 * Authorization: Bearer <token>
 * 
 * Supports both sequential userId (1, 2, 3, etc.) and MongoDB ObjectId.
 * Users can only delete their own account. This will:
 * - Delete user's profile picture
 * - Remove all follow relationships (as follower and following)
 * - Remove user from all event joins
 * - Remove all user's requests
 * - Remove user from all waitlists
 * - Delete all events created by the user (if organiser)
 * - Delete the user account
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "User account deleted successfully",
 *   "data": {
 *     "userId": 5,
 *     "deletedAt": "2024-01-01T00:00:00.000Z"
 *   }
 * }
 */
router.delete('/:id', protect, deleteUserController.deleteUser);

module.exports = router;

