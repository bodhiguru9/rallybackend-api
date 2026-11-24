/**
 * usersList.privacy.test.js
 *
 * Public GET /api/users must not expose private data (email, phone, dob,
 * gender, verification flags, booking spend). GET /api/admin/users returns
 * the full data, but only with a valid X-Admin-Key.
 * DB, Follow and bookingStats are fully mocked.
 */

'use strict';

const request = require('supertest');
const express = require('express');

// ── Mocks ─────────────────────────────────────────────────────────────────────

// uuid ships ESM only; the admin router pulls it in via broadcast.controller.
jest.mock('uuid', () => ({ v4: jest.fn(() => '11111111-2222-3333-4444-555555555555') }));

const mockUsers = [
  {
    _id: { toString: () => 'mongo-player-1' },
    userId: 'U1',
    userType: 'player',
    fullName: 'Pat Player',
    email: 'pat@example.com',
    mobileNumber: '971500000001',
    dob: '1995-01-01',
    gender: 'female',
    isEmailVerified: true,
    isMobileVerified: true,
    sports: ['padel'],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
  },
  {
    _id: { toString: () => 'mongo-org-1' },
    userId: 'U2',
    userType: 'organiser',
    fullName: 'Olly Organiser',
    email: 'olly@example.com',
    mobileNumber: '971500000002',
    communityName: 'Padel Club',
    bio: 'We play padel',
    sports: ['padel'],
    createdAt: new Date('2026-01-03'),
  },
];

const mockFindChain = {
  sort: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  toArray: jest.fn().mockResolvedValue(mockUsers),
};

const mockCollection = jest.fn(() => ({
  countDocuments: jest.fn().mockResolvedValue(mockUsers.length),
  find: jest.fn(() => mockFindChain),
  insertOne: jest.fn().mockResolvedValue({ insertedId: 'audit-id' }),
  updateOne: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../src/config/database', () => ({
  getDB: jest.fn(() => ({ collection: mockCollection })),
}));

jest.mock('../../src/models/Follow', () => ({
  getFollowerCount: jest.fn().mockResolvedValue(7),
}));

const mockGetBookingStats = jest.fn();
jest.mock('../../src/utils/bookingStats', () => ({
  getBookingStatsByUsers: (...args) => mockGetBookingStats(...args),
}));

// ── App ───────────────────────────────────────────────────────────────────────

const ADMIN_KEY = 'test-admin-key-123';
const PRIVATE_FIELDS = [
  'email',
  'mobileNumber',
  'dob',
  'gender',
  'isEmailVerified',
  'isMobileVerified',
  'totalBookedEvents',
  'totalBookingAmount',
];

let app;

beforeAll(() => {
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  app = express();
  app.use(express.json());
  app.use('/api/users', require('../../src/routes/user.routes'));
  app.use('/api/admin', require('../../src/routes/admin.routes'));
});

beforeEach(() => {
  delete process.env.PUBLIC_USERS_EXPOSE_PII;
  mockGetBookingStats.mockReset().mockResolvedValue(
    new Map([['mongo-player-1', { bookedCount: 3, totalSpent: 210 }]])
  );
  mockFindChain.limit.mockClear();
});

// ── Public route ──────────────────────────────────────────────────────────────

describe('GET /api/users (public)', () => {
  it('returns public profile fields only', async () => {
    const res = await request(app).get('/api/users?page=1');

    expect(res.status).toBe(200);
    const [player, organiser] = res.body.data.users;
    for (const user of [player, organiser]) {
      for (const field of PRIVATE_FIELDS) {
        expect(user).not.toHaveProperty(field);
      }
    }
    expect(player.fullName).toBe('Pat Player');
    expect(organiser.communityName).toBe('Padel Club');
    expect(organiser.followersCount).toBe(7);
    expect(mockGetBookingStats).not.toHaveBeenCalled();
  });

  it('keeps a fixed page size of 20, ignoring perPage', async () => {
    await request(app).get('/api/users?page=1&perPage=100');
    expect(mockFindChain.limit).toHaveBeenCalledWith(20);
  });

  it('exposes private fields only while the temporary switch is on', async () => {
    process.env.PUBLIC_USERS_EXPOSE_PII = 'true';
    const res = await request(app).get('/api/users');
    expect(res.body.data.users[0].email).toBe('pat@example.com');
  });
});

// ── Admin route ───────────────────────────────────────────────────────────────

describe('GET /api/admin/users', () => {
  it('rejects a request without the admin key', async () => {
    const res = await request(app).get('/api/admin/users');
    expect(res.status).toBe(401);
  });

  it('rejects a wrong admin key', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('X-Admin-Key', 'wrong-key-xxxxxxx')
      .set('X-Admin-Email', 'admin@test.com');
    expect(res.status).toBe(403);
  });

  it('returns full user data with a valid key', async () => {
    const res = await request(app)
      .get('/api/admin/users?page=1&perPage=50')
      .set('X-Admin-Key', ADMIN_KEY)
      .set('X-Admin-Email', 'admin@test.com');

    expect(res.status).toBe(200);
    const [player, organiser] = res.body.data.users;
    expect(player).toMatchObject({
      email: 'pat@example.com',
      mobileNumber: '971500000001',
      dob: '1995-01-01',
      gender: 'female',
      totalBookedEvents: 3,
      totalBookingAmount: 210,
    });
    expect(organiser).toMatchObject({ email: 'olly@example.com', totalBookedEvents: 0 });
    expect(res.body.data.pagination.perPage).toBe(50);
  });

  it('caps perPage at 100', async () => {
    await request(app)
      .get('/api/admin/users?perPage=5000')
      .set('X-Admin-Key', ADMIN_KEY)
      .set('X-Admin-Email', 'admin@test.com');
    expect(mockFindChain.limit).toHaveBeenCalledWith(100);
  });
});
