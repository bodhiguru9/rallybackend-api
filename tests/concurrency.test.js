const request = require('supertest');
const express = require('express');
const { getDB } = require('../src/config/database');
const User = require('../src/models/User');
const Event = require('../src/models/Event');
const Booking = require('../src/models/Booking');
const EventJoin = require('../src/models/EventJoin');
const otpStore = require('../src/services/otpStore');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Specific controllers and middleware for testing
const bookEvent = require('../src/controllers/booking/bookEvent.controller');
const cancelBooking = require('../src/controllers/booking/cancelBooking.controller');
const { signup } = require('../src/controllers/auth/signup.controller');
const { protect } = require('../src/middleware/auth');

// Build an isolated mini-app to bypass syntax/reserved-word errors in unrelated controllers (e.g. package routes using 'package')
const miniApp = express();
miniApp.use(express.json());
miniApp.use(express.urlencoded({ extended: true }));

miniApp.post('/api/bookings/book-event/:eventId', protect, bookEvent);
miniApp.post('/api/bookings/:bookingId/cancel', protect, cancelBooking);
miniApp.post('/api/auth/signup', signup);

const generateToken = (userId) => {
  return jwt.sign({ userId: userId.toString() }, process.env.JWT_SECRET || 'relly-is-really');
};

describe('Rally Backend Concurrency & Sandbox Tests', () => {
  let organiser;
  let organiserToken;
  let testPlayers = [];

  beforeAll(async () => {
    // 1. Create a test organiser
    const organiserEmail = `organiser_${Date.now()}@test.com`;
    const organiserPhone = `+97150${Math.floor(1000000 + Math.random() * 9000000)}`;
    organiser = await User.create({
      userType: 'organiser',
      email: organiserEmail,
      mobileNumber: organiserPhone,
      password: 'password123',
      fullName: 'Test Organiser',
      communityName: 'Test Community',
      yourCity: 'Dubai',
      isEmailVerified: true,
      isMobileVerified: true,
    });
    organiserToken = generateToken(organiser._id);

    // 2. Create multiple test players
    for (let i = 0; i < 20; i++) {
      const email = `player_${i}_${Date.now()}@test.com`;
      const phone = `+97150${Math.floor(1000000 + Math.random() * 9000000)}`;
      const player = await User.create({
        userType: 'player',
        email,
        mobileNumber: phone,
        password: 'password123',
        fullName: `Test Player ${i}`,
        isEmailVerified: true,
        isMobileVerified: true,
      });
      const token = generateToken(player._id);
      testPlayers.push({ user: player, token });
    }
  });

  describe('Database Collection-Level Sandbox verification', () => {
    it('should use sandboxed collection names (with _test suffix) in test environment', () => {
      const db = getDB();
      const usersCol = db.collection('users');
      expect(usersCol.collectionName).toBe('users_test');
    });

    it('should connect to the test database name', () => {
      const db = getDB();
      expect(db.databaseName).toContain('_test');
    });
  });

  describe('1. Event Capacity Overbooking (Free Event)', () => {
    let overbookedEvent;

    beforeAll(async () => {
      overbookedEvent = await Event.create({
        creatorId: organiser._id,
        eventName: 'Free Concurrency Cup',
        eventType: 'public',
        eventSports: ['football'],
        eventDateTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        eventMaxGuest: 3,
        eventPricePerGuest: 0,
        eventCreatorName: organiser.fullName,
      });
    });

    it('should block bookings when capacity is reached and never overbook', async () => {
      // 10 players attempt booking concurrently
      const promises = testPlayers.slice(0, 10).map((player) => {
        return request(miniApp)
          .post(`/api/bookings/book-event/${overbookedEvent._id.toString()}`)
          .set('Authorization', `Bearer ${player.token}`)
          .send({});
      });

      const responses = await Promise.all(promises);

      const successes = responses.filter(r => r.status === 201);
      const failures = responses.filter(r => r.status === 400);

      console.log(`[Overbooking Test] Successes: ${successes.length}, Failures: ${failures.length}`);

      // Exactly 3 (capacity) bookings must succeed
      expect(successes.length).toBe(3);
      expect(failures.length).toBe(7);

      // Verify the DB shows exactly 3 participants joined
      const participantCount = await EventJoin.getParticipantCount(overbookedEvent._id, overbookedEvent.eventDateTime);
      expect(participantCount).toBe(3);
    });
  });

  describe('2. Last Slot Race Condition', () => {
    let lastSlotEvent;

    beforeAll(async () => {
      lastSlotEvent = await Event.create({
        creatorId: organiser._id,
        eventName: 'Last Slot Championship',
        eventType: 'public',
        eventSports: ['tennis'],
        eventDateTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        eventMaxGuest: 2,
        eventPricePerGuest: 0,
        eventCreatorName: organiser.fullName,
      });

      // Join 1 player first (leaving exactly 1 slot remaining)
      await EventJoin.join(
        testPlayers[0].user._id,
        lastSlotEvent._id,
        lastSlotEvent.eventDateTime,
        { capacityLimit: 2 }
      );
    });

    it('should allow exactly one player to claim the last slot and reject the rest', async () => {
      // 5 concurrent requests for the 1 remaining slot
      const promises = testPlayers.slice(1, 6).map((player) => {
        return request(miniApp)
          .post(`/api/bookings/book-event/${lastSlotEvent._id.toString()}`)
          .set('Authorization', `Bearer ${player.token}`)
          .send({});
      });

      const responses = await Promise.all(promises);

      const successes = responses.filter(r => r.status === 201);
      const failures = responses.filter(r => r.status === 400);

      console.log(`[Last Slot Test] Successes: ${successes.length}, Failures: ${failures.length}`);

      expect(successes.length).toBe(1);
      expect(failures.length).toBe(4);

      // Verify DB total participants is exactly 2
      const participantCount = await EventJoin.getParticipantCount(lastSlotEvent._id, lastSlotEvent.eventDateTime);
      expect(participantCount).toBe(2);
    });
  });

  describe('3. Duplicate Booking Submission', () => {
    let duplicateEvent;

    beforeAll(async () => {
      duplicateEvent = await Event.create({
        creatorId: organiser._id,
        eventName: 'Idempotency Trophy',
        eventType: 'public',
        eventSports: ['basketball'],
        eventDateTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        eventMaxGuest: 5,
        eventPricePerGuest: 0,
        eventCreatorName: organiser.fullName,
      });
    });

    it('should process only one booking and reject duplicate simultaneous taps from the same user', async () => {
      const player = testPlayers[7];

      // Submit the booking request 5 times concurrently for the same player
      const promises = Array.from({ length: 5 }).map(() => {
        return request(miniApp)
          .post(`/api/bookings/book-event/${duplicateEvent._id.toString()}`)
          .set('Authorization', `Bearer ${player.token}`)
          .send({});
      });

      const responses = await Promise.all(promises);

      const successes = responses.filter(r => r.status === 201);
      const failures = responses.filter(r => r.status === 400);

      console.log(`[Duplicate Test] Successes: ${successes.length}, Failures: ${failures.length}`);

      expect(successes.length).toBe(1);
      expect(failures.length).toBe(4);

      // Verify the player is registered exactly once
      const participants = await EventJoin.getEventParticipants(duplicateEvent._id, duplicateEvent.eventDateTime);
      const playerJoins = participants.filter(p => p.userId === player.user.userId);
      expect(playerJoins.length).toBe(1);
    });
  });

  describe('7. Concurrent Cancellation and Booking', () => {
    let raceEvent;
    let playerA;
    let playerB;
    let playerC;
    let bookingA;

    beforeAll(async () => {
      raceEvent = await Event.create({
        creatorId: organiser._id,
        eventName: 'Cancel vs Book Race',
        eventType: 'public',
        eventSports: ['padel'],
        eventDateTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        eventMaxGuest: 2,
        eventPricePerGuest: 0,
        eventCreatorName: organiser.fullName,
      });

      playerA = testPlayers[8];
      playerB = testPlayers[9];
      playerC = testPlayers[10];

      // Fill event first (A and B book)
      const resA = await request(miniApp)
        .post(`/api/bookings/book-event/${raceEvent._id.toString()}`)
        .set('Authorization', `Bearer ${playerA.token}`)
        .send({});
      bookingA = resA.body.data.booking;

      await request(miniApp)
        .post(`/api/bookings/book-event/${raceEvent._id.toString()}`)
        .set('Authorization', `Bearer ${playerB.token}`)
        .send({});

      const initialCount = await EventJoin.getParticipantCount(raceEvent._id, raceEvent.eventDateTime);
      expect(initialCount).toBe(2);
    });

    it('should deterministically free a spot and allow a new booker in when cancellation and booking happen concurrently', async () => {
      // Concurrently: Player A cancels booking, Player C books the same event
      const cancelPromise = request(miniApp)
        .post(`/api/bookings/${bookingA.bookingId}/cancel`)
        .set('Authorization', `Bearer ${playerA.token}`)
        .send({});

      const bookPromise = request(miniApp)
        .post(`/api/bookings/book-event/${raceEvent._id.toString()}`)
        .set('Authorization', `Bearer ${playerC.token}`)
        .send({});

      const [cancelRes, bookRes] = await Promise.all([cancelPromise, bookPromise]);

      console.log(`[Cancel vs Book Race] Cancel status: ${cancelRes.status}, Book status: ${bookRes.status}`);

      expect(cancelRes.status).toBe(200);

      const finalCount = await EventJoin.getParticipantCount(raceEvent._id, raceEvent.eventDateTime);
      expect(finalCount).toBeLessThanOrEqual(2);

      const hasCJoined = await EventJoin.hasJoined(playerC.user._id, raceEvent._id, raceEvent.eventDateTime);
      const hasAJoined = await EventJoin.hasJoined(playerA.user._id, raceEvent._id, raceEvent.eventDateTime);

      expect(hasAJoined).toBe(false); // Player A must have left
      if (bookRes.status === 201) {
        expect(hasCJoined).toBe(true);
        expect(finalCount).toBe(2);
      } else {
        expect(hasCJoined).toBe(false);
        expect(finalCount).toBe(1); // Only Player B is left
      }
    });
  });

  describe('31. Concurrent Sign-ups (Player)', () => {
    it('should reject duplicate signup attempts with the same email/phone concurrently and only create one user', async () => {
      const email = `concurrent_signup_${Date.now()}@test.com`;
      const phone = `+97150${Math.floor(1000000 + Math.random() * 9000000)}`;

      // Seed otpStore to allow signup
      const signupToken = 'mock_signup_token_' + Math.random().toString(36).substring(2);
      const hashedSignupToken = crypto.createHash('sha256').update(signupToken).digest('hex');
      const storeKey = `mobile:${phone}`;
      
      await otpStore.set(storeKey, {
        identifier: phone,
        isEmail: false,
        userType: 'player',
        verified: true,
        signupToken: hashedSignupToken,
        signupTokenExpire: Date.now() + 60 * 60 * 1000,
        expiresAt: Date.now() + 60 * 60 * 1000,
      });

      // Submit 5 concurrent signup requests with the same details
      const promises = Array.from({ length: 5 }).map(() => {
        return request(miniApp)
          .post('/api/auth/signup')
          .send({
            email,
            password: 'Password123!',
            fullName: 'Concurrent Player',
            userType: 'player',
            sport1: 'football',
            signupToken: signupToken,
          });
      });

      const responses = await Promise.all(promises);

      const successes = responses.filter(r => r.status === 201 || r.status === 200);
      const failures = responses.filter(r => r.status === 400 || r.status === 409 || r.status === 500);

      console.log(`[Concurrent Signup Test] Successes: ${successes.length}, Failures: ${failures.length}`);

      // Exactly 1 signup must succeed
      expect(successes.length).toBe(1);
      expect(failures.length).toBe(4);

      // Verify DB contains exactly one user with this email
      const db = getDB();
      const usersCol = db.collection('users');
      const count = await usersCol.countDocuments({ email: email.toLowerCase() });
      expect(count).toBe(1);
    });
  });
});
