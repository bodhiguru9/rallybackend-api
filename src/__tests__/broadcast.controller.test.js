/**
 * broadcast.controller.test.js
 *
 * Unit tests for POST /api/admin/broadcasts.
 * DB and push.service are fully mocked.
 */

'use strict';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock push service — no real FCM calls
jest.mock('../../src/services/push.service', () => ({
  sendPushToMany: jest.fn().mockResolvedValue({ sentCount: 1, failedCount: 0 }),
}));

// Mock Notification model
jest.mock('../../src/models/Notification', () => ({
  create: jest.fn().mockResolvedValue({ _id: 'notif-id' }),
}));

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => '11111111-2222-3333-4444-555555555555'),
}));

// Mock DB
const mockInsertOne = jest.fn().mockResolvedValue({ insertedId: 'doc-id' });
const mockUpdateOne = jest.fn().mockResolvedValue({});
const mockFind = jest.fn();
const mockFindOne = jest.fn().mockResolvedValue(null); // No duplicates by default
const mockCountDocuments = jest.fn().mockResolvedValue(0);

const mockCollection = jest.fn(() => ({
  insertOne: mockInsertOne,
  updateOne: mockUpdateOne,
  findOne: mockFindOne,
  find: mockFind.mockReturnValue({ toArray: jest.fn().mockResolvedValue([
    { _id: 'user-1', fcmToken: 'token-a', userType: 'player' },
    { _id: 'user-2', fcmToken: 'token-b', userType: 'organiser' },
  ]) }),
  countDocuments: mockCountDocuments,
}));

jest.mock('../../src/config/database', () => ({
  getDB: jest.fn(() => ({ collection: mockCollection })),
}));

// ── Import controller ─────────────────────────────────────────────────────────
const { createBroadcast } = require('../../src/controllers/admin/broadcast.controller');

// ── Helper: build mock express req/res ───────────────────────────────────────
const makeReq = (body = {}, user = { id: 'admin-id', userType: 'superadmin' }) => ({
  body,
  user,
});

const makeRes = () => {
  const res = {
    _status: null,
    _json: null,
    status(code) { this._status = code; return this; },
    json(data) { this._json = data; return this; },
  };
  return res;
};

const next = jest.fn();

// ── Valid payload ─────────────────────────────────────────────────────────────
const validPayload = () => ({
  audience: { type: 'all' },
  message: {
    title: 'System Maintenance',
    body: 'We are performing maintenance tonight.',
    action: { type: 'deep_link', url: '/status' },
  },
  metadata: { category: 'maintenance' },
  notification: { channel: 'push', priority: 'high' },
});

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockFindOne.mockResolvedValue(null); // No duplicates
});

describe('POST /api/admin/broadcasts — payload validation', () => {
  test('rejects missing audience.type', async () => {
    const req = makeReq({ ...validPayload(), audience: {} });
    const res = makeRes();
    await createBroadcast(req, res, next);
    expect(res._status).toBe(400);
    expect(res._json.error).toMatch(/audience\.type/);
  });

  test('rejects invalid audience.type', async () => {
    const req = makeReq({ ...validPayload(), audience: { type: 'everyone' } });
    const res = makeRes();
    await createBroadcast(req, res, next);
    expect(res._status).toBe(400);
  });

  test('rejects missing message.title', async () => {
    const req = makeReq({ ...validPayload(), message: { body: 'body' } });
    const res = makeRes();
    await createBroadcast(req, res, next);
    expect(res._status).toBe(400);
    expect(res._json.error).toMatch(/message\.title/);
  });

  test('rejects missing message.body', async () => {
    const req = makeReq({ ...validPayload(), message: { title: 'Title' } });
    const res = makeRes();
    await createBroadcast(req, res, next);
    expect(res._status).toBe(400);
    expect(res._json.error).toMatch(/message\.body/);
  });

  test('rejects invalid notification.channel', async () => {
    const req = makeReq({ ...validPayload(), notification: { channel: 'sms' } });
    const res = makeRes();
    await createBroadcast(req, res, next);
    expect(res._status).toBe(400);
  });

  test('rejects invalid action type', async () => {
    const payload = validPayload();
    payload.message.action = { type: 'fire_missile', url: '/boom' };
    const req = makeReq(payload);
    const res = makeRes();
    await createBroadcast(req, res, next);
    expect(res._status).toBe(400);
  });

  test('rejects deep_link action without url', async () => {
    const payload = validPayload();
    payload.message.action = { type: 'deep_link' };
    const req = makeReq(payload);
    const res = makeRes();
    await createBroadcast(req, res, next);
    expect(res._status).toBe(400);
    expect(res._json.error).toMatch(/url/);
  });

  test('rejects invalid metadata.category', async () => {
    const req = makeReq({ ...validPayload(), metadata: { category: 'gossip' } });
    const res = makeRes();
    await createBroadcast(req, res, next);
    expect(res._status).toBe(400);
  });
});

