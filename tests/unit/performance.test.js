const request = require('supertest');
const express = require('express');
const { getDB } = require('../../src/config/database');
const User = require('../../src/models/User');
const Event = require('../../src/models/Event');
const EventJoin = require('../../src/models/EventJoin');
const jwt = require('jsonwebtoken');
const errorHandler = require('../../src/middleware/errorHandler');
const { protect } = require('../../src/middleware/auth');

// Import controllers
const allEventsController = require('../../src/controllers/event/allEvents.controller');
const getCommunityDetails = require('../../src/controllers/user/getCommunityDetails.controller');
const getOrganiserEvents = require('../../src/controllers/user/getOrganiserEvents.controller');
const getUser = require('../../src/controllers/user/getUser.controller');
const getFilterOptions = require('../../src/controllers/event/getFilterOptions.controller');

// Build isolated mini-app
const miniApp = express();
miniApp.use(express.json());

// Public routes
miniApp.get('/api/events/all', allEventsController.getAllEvents);
miniApp.get('/api/events/filter-options', getFilterOptions.getFilterOptions);
miniApp.get('/api/users/community/:communityName', getCommunityDetails.getCommunityDetails);

// Protected routes
miniApp.get('/api/users/organiser/:userId/events', protect, getOrganiserEvents.getOrganiserEventsWithParticipants);
miniApp.get('/api/users/:id', protect, getUser.getUser);

miniApp.use(errorHandler);

const generateToken = (userId) => {
  return jwt.sign({ userId: userId.toString() }, process.env.JWT_SECRET || 'relly-is-really');
};

describe('API Performance Tests', () => {
  let organiser;
  let organiserToken;
  const COMMUNITY_NAME = `PerfTestCommunity_${Date.now()}`;

  beforeAll(async () => {
    // Create a test organiser
    organiser = await User.create({
      userType: 'organiser',
      email: `perf_org_${Date.now()}@test.com`,
      mobileNumber: `+97150${Math.floor(1000000 + Math.random() * 9000000)}`,
      password: 'password123',
      fullName: 'Perf Test Organiser',
      communityName: COMMUNITY_NAME,
      yourCity: 'Dubai',
      isEmailVerified: true,
      isMobileVerified: true,
      profileVisibility: 'public',
    });
    organiserToken = generateToken(organiser._id);

    // Create 10 test events for this organiser (fast setup)
    const eventPromises = [];
    for (let i = 0; i < 10; i++) {
      eventPromises.push(
        Event.create({
          creatorId: organiser._id,
          eventName: `Perf Test Event ${i}`,
          eventType: 'public',
          eventSports: ['football'],
          eventDateTime: new Date(Date.now() + (i + 1) * 24 * 60 * 60 * 1000).toISOString(),
          eventMaxGuest: 20,
          eventPricePerGuest: 0,
          eventCreatorName: organiser.fullName,
        })
      );
    }
    const events = await Promise.all(eventPromises);

    // Create 3 players
    const playerPromises = [];
    for (let i = 0; i < 3; i++) {
      playerPromises.push(
        User.create({
          userType: 'player',
          email: `perf_player_${i}_${Date.now()}@test.com`,
          mobileNumber: `+97150${Math.floor(1000000 + Math.random() * 9000000)}`,
          password: 'password123',
          fullName: `Perf Player ${i}`,
          isEmailVerified: true,
          isMobileVerified: true,
        })
      );
    }
    const players = await Promise.all(playerPromises);

    // Join players to 5 events
    for (const player of players) {
      for (let i = 0; i < 5; i++) {
        try {
          await EventJoin.join(player._id, events[i]._id, events[i].eventDateTime, {
            capacityLimit: 20,
          });
        } catch (e) {
          // ignore duplicates
        }
      }
    }
  }, 60000); // 60s timeout for DB setup

  describe('GET /api/events/all', () => {
    it('should respond in < 3000 ms for a page of events', async () => {
      const start = Date.now();
      const res = await request(miniApp).get('/api/events/all');
      const elapsed = Date.now() - start;

      console.log(`[Perf] GET /api/events/all: ${elapsed} ms`);
      expect(res.status).toBe(200);
      expect(elapsed).toBeLessThan(3000);
    });
  });

  describe('GET /api/users/community/:communityName', () => {
    it('should respond in < 3000 ms', async () => {
      const start = Date.now();
      const res = await request(miniApp).get(`/api/users/community/${COMMUNITY_NAME}`);
      const elapsed = Date.now() - start;

      console.log(`[Perf] GET /api/users/community/${COMMUNITY_NAME}: ${elapsed} ms`);
      expect(res.status).toBe(200);
      expect(elapsed).toBeLessThan(3000);
    });
  });

  describe('GET /api/users/organiser/:userId/events', () => {
    it('should respond in < 3000 ms', async () => {
      const start = Date.now();
      const res = await request(miniApp)
        .get(`/api/users/organiser/${organiser.userId}/events`)
        .set('Authorization', `Bearer ${organiserToken}`);
      const elapsed = Date.now() - start;

      console.log(`[Perf] GET /api/users/organiser/${organiser.userId}/events: ${elapsed} ms`);
      expect(res.status).toBe(200);
      expect(elapsed).toBeLessThan(3000);
    });
  });

  describe('GET /api/users/:userId (organiser profile)', () => {
    it('should respond in < 3000 ms', async () => {
      const start = Date.now();
      const res = await request(miniApp)
        .get(`/api/users/${organiser.userId}`)
        .set('Authorization', `Bearer ${organiserToken}`);
      const elapsed = Date.now() - start;

      console.log(`[Perf] GET /api/users/${organiser.userId}: ${elapsed} ms`);
      expect(res.status).toBe(200);
      expect(elapsed).toBeLessThan(3000);
    });
  });

  describe('GET /api/events/filter-options (cache test)', () => {
    it('first call should succeed', async () => {
      const res = await request(miniApp).get('/api/events/filter-options');
      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.sports).toBeDefined();
    });

    it('second call (cache hit) should respond in < 100 ms', async () => {
      // First call primes the cache (already done above)
      const start = Date.now();
      const res = await request(miniApp).get('/api/events/filter-options');
      const elapsed = Date.now() - start;

      console.log(`[Perf] GET /api/events/filter-options (cache hit): ${elapsed} ms`);
      expect(res.status).toBe(200);
      expect(elapsed).toBeLessThan(100);
    });
  });
});
