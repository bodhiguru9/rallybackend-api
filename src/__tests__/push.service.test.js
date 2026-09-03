/**
 * push.service.test.js
 *
 * Unit tests for the FCM push notification service.
 * Firebase Admin SDK is fully mocked — no real network calls.
 */

'use strict';

// ── Mock firebase-admin before requiring the service ─────────────────────────
const mockSend = jest.fn();
const mockSendEach = jest.fn();

jest.mock('firebase-admin/app', () => ({
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(),
  cert: jest.fn(() => ({})),
}));

jest.mock('firebase-admin/messaging', () => ({
  getMessaging: jest.fn(() => ({
    send: mockSend,
    sendEach: mockSendEach,
  })),
}));

// ── Now import the service ────────────────────────────────────────────────────
const { initializePushService, sendPushNotification, sendPushToMany } = require('../../src/services/push.service');

// ── Helper: set env vars and re-initialize ────────────────────────────────────
const setCredentials = () => {
  process.env.FIREBASE_PROJECT_ID = 'test-project';
  process.env.FIREBASE_CLIENT_EMAIL = 'test@test.iam.gserviceaccount.com';
  process.env.FIREBASE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nFAKE\n-----END PRIVATE KEY-----\n';
};

const clearCredentials = () => {
  delete process.env.FIREBASE_PROJECT_ID;
  delete process.env.FIREBASE_CLIENT_EMAIL;
  delete process.env.FIREBASE_PRIVATE_KEY;
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('push.service — initializePushService', () => {
  afterEach(() => {
    clearCredentials();
    jest.clearAllMocks();
  });

  test('gracefully no-ops when credentials are missing', () => {
    clearCredentials();
    // Should not throw
    expect(() => initializePushService()).not.toThrow();
  });

  test('initializes Firebase when credentials are present', () => {
    setCredentials();
    const { initializeApp, getApps } = require('firebase-admin/app');
    const { getMessaging } = require('firebase-admin/messaging');
    initializePushService();
    expect(initializeApp).toHaveBeenCalledTimes(1);
    expect(getMessaging).toHaveBeenCalledTimes(1);
  });
});

describe('push.service — sendPushNotification', () => {
  beforeEach(() => {
    setCredentials();
    jest.clearAllMocks();
    initializePushService();
  });

  afterEach(clearCredentials);

  test('sends a message with correct title/body/data', async () => {
    mockSend.mockResolvedValueOnce('projects/test-project/messages/msg-001');

    const result = await sendPushNotification({
      token: 'device-token-abc',
      title: 'Session Cancelled',
      body: '"Tennis Tuesday" has been cancelled.',
      data: { type: 'event_cancelled', eventId: 'abc123' },
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('projects/test-project/messages/msg-001');

    const sentMessage = mockSend.mock.calls[0][0];
    expect(sentMessage.token).toBe('device-token-abc');
    expect(sentMessage.notification.title).toBe('Session Cancelled');
    expect(sentMessage.data.type).toBe('event_cancelled');
    expect(sentMessage.data.eventId).toBe('abc123');
  });

  test('all data values are coerced to strings', async () => {
    mockSend.mockResolvedValueOnce('msg-002');
    await sendPushNotification({
      token: 'token-xyz',
      title: 'Test',
      body: 'Body',
      data: { count: 5, flag: true, id: null },
    });

    const sentData = mockSend.mock.calls[0][0].data;
    // null values are omitted; others are stringified
    expect(sentData.count).toBe('5');
    expect(sentData.flag).toBe('true');
    expect(sentData.id).toBeUndefined();
  });

  test('returns skipped when token is empty', async () => {
    const result = await sendPushNotification({ token: '', title: 'T', body: 'B' });
    expect(result.success).toBe(false);
    expect(result.skipped).toBe(true);
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('returns skipped when token is null', async () => {
    const result = await sendPushNotification({ token: null, title: 'T', body: 'B' });
    expect(result.success).toBe(false);
    expect(result.skipped).toBe(true);
  });

  test('does not throw on FCM error, returns failure object', async () => {
    const fcmError = new Error('messaging/invalid-registration-token');
    fcmError.code = 'messaging/invalid-registration-token';
    mockSend.mockRejectedValueOnce(fcmError);

    const result = await sendPushNotification({ token: 'bad-token', title: 'T', body: 'B' });
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe('push.service — sendPushToMany', () => {
  beforeEach(() => {
    setCredentials();
    jest.clearAllMocks();
    initializePushService();
  });

  afterEach(clearCredentials);

  test('sends to all valid tokens', async () => {
    mockSendEach.mockResolvedValueOnce({
      successCount: 2,
      failureCount: 0,
      responses: [{ success: true }, { success: true }],
    });

    const result = await sendPushToMany({
      tokens: ['token-a', 'token-b'],
      title: 'New Booking!',
      body: 'Someone booked your event.',
    });

    expect(result.sentCount).toBe(2);
    expect(result.failedCount).toBe(0);
  });

  test('filters out empty/null tokens', async () => {
    mockSendEach.mockResolvedValueOnce({
      successCount: 1,
      failureCount: 0,
      responses: [{ success: true }],
    });

    await sendPushToMany({
      tokens: ['valid-token', null, '', '   '],
      title: 'T',
      body: 'B',
    });

    // Only 1 message should be in the batch
    expect(mockSendEach.mock.calls[0][0]).toHaveLength(1);
  });

  test('returns skipped when no valid tokens', async () => {
    const result = await sendPushToMany({ tokens: [null, ''], title: 'T', body: 'B' });
    expect(result.skipped).toBe(true);
    expect(result.sentCount).toBe(0);
    expect(mockSendEach).not.toHaveBeenCalled();
  });

  test('returns skipped when service not initialized', async () => {
    clearCredentials();
    initializePushService(); // reinit without creds → sets initialized=false
    const result = await sendPushToMany({ tokens: ['token'], title: 'T', body: 'B' });
    expect(result.skipped).toBe(true);
  });
});