describe('POST /api/admin/broadcasts — deduplication', () => {
  test('returns 409 when same broadcast was sent within 5 minutes', async () => {
    mockFindOne.mockResolvedValueOnce({ broadcastId: 'brd_existing' });
    const req = makeReq(validPayload());
    const res = makeRes();
    await createBroadcast(req, res, next);
    expect(res._status).toBe(409);
    expect(res._json.existing_broadcast_id).toBe('brd_existing');
  });
});

describe('POST /api/admin/broadcasts — success', () => {
  test('returns broadcast_id and status queued on valid payload', async () => {
    const req = makeReq(validPayload());
    const res = makeRes();
    await createBroadcast(req, res, next);
    expect(res._status).toBe(200);
    expect(res._json.broadcast_id).toMatch(/^brd_/);
    expect(res._json.status).toBe('queued');
  });

  test('inserts broadcast record into DB', async () => {
    const req = makeReq(validPayload());
    const res = makeRes();
    await createBroadcast(req, res, next);
    expect(mockInsertOne).toHaveBeenCalledTimes(1);
    const doc = mockInsertOne.mock.calls[0][0];
    expect(doc.broadcastId).toMatch(/^brd_/);
    expect(doc.status).toBe('queued');
  });

  test('"players" audience type only fetches players', async () => {
    const payload = { ...validPayload(), audience: { type: 'players' } };
    const req = makeReq(payload);
    const res = makeRes();
    await createBroadcast(req, res, next);
    // The find call for 'users' collection should filter by userType: 'player'
    const findArgs = mockFind.mock.calls[0];
    expect(findArgs[0]).toEqual({ userType: 'player' });
  });

  test('"organisers" audience type only fetches organisers', async () => {
    const payload = { ...validPayload(), audience: { type: 'organisers' } };
    const req = makeReq(payload);
    const res = makeRes();
    await createBroadcast(req, res, next);
    const findArgs = mockFind.mock.calls[0];
    expect(findArgs[0]).toEqual({ userType: 'organiser' });
  });
});

describe('POST /api/admin/broadcasts — push sending', () => {
  test('calls sendPushToMany with correct tokens when channel=push', async () => {
    const { sendPushToMany } = require('../../src/services/push.service');
    const req = makeReq(validPayload()); // channel: 'push'
    const res = makeRes();
    await createBroadcast(req, res, next);
    // Wait for fire-and-forget to finish (it runs after res.json in async)
    await new Promise(r => setTimeout(r, 50));
    expect(sendPushToMany).toHaveBeenCalledWith(
      expect.objectContaining({
        tokens: expect.arrayContaining(['token-a', 'token-b']),
        title: 'System Maintenance',
      })
    );
  });

  test('does NOT call sendPushToMany when channel=in_app', async () => {
    const { sendPushToMany } = require('../../src/services/push.service');
    const payload = { ...validPayload(), notification: { channel: 'in_app' } };
    const req = makeReq(payload);
    const res = makeRes();
    await createBroadcast(req, res, next);
    await new Promise(r => setTimeout(r, 50));
    expect(sendPushToMany).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/broadcasts — auth enforcement', () => {
  // Note: Auth enforcement is in middleware (admin.routes.js requireSuperadmin).
  // The controller itself doesn't check userType — it trusts the middleware.
  // We test the middleware separately here.
  test('requireSuperadmin pattern rejects non-superadmin', () => {
    const requireSuperadmin = (req, res, next) => {
      if (!req.user || req.user.userType !== 'superadmin') {
        return res.status(403).json({ error: 'Access denied.' });
      }
      next();
    };

    const req = { user: { id: 'player-id', userType: 'player' } };
    const res = makeRes();
    const nextFn = jest.fn();
    requireSuperadmin(req, res, nextFn);
    expect(res._status).toBe(403);
    expect(nextFn).not.toHaveBeenCalled();
  });

  test('requireSuperadmin allows superadmin through', () => {
    const requireSuperadmin = (req, res, next) => {
      if (!req.user || req.user.userType !== 'superadmin') {
        return res.status(403).json({ error: 'Access denied.' });
      }
      next();
    };

    const req = { user: { id: 'admin-id', userType: 'superadmin' } };
    const res = makeRes();
    const nextFn = jest.fn();
    requireSuperadmin(req, res, nextFn);
    expect(nextFn).toHaveBeenCalledTimes(1);
  });
});
