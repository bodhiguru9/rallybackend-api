/**
 * playerNotification.enrichment.test.js
 *
 * Unit tests for the organiser image enrichment fix in the player
 * notification controller. Verifies that booking/cancellation notifications
 * always return an `organiser` field with `profilePic`.
 */

'use strict';

const { ObjectId } = require('mongodb');

// ── Shared test data ──────────────────────────────────────────────────────────
const ORGANISER_ID = new ObjectId().toString();
const EVENT_ID     = new ObjectId().toString();
const USER_ID      = new ObjectId().toString();

const mockOrganiser = {
  _id: new ObjectId(ORGANISER_ID),
  userId: 99,
  fullName: 'Test Organiser',
  communityName: 'Test FC',
  profilePic: 'https://cdn.example.com/organiser.jpg',
  email: 'org@test.com',
};

const mockEvent = {
  _id: new ObjectId(EVENT_ID),
  eventId: 'E99',
  eventName: 'Test Event',
  creatorId: new ObjectId(ORGANISER_ID),
};

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock pagination utilities
jest.mock('../../src/utils/pagination', () => ({
  getPaginationParams: jest.fn(() => ({ page: 1, perPage: 20, skip: 0 })),
  createPaginationResponse: jest.fn(() => ({ totalCount: 1, totalPages: 1, currentPage: 1 })),
}));

// Mock Notification model
jest.mock('../../src/models/Notification', () => ({
  getUnreadCount: jest.fn().mockResolvedValue(1),
  getUserNotifications: jest.fn().mockResolvedValue([]),
  markAsRead: jest.fn().mockResolvedValue(true),
  markAllAsRead: jest.fn().mockResolvedValue(5),
}));

// Mock batchLoad — returns organiser map and event map
jest.mock('../../src/utils/batchLoad', () => ({
  getUsersByIds: jest.fn().mockImplementation(async (ids) => {
    const map = new Map();
    if (ids.includes(ORGANISER_ID)) {
      map.set(ORGANISER_ID, mockOrganiser);
    }
    return map;
  }),
  getEventsByAnyId: jest.fn().mockImplementation(async (ids) => {
    const map = new Map();
    if (ids.includes(EVENT_ID)) {
      map.set(EVENT_ID, mockEvent);
    }
    return map;
  }),
}));

// Mock DB
const mockCountDocuments = jest.fn().mockResolvedValue(1);
const mockCollection = jest.fn(() => ({ countDocuments: mockCountDocuments }));
jest.mock('../../src/config/database', () => ({
  getDB: jest.fn(() => ({ collection: mockCollection })),
}));

// ── Controller import ─────────────────────────────────────────────────────────
const { getPlayerNotifications } = require('../../src/controllers/notification/playerNotification.controller');
const Notification = require('../../src/models/Notification');

// ── Helpers ───────────────────────────────────────────────────────────────────
const makeReq = () => ({
  user: { id: USER_ID, userType: 'player' },
  query: { page: '1' },
});

const makeRes = () => {
  const res = { _status: null, _json: null };
  res.status = (code) => { res._status = code; return res; };
  res.json = (data) => { res._json = data; return res; };
  return res;
};

const next = jest.fn();

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('playerNotification controller — organiser image enrichment', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns organiser.profilePic when notification has organiserId in data', async () => {
    Notification.getUserNotifications.mockResolvedValueOnce([{
      _id: new ObjectId(),
      type: 'booking_confirmed',
      title: 'Booking Confirmed',
      message: 'Your booking is confirmed!',
      isRead: false,
      createdAt: new Date(),
      data: { organiserId: ORGANISER_ID, eventId: EVENT_ID },
    }]);

    const req = makeReq();
    const res = makeRes();
    await getPlayerNotifications(req, res, next);

    const notif = res._json.data.notifications[0];
    expect(notif.organiser).toBeDefined();
    expect(notif.organiser.profilePic).toBe('https://cdn.example.com/organiser.jpg');
  });

  test('fallback: returns organiser.profilePic from event.creatorId when organiserId is absent', async () => {
    // booking_confirmed without organiserId in data
    Notification.getUserNotifications.mockResolvedValueOnce([{
      _id: new ObjectId(),
      type: 'booking_confirmed',
      title: 'Booking Confirmed',
      message: 'Your booking is confirmed!',
      isRead: false,
      createdAt: new Date(),
      data: { eventId: EVENT_ID }, // no organiserId
    }]);

    const req = makeReq();
    const res = makeRes();
    await getPlayerNotifications(req, res, next);

    const notif = res._json.data.notifications[0];
    expect(notif.organiser).toBeDefined();
    expect(notif.organiser.profilePic).toBe('https://cdn.example.com/organiser.jpg');
    expect(notif.organiser.fullName).toBe('Test Organiser');
  });

  test('fallback applies to event_cancelled type', async () => {
    Notification.getUserNotifications.mockResolvedValueOnce([{
      _id: new ObjectId(),
      type: 'event_cancelled',
      title: 'Event Cancelled',
      message: '"Test Event" has been cancelled.',
      isRead: false,
      createdAt: new Date(),
      data: { eventId: EVENT_ID },
    }]);

    const req = makeReq();
    const res = makeRes();
    await getPlayerNotifications(req, res, next);

    const notif = res._json.data.notifications[0];
    expect(notif.organiser?.profilePic).toBe('https://cdn.example.com/organiser.jpg');
  });

  test('does NOT apply fallback to unrelated notification types (e.g. event_update)', async () => {
    Notification.getUserNotifications.mockResolvedValueOnce([{
      _id: new ObjectId(),
      type: 'event_update',
      title: 'Event Updated',
      message: 'Your event was updated.',
      isRead: false,
      createdAt: new Date(),
      data: { eventId: EVENT_ID }, // no organiserId, type not in fallback list
    }]);

    const req = makeReq();
    const res = makeRes();
    await getPlayerNotifications(req, res, next);

    const notif = res._json.data.notifications[0];
    // Should NOT have organiser unless there was an organiserId in data
    expect(notif.organiser).toBeUndefined();
  });

  test('is null-safe when organiser has no profilePic', async () => {
    const { getUsersByIds } = require('../../src/utils/batchLoad');
    getUsersByIds.mockImplementationOnce(async () => {
      const map = new Map();
      // organiser exists but no profilePic
      map.set(ORGANISER_ID, { ...mockOrganiser, profilePic: null });
      return map;
    });

    Notification.getUserNotifications.mockResolvedValueOnce([{
      _id: new ObjectId(),
      type: 'booking_confirmed',
      title: 'Booking Confirmed',
      message: 'Your booking is confirmed!',
      isRead: false,
      createdAt: new Date(),
      data: { organiserId: ORGANISER_ID, eventId: EVENT_ID },
    }]);

    const req = makeReq();
    const res = makeRes();
    await getPlayerNotifications(req, res, next);

    const notif = res._json.data.notifications[0];
    expect(notif.organiser).toBeDefined();
    expect(notif.organiser.profilePic).toBeNull();
    // Should not throw
  });
});
