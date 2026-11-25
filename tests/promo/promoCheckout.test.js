/**
 * Checkout, webhook and cancellation behaviour with promo codes, through the real controllers
 * (sandboxed *_test collections, mocked Stripe and notifications).
 */
const request = require('supertest');
const express = require('express');
const { protect } = require('../../src/middleware/auth');
const bookEvent = require('../../src/controllers/booking/bookEvent.controller');
const cancelBooking = require('../../src/controllers/booking/cancelBooking.controller');
const { stripeWebhook } = require('../../src/controllers/payment/webhook.controller');
const promoRoutes = require('../../src/routes/promo.routes');
const Payment = require('../../src/models/Payment');
const { createOrganiser, createPlayer, createPaidEvent, createCode, createLegacyCode, tokenFor, col } = require('./helpers');

const app = express();
// The Stripe webhook needs the raw body, so it is mounted before express.json()
app.post('/webhook', express.raw({ type: 'application/json' }), stripeWebhook);
app.use(express.json());
app.post('/api/bookings/book-event/:eventId', protect, bookEvent);
app.post('/api/bookings/:bookingId/cancel', protect, cancelBooking);
app.use('/api/promo-codes', promoRoutes);

const usedCount = async (id) => (await col('promoCodes').findOne({ _id: id })).usedCount;
const redemptionsOf = (id) => col('promoRedemptions').find({ promoCodeId: id }).toArray();

const book = (player, event, { codes, query = '', body = {} } = {}) =>
  request(app)
    .post(`/api/bookings/book-event/${event._id.toString()}${query}`)
    .set('Authorization', `Bearer ${tokenFor(player)}`)
    .send({ ...(codes ? { promoCodes: codes } : {}), ...body });

const sendWebhook = (type, paymentIntentId) =>
  request(app)
    .post('/webhook')
    .set('stripe-signature', 'test')
    .set('Content-Type', 'application/json')
    .send(JSON.stringify({ type, data: { object: { id: paymentIntentId, payment_method: 'pm_test' } } }));

