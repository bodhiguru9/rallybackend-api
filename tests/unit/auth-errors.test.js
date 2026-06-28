const request = require('supertest');
const express = require('express');
const User = require('../../src/models/User');
const bcrypt = require('bcryptjs');
const errorHandler = require('../../src/middleware/errorHandler');

// Build isolated mini-app with just the signin route + error handler
const signinController = require('../../src/controllers/auth/signin.controller');
const miniApp = express();
miniApp.use(express.json());
miniApp.post('/api/auth/signin', signinController.signin);
miniApp.use(errorHandler);

describe('Auth Error Status Codes', () => {
  let testUser;
  const TEST_EMAIL = `auth_test_${Date.now()}@test.com`;
  const TEST_PASSWORD = 'CorrectPassword123!';

  beforeAll(async () => {
    // Create a test user with a known password
    testUser = await User.create({
      userType: 'player',
      email: TEST_EMAIL,
      mobileNumber: `+97150${Math.floor(1000000 + Math.random() * 9000000)}`,
      password: TEST_PASSWORD,
      fullName: 'Auth Test Player',
      isEmailVerified: true,
      isMobileVerified: true,
    });
  });

  describe('POST /api/auth/signin — wrong credentials', () => {
    it('should return 401 (not 500) for wrong password', async () => {
      const res = await request(miniApp)
        .post('/api/auth/signin')
        .send({ email: TEST_EMAIL, password: 'WrongPassword123!' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Invalid credentials');
    });

    it('should return 401 (not 500) for unknown email', async () => {
      const res = await request(miniApp)
        .post('/api/auth/signin')
        .send({ email: 'nobody@nonexistent.com', password: 'AnyPassword123!' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Invalid credentials');
    });

    it('should never return status 500 for credential errors', async () => {
      const res = await request(miniApp)
        .post('/api/auth/signin')
        .send({ email: TEST_EMAIL, password: 'BadPassword' });

      expect(res.status).not.toBe(500);
      expect(res.body.error).not.toBe('Server Error');
    });
  });

  describe('POST /api/auth/signin — missing fields', () => {
    it('should return 400 for missing emailOrMobile', async () => {
      const res = await request(miniApp)
        .post('/api/auth/signin')
        .send({ password: 'SomePassword123!' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 400 for missing password', async () => {
      const res = await request(miniApp)
        .post('/api/auth/signin')
        .send({ email: TEST_EMAIL });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 400 for empty body', async () => {
      const res = await request(miniApp)
        .post('/api/auth/signin')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/signin — correct credentials', () => {
    it('should return 200 with valid credentials', async () => {
      const res = await request(miniApp)
        .post('/api/auth/signin')
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.token).toBeDefined();
    });
  });
});
