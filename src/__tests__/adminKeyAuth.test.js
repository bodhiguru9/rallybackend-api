/**
 * adminKeyAuth.test.js
 *
 * Unit tests for the admin panel's shared-key auth middleware.
 * DB is mocked — we only assert on rejection/acceptance behavior and on
 * what gets written to adminAuditLog for rejected requests.
 */

'use strict';

const mockInsertOne = jest.fn().mockResolvedValue({ insertedId: 'log-id' });
const mockCollection = jest.fn(() => ({ insertOne: mockInsertOne }));

jest.mock('../../src/config/database', () => ({
  getDB: jest.fn(() => ({ collection: mockCollection })),
}));

const adminKeyAuth = require('../../src/middleware/adminKeyAuth');

const makeReq = (headers = {}) => ({
  headers,
  method: 'GET',
  originalUrl: '/api/admin/bookings/booking1',
  ip: '127.0.0.1',
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

const ORIGINAL_KEY = process.env.ADMIN_API_KEY;

afterEach(() => {
  process.env.ADMIN_API_KEY = ORIGINAL_KEY;
  jest.clearAllMocks();
});

test('rejects with 500 and logs when ADMIN_API_KEY is not configured', async () => {
  delete process.env.ADMIN_API_KEY;
  const req = makeReq({ 'x-admin-key': 'anything', 'x-admin-email': 'a@b.com' });
  const res = makeRes();
  const next = jest.fn();

  await adminKeyAuth(req, res, next);

  expect(res._status).toBe(500);
  expect(next).not.toHaveBeenCalled();
  expect(mockInsertOne).toHaveBeenCalledWith(expect.objectContaining({ authFailure: true }));
});

test('rejects with 401 when X-Admin-Key header is missing', async () => {
  process.env.ADMIN_API_KEY = 'correct-key';
  const req = makeReq({ 'x-admin-email': 'a@b.com' });
  const res = makeRes();
  const next = jest.fn();

  await adminKeyAuth(req, res, next);

  expect(res._status).toBe(401);
  expect(next).not.toHaveBeenCalled();
  expect(mockInsertOne).toHaveBeenCalledWith(expect.objectContaining({ authFailure: true, status: 401 }));
});

test('rejects with 401 when X-Admin-Email header is missing', async () => {
  process.env.ADMIN_API_KEY = 'correct-key';
  const req = makeReq({ 'x-admin-key': 'correct-key' });
  const res = makeRes();
  const next = jest.fn();

  await adminKeyAuth(req, res, next);

  expect(res._status).toBe(401);
  expect(next).not.toHaveBeenCalled();
});

test('rejects with 403 on key mismatch, including different-length keys', async () => {
  process.env.ADMIN_API_KEY = 'correct-key';
  const req = makeReq({ 'x-admin-key': 'short', 'x-admin-email': 'a@b.com' });
  const res = makeRes();
  const next = jest.fn();

  await adminKeyAuth(req, res, next);

  expect(res._status).toBe(403);
  expect(next).not.toHaveBeenCalled();
  expect(mockInsertOne).toHaveBeenCalledWith(expect.objectContaining({ authFailure: true, status: 403 }));
});

test('calls next and sets req.admin.email on a correct key', async () => {
  process.env.ADMIN_API_KEY = 'correct-key';
  const req = makeReq({ 'x-admin-key': 'correct-key', 'x-admin-email': 'someone@rallysports.ae' });
  const res = makeRes();
  const next = jest.fn();

  await adminKeyAuth(req, res, next);

  expect(next).toHaveBeenCalledTimes(1);
  expect(req.admin).toEqual({ email: 'someone@rallysports.ae' });
  expect(mockInsertOne).not.toHaveBeenCalled();
});