describe('promo codes at checkout', () => {
  let organiser;
  let otherOrganiser;
  let event;

  beforeAll(async () => {
    organiser = await createOrganiser('Checkout Organiser');
    otherOrganiser = await createOrganiser('Other Organiser');
    event = await createPaidEvent(organiser, { price: 100 });
  });

  const ownCode = (o = {}) => createCode({ ownerId: organiser._id, ...o });

  describe('POST /api/promo-codes/quote', () => {
    const quote = (player, body) =>
      request(app).post('/api/promo-codes/quote').set('Authorization', `Bearer ${tokenFor(player)}`).send(body);

    it('prices an event with the code: 100 AED, 20% -> 84 AED', async () => {
      const player = await createPlayer();
      const promo = await ownCode();
      const res = await quote(player, { targetType: 'event', eventId: event._id.toString(), guestsCount: 1, promoCodes: [promo.code] });
      expect(res.status).toBe(200);
      expect(res.body.data.quote).toMatchObject({ originalAmount: 100, discountAmount: 20, subtotal: 80, vatAmount: 4, finalAmount: 84 });
    });

    it('multiplies by guests and prices with no code', async () => {
      const player = await createPlayer();
      const res = await quote(player, { targetType: 'event', eventId: event._id.toString(), guestsCount: 2, promoCodes: [] });
      expect(res.body.data.quote).toMatchObject({ originalAmount: 200, discountAmount: 0, finalAmount: 210 });
    });

    it.each([
      ['INVALID', async () => ({ promoCodes: ['NOSUCHCODE1'] })],
      ['PAUSED', async () => ({ promoCodes: [(await ownCode({ isActive: false })).code] })],
      ['EXPIRED', async () => ({ promoCodes: [(await ownCode({ validFrom: new Date(Date.now() - 5 * 864e5), validUntil: new Date(Date.now() - 864e5) })).code] })],
      ['NOT_STARTED', async () => ({ promoCodes: [(await ownCode({ validFrom: new Date(Date.now() + 864e5) })).code] })],
      ['NOT_APPLICABLE', async () => ({ promoCodes: [(await createCode({ ownerId: otherOrganiser._id })).code] })],
      ['NOT_APPLICABLE', async () => ({ promoCodes: [(await ownCode({ sports: ['tennis'] })).code] })],
      ['MIN_PURCHASE', async () => ({ promoCodes: [(await ownCode({ minPurchaseAmount: 500 })).code] })],
      ['TOO_MANY_CODES', async () => ({ promoCodes: [(await ownCode()).code, (await ownCode()).code] })],
    ])('rejects with %s', async (expected, makeBody) => {
      const player = await createPlayer();
      const res = await quote(player, { targetType: 'event', eventId: event._id.toString(), guestsCount: 1, ...(await makeBody()) });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(expected);
    });

    it('first_booking code: allowed for a new player, refused once they have booked with the organiser', async () => {
      const player = await createPlayer();
      const promo = await ownCode({ eligibility: 'first_booking' });
      const ok = await quote(player, { targetType: 'event', eventId: event._id.toString(), promoCodes: [promo.code] });
      expect(ok.status).toBe(200);

      await col('bookings').insertOne({ userId: player._id, eventId: event._id, status: 'booked', createdAt: new Date() });
      const refused = await quote(player, { targetType: 'event', eventId: event._id.toString(), promoCodes: [promo.code] });
      expect(refused.body.code).toBe('NOT_ELIGIBLE_FIRST_BOOKING');
    });

    it('subscribers code: only for followers of the organiser', async () => {
      const player = await createPlayer();
      const promo = await ownCode({ eligibility: 'subscribers' });
      const refused = await quote(player, { targetType: 'event', eventId: event._id.toString(), promoCodes: [promo.code] });
      expect(refused.body.code).toBe('NOT_ELIGIBLE_SUBSCRIBERS');

      await col('follows').insertOne({ followerId: player._id, followingId: organiser._id, createdAt: new Date() });
      const ok = await quote(player, { targetType: 'event', eventId: event._id.toString(), promoCodes: [promo.code] });
      expect(ok.status).toBe(200);
    });

    it('a code is not applicable on a free event', async () => {
      const player = await createPlayer();
      const freeEvent = await createPaidEvent(organiser, { price: 0 });
      const promo = await ownCode();
      const res = await quote(player, { targetType: 'event', eventId: freeEvent._id.toString(), promoCodes: [promo.code] });
      expect(res.body.code).toBe('NOT_APPLICABLE');
    });

    it('requires login', async () => {
      const res = await request(app).post('/api/promo-codes/quote').send({ targetType: 'event', eventId: event._id.toString() });
      expect(res.status).toBe(401);
    });
  });

  describe('paid booking with a code', () => {
    it('charges the quoted amount, stores the promo fields and Stripe metadata, and reserves the use', async () => {
      const player = await createPlayer();
      const promo = await ownCode({ fundedBy: 'rally', ownerType: 'admin', ownerId: null });

      const res = await book(player, event, { codes: [promo.code] });

      expect(res.status).toBe(201);
      const { booking, payment, paymentIntent } = res.body.data;
      expect(booking).toMatchObject({ amount: 100, discountAmount: 20, finalAmount: 84, vatAmount: 4, rallyFundedDiscount: 20, status: 'pending' });
      expect(booking.appliedPromos[0]).toMatchObject({ code: promo.code, fundedBy: 'rally', discountAmount: 20 });
      expect(paymentIntent.amount).toBe(8400);

      const stored = await Payment.findByStripePaymentIntentId(paymentIntent.id);
      expect(stored.metadata).toMatchObject({
        originalAmount: '100',
        discountAmount: '20',
        rallyFundedDiscount: '20',
        organiserFundedDiscount: '0',
        promoCodes: promo.code,
        promoFundedBy: 'rally',
        promoCode: promo.code,
        organiserId: organiser._id.toString(),
      });
      expect(payment.vatAmount).toBe(4);

      const [r] = await redemptionsOf(promo._id);
      expect(r).toMatchObject({ status: 'reserved', stripePaymentIntentId: paymentIntent.id, rallyDueAmount: 20, fundedBy: 'rally' });
      expect(await usedCount(promo._id)).toBe(1);
    });

    it('the legacy ?promoCode= query still works', async () => {
      const player = await createPlayer();
      const promo = await ownCode();
      const res = await book(player, event, { query: `?promoCode=${promo.code}` });
      expect(res.status).toBe(201);
      expect(res.body.data.booking.finalAmount).toBe(84);
      expect(res.body.data.booking.promoCode).toBe(promo.code);
    });

    it('a code that leaves under 2 AED is lifted to exactly 2.00 so Stripe accepts it', async () => {
      const player = await createPlayer();
      const cheap = await createPaidEvent(organiser, { price: 10 });
      const promo = await createCode({ ownerId: organiser._id, discountValue: 99 }); // the biggest allowed discount on a 10 AED event
      const res = await book(player, cheap, { codes: [promo.code] });
      expect(res.status).toBe(201);
      expect(res.body.data.booking.finalAmount).toBe(2);
      expect(res.body.data.paymentIntent.amount).toBe(200);
    });

    it('an invalid code returns a stable error code and creates nothing', async () => {
      const player = await createPlayer();
      const res = await book(player, event, { codes: ['NOSUCHCODE2'] });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID');
      expect(await col('bookings').countDocuments({ userId: player._id })).toBe(0);
    });

    it('re-booking with the same code reuses the pending booking and keeps one reservation', async () => {
      const player = await createPlayer();
      const promo = await ownCode({ userUsageLimit: 1 });
      const first = await book(player, event, { codes: [promo.code] });
      const second = await book(player, event, { codes: [promo.code] });

      expect(second.status).toBe(200);
      expect(second.body.data.booking.bookingId).toBe(first.body.data.booking.bookingId);
      expect(await usedCount(promo._id)).toBe(1);
    });

    it('changing the code on a pending booking closes the old booking, releases its use, and starts fresh', async () => {
      const player = await createPlayer();
      const promoA = await ownCode();
      const first = await book(player, event, { codes: [promoA.code] });
      expect(first.status).toBe(201);

      const second = await book(player, event, { codes: [] });

      expect(second.status).toBe(201);
      expect(second.body.data.booking.bookingId).not.toBe(first.body.data.booking.bookingId);
      expect(second.body.data.booking.finalAmount).toBe(105);
      const oldBooking = await col('bookings').findOne({ bookingId: first.body.data.booking.bookingId });
      expect(oldBooking.status).toBe('failed');
      expect((await redemptionsOf(promoA._id))[0]).toMatchObject({ status: 'released', releaseReason: 'superseded' });
      expect(await usedCount(promoA._id)).toBe(0);
    });
  });

  describe('Stripe webhook', () => {
    const paidBooking = async (codeOverrides = {}) => {
      const player = await createPlayer();
      const promo = await ownCode(codeOverrides);
      const res = await book(player, event, { codes: [promo.code] });
      return { player, promo, res, pi: res.body.data.paymentIntent.id, bookingId: res.body.data.booking.bookingId };
    };

    it('payment_intent.succeeded confirms the use exactly once, even if Stripe delivers it twice', async () => {
      const { promo, pi, bookingId } = await paidBooking();

      const first = await sendWebhook('payment_intent.succeeded', pi);
      const second = await sendWebhook('payment_intent.succeeded', pi);

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect((await redemptionsOf(promo._id))[0].status).toBe('confirmed');
      expect(await usedCount(promo._id)).toBe(1);
      expect((await col('bookings').findOne({ bookingId })).status).toBe('booked');
      expect((await Payment.findByStripePaymentIntentId(pi)).status).toBe('success');
    });

    it('parallel deliveries of the same success event still confirm once (claimSuccess race)', async () => {
      const { promo, pi } = await paidBooking();
      await Promise.all([sendWebhook('payment_intent.succeeded', pi), sendWebhook('payment_intent.succeeded', pi), sendWebhook('payment_intent.succeeded', pi)]);
      const rows = await redemptionsOf(promo._id);
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('confirmed');
      expect(await usedCount(promo._id)).toBe(1);
    });

    it('payment_intent.payment_failed releases the use', async () => {
      const { promo, pi } = await paidBooking();
      await sendWebhook('payment_intent.payment_failed', pi);
      expect((await redemptionsOf(promo._id))[0]).toMatchObject({ status: 'released', releaseReason: 'payment_failed' });
      expect(await usedCount(promo._id)).toBe(0);
    });

    it('payment_intent.canceled releases the use and closes the still-pending booking', async () => {
      const { promo, pi, bookingId } = await paidBooking();
      await sendWebhook('payment_intent.canceled', pi);
      expect((await redemptionsOf(promo._id))[0].status).toBe('released');
      expect((await col('bookings').findOne({ bookingId })).status).toBe('failed');
      expect(await usedCount(promo._id)).toBe(0);
    });
  });

  describe('cancellation', () => {
    const cancel = (player, bookingId) =>
      request(app).post(`/api/bookings/${bookingId}/cancel`).set('Authorization', `Bearer ${tokenFor(player)}`).send({});

    it('a paid booking cancelled in time is refunded without VAT; the use is given back and Rally top-up zeroed', async () => {
      const player = await createPlayer();
      const promo = await ownCode({ fundedBy: 'rally', ownerType: 'admin', ownerId: null });
      const res = await book(player, event, { codes: [promo.code] });
      const pi = res.body.data.paymentIntent.id;
      await sendWebhook('payment_intent.succeeded', pi);
      expect((await redemptionsOf(promo._id))[0].rallyDueAmount).toBe(20);

      const out = await cancel(player, res.body.data.booking.bookingId);

      expect(out.status).toBe(200);
      const payment = await Payment.findByStripePaymentIntentId(pi);
      expect(payment.refundAmount).toBe(80); // paid 84 incl. 4 VAT: amount paid minus VAT
      expect(payment.vatRetained).toBe(4);
      expect((await redemptionsOf(promo._id))[0]).toMatchObject({ status: 'refunded', rallyDueAmount: 0 });
      expect(await usedCount(promo._id)).toBe(0);
    });

    it('cancelling a pending (unpaid) booking releases its reservation straight away', async () => {
      const player = await createPlayer();
      const promo = await ownCode();
      const res = await book(player, event, { codes: [promo.code] });
      expect(await usedCount(promo._id)).toBe(1);

      await cancel(player, res.body.data.booking.bookingId);

      expect((await redemptionsOf(promo._id))[0]).toMatchObject({ status: 'released', releaseReason: 'booking_cancelled' });
      expect(await usedCount(promo._id)).toBe(0);
    });
  });

  // 100% codes can't be created any more (M7). These tests keep the defensive free-booking path covered
  // using a record written straight to the collection (e.g. an old code).
  describe('100% code (free, 0 AED, no Stripe), defensive path for old records', () => {
    const freeBooking = async (eventForBooking) => {
      const player = await createPlayer();
      const promo = await createLegacyCode({ ownerId: organiser._id, discountValue: 100 });
      const res = await book(player, eventForBooking, { codes: [promo.code] });
      return { player, promo, res };
    };

    it('books immediately, confirms the use and writes a 0 AED payment record', async () => {
      const { promo, res } = await freeBooking(event);

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ isFreeEvent: true, paymentRequired: false });
      expect(res.body.data.booking).toMatchObject({ status: 'booked', finalAmount: 0, discountAmount: 100 });

      const payment = await col('payments').findOne({ bookingId: res.body.data.booking.bookingId });
      expect(payment).toMatchObject({ status: 'success', paymentMethod: 'promo_free', finalAmount: 0 });
      expect(payment.stripePaymentIntentId.startsWith('free_')).toBe(true);
      expect((await redemptionsOf(promo._id))[0]).toMatchObject({ status: 'confirmed', paidAmount: 0 });
      expect(await usedCount(promo._id)).toBe(1);
    });

    it('cancelled inside the window: the use is given back and no Stripe refund is attempted', async () => {
      const { player, promo, res } = await freeBooking(event);
      const out = await request(app)
        .post(`/api/bookings/${res.body.data.booking.bookingId}/cancel`)
        .set('Authorization', `Bearer ${tokenFor(player)}`)
        .send({});

      expect(out.status).toBe(200);
      expect(out.body.data?.refundProcessed ?? false).toBe(false);
      expect((await redemptionsOf(promo._id))[0].status).toBe('refunded');
      expect(await usedCount(promo._id)).toBe(0);
    });

    it('cancelled outside the window (under 24h): the redemption stays confirmed', async () => {
      const soonEvent = await createPaidEvent(organiser, { price: 100, hoursFromNow: 12 });
      const { player, promo, res } = await freeBooking(soonEvent);
      expect(res.status).toBe(201);

      await request(app)
        .post(`/api/bookings/${res.body.data.booking.bookingId}/cancel`)
        .set('Authorization', `Bearer ${tokenFor(player)}`)
        .send({});

      expect((await redemptionsOf(promo._id))[0].status).toBe('confirmed');
      expect(await usedCount(promo._id)).toBe(1);
    });
  });
});
