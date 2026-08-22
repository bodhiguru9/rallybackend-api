/**
 * updatePushToken.controller.test.js
 *
 * Unit tests for PATCH /api/users/me/push-token
 */

'use strict';

// Mock User model
const mockUpdateById = jest.fn().mockResolvedValue(true);
jest.mock('../../src/models/User', () => ({
  updateById: mockUpdateById,
}));

const { updatePushToken } = require('../../src/controllers/user/updatePushToken.controller');

const makeReq = (body, userId = 'user-mongo-id') => ({
  body,
  user: { id: userId },
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

beforeEach(() => jest.clearAllMocks());

describe('updatePushToken controller', () => {
  test('saves valid fcmToken to user document', async () => {
    const req = makeReq({ fcmToken: 'ExponentPushToken[abc123]' });
    const res = makeRes();
    await updatePushToken(req, res, next);
    expect(mockUpdateById).toHaveBeenCalledWith('user-mongo-id', { fcmToken: 'ExponentPushToken[abc123]' });
    expect(res._status).toBe(200);
    expect(res._json.success).toBe(true);
    expect(res._json.message).toMatch(/registered/i);
  });

  test('clears token when fcmToken is null', async () => {
    const req = makeReq({ fcmToken: null });
    const res = makeRes();
    await updatePushToken(req, res, next);
    expect(mockUpdateById).toHaveBeenCalledWith('user-mongo-id', { fcmToken: null });
    expect(res._status).toBe(200);
    expect(res._json.message).toMatch(/cleared/i);
  });

  test('clears token when fcmToken is empty string', async () => {
    const req = makeReq({ fcmToken: '' });
    const res = makeRes();
    await updatePushToken(req, res, next);
    expect(mockUpdateById).toHaveBeenCalledWith('user-mongo-id', { fcmToken: null });
    expect(res._status).toBe(200);
  });

  test('trims whitespace from token', async () => {
    const req = makeReq({ fcmToken: '  token-with-spaces  ' });
    const res = makeRes();
    await updatePushToken(req, res, next);
    expect(mockUpdateById).toHaveBeenCalledWith('user-mongo-id', { fcmToken: 'token-with-spaces' });
  });

  test('rejects non-string, non-null fcmToken with 400', async () => {
    const req = makeReq({ fcmToken: 12345 });
    const res = makeRes();
    await updatePushToken(req, res, next);
    expect(res._status).toBe(400);
    expect(res._json.error).toMatch(/string/i);
    expect(mockUpdateById).not.toHaveBeenCalled();
  });

  test('rejects boolean fcmToken with 400', async () => {
    const req = makeReq({ fcmToken: true });
    const res = makeRes();
    await updatePushToken(req, res, next);
    expect(res._status).toBe(400);
  });

  test('calls next on DB error', async () => {
    mockUpdateById.mockRejectedValueOnce(new Error('DB down'));
    const req = makeReq({ fcmToken: 'valid-token' });
    const res = makeRes();
    await updatePushToken(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
