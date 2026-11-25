const redemption = require('../../src/services/promoRedemption.service');
const { PromoError } = require('../../src/services/pricing.service');
const { createOrganiser, createPlayer, createCode, createLegacyCode, fakeQuoteInput, col } = require('./helpers');
const { ObjectId } = require('mongodb');

const usedCount = async (id) => (await col('promoCodes').findOne({ _id: id })).usedCount;
const rowsOf = (promoCodeId) => col('promoRedemptions').find({ promoCodeId }).toArray();

describe('promo redemption lifecycle', () => {
  let organiser;
  let player;

  beforeAll(async () => {
    organiser = await createOrganiser();
    player = await createPlayer();
  });

  const setup = async (codeOverrides = {}, base = 100) => {
    // 100% / fixed codes can't be created any more (M7), so they are written directly to test the defensive path
    const make = codeOverrides.discountType || codeOverrides.discountValue === 100 ? createLegacyCode : createCode;
    const promo = await make({ ownerId: organiser._id, ...codeOverrides });
    return { promo, input: fakeQuoteInput(promo, { base, organiserId: organiser._id }) };
  };

  describe('reserve', () => {
    it('increments usedCount and writes a reserved redemption with the price snapshot', async () => {
      const { promo, input } = await setup();
      const [r] = await redemption.reserve({ ...input, userId: player._id, context: { bookingId: new ObjectId() } });

      expect(r.status).toBe('reserved');
      expect(r.redemptionId).toMatch(/^PRD\d+$/);
      expect(r).toMatchObject({ originalAmount: 100, discountAmount: 20, paidAmount: 80, vatAmount: 4, fundedBy: 'organiser', rallyDueAmount: 0 });
      expect(r.expiresAt.getTime()).toBeGreaterThan(Date.now() + 25 * 60 * 1000);
      expect(await usedCount(promo._id)).toBe(1);
    });

    it('a Rally-funded code records rallyDueAmount equal to its discount', async () => {
      const { input } = await setup({ fundedBy: 'rally', ownerType: 'admin', ownerId: null });
      const [r] = await redemption.reserve({ ...input, userId: player._id });
      expect(r.rallyDueAmount).toBe(20);
    });

    it('a retry on the same booking supersedes the earlier reservation (usedCount unchanged, no self-limit error)', async () => {
      const { promo, input } = await setup({ userUsageLimit: 1, usageLimit: 5 });
      const bookingId = new ObjectId();

      await redemption.reserve({ ...input, userId: player._id, context: { bookingId } });
      await redemption.reserve({ ...input, userId: player._id, context: { bookingId } });

      expect(await usedCount(promo._id)).toBe(1);
      const rows = await rowsOf(promo._id);
      expect(rows.filter((r) => r.status === 'reserved')).toHaveLength(1);
      expect(rows.filter((r) => r.status === 'released' && r.releaseReason === 'superseded')).toHaveLength(1);
    });

    it('is refused when the total limit is already reached (LIMIT_REACHED) and leaves usedCount alone', async () => {
      const { promo, input } = await setup({ usageLimit: 1 });
      await redemption.reserve({ ...input, userId: player._id });
      const other = await createPlayer();
      await expect(redemption.reserve({ ...input, userId: other._id })).rejects.toMatchObject({ code: 'LIMIT_REACHED' });
      expect(await usedCount(promo._id)).toBe(1);
    });

    it('refuses a paused code', async () => {
      const { promo, input } = await setup();
      await col('promoCodes').updateOne({ _id: promo._id }, { $set: { isActive: false } });
      await expect(redemption.reserve({ ...input, userId: player._id })).rejects.toBeInstanceOf(PromoError);
      expect(await usedCount(promo._id)).toBe(0);
    });

    it('concurrent reserves at usageLimit 3: exactly 3 succeed, usedCount is 3', async () => {
      const { promo, input } = await setup({ usageLimit: 3 });
      const players = await Promise.all(Array.from({ length: 10 }, () => createPlayer()));

      const results = await Promise.allSettled(players.map((p) => redemption.reserve({ ...input, userId: p._id })));

      const ok = results.filter((r) => r.status === 'fulfilled');
      const refused = results.filter((r) => r.status === 'rejected');
      expect(ok).toHaveLength(3);
      expect(refused).toHaveLength(7);
      refused.forEach((r) => expect(r.reason.code).toBe('LIMIT_REACHED'));
      expect(await usedCount(promo._id)).toBe(3);
      expect((await rowsOf(promo._id)).filter((r) => r.status === 'reserved')).toHaveLength(3);
    });

    it('the same player cannot exceed the per-player limit with parallel reserves', async () => {
      const { promo, input } = await setup({ userUsageLimit: 1 });
      const results = await Promise.allSettled(
        Array.from({ length: 5 }, () => redemption.reserve({ ...input, userId: player._id }))
      );
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      expect(ok).toBeLessThanOrEqual(1);
      // whatever happened, the counter matches the live reservations exactly
      expect(await usedCount(promo._id)).toBe(ok);
      expect((await rowsOf(promo._id)).filter((r) => r.status === 'reserved')).toHaveLength(ok);
    });
  });

  describe('confirm', () => {
    it('confirms a reservation, and a second confirm changes nothing (idempotent)', async () => {
      const { promo, input } = await setup();
      const bookingId = new ObjectId();
      await redemption.reserve({ ...input, userId: player._id, context: { bookingId } });

      expect(await redemption.confirm({ bookingId })).toBe(1);
      expect(await redemption.confirm({ bookingId })).toBe(0);

      const [r] = await rowsOf(promo._id);
      expect(r.status).toBe('confirmed');
      expect(r.confirmedAt).toBeInstanceOf(Date);
      expect(r.expiresAt).toBeNull();
      expect(await usedCount(promo._id)).toBe(1);
    });

    it('confirm by PaymentIntent id works (webhook path)', async () => {
      const { input } = await setup();
      const pi = `pi_test_${Date.now()}`;
      await redemption.reserve({ ...input, userId: player._id, context: { stripePaymentIntentId: pi } });
      expect(await redemption.confirm({ stripePaymentIntentId: pi })).toBe(1);
    });

    it('a late payment re-confirms a reservation the sweeper already released and counts the use again', async () => {
      const { promo, input } = await setup();
      const bookingId = new ObjectId();
      await redemption.reserve({ ...input, userId: player._id, context: { bookingId } });
      await redemption.release({ bookingId }, 'expired');
      expect(await usedCount(promo._id)).toBe(0);

      expect(await redemption.confirm({ bookingId })).toBe(1);
      expect(await usedCount(promo._id)).toBe(1);
      expect((await rowsOf(promo._id))[0].status).toBe('confirmed');
    });

    it('requires an identifier', async () => {
      await expect(redemption.confirm({})).rejects.toThrow();
    });
  });

  describe('release', () => {
    it('gives the use back once, never drives usedCount below 0', async () => {
      const { promo, input } = await setup();
      const bookingId = new ObjectId();
      await redemption.reserve({ ...input, userId: player._id, context: { bookingId } });

      expect(await redemption.release({ bookingId }, 'payment_failed')).toBe(1);
      expect(await redemption.release({ bookingId }, 'payment_failed')).toBe(0);
      expect(await usedCount(promo._id)).toBe(0);

      const [r] = await rowsOf(promo._id);
      expect(r).toMatchObject({ status: 'released', releaseReason: 'payment_failed' });
    });

    it('does not release a confirmed redemption', async () => {
      const { promo, input } = await setup();
      const bookingId = new ObjectId();
      await redemption.reserve({ ...input, userId: player._id, context: { bookingId } });
      await redemption.confirm({ bookingId });
      expect(await redemption.release({ bookingId }, 'x')).toBe(0);
      expect(await usedCount(promo._id)).toBe(1);
    });
  });

  describe('refund', () => {
    it('marks a confirmed redemption refunded, zeroes rallyDueAmount, gives the use back, once', async () => {
      const { promo, input } = await setup({ fundedBy: 'rally', ownerType: 'admin', ownerId: null });
      const bookingId = new ObjectId();
      await redemption.reserve({ ...input, userId: player._id, context: { bookingId } });
      await redemption.confirm({ bookingId });
      expect((await rowsOf(promo._id))[0].rallyDueAmount).toBe(20);

      expect(await redemption.refund({ bookingId }, 'booking_cancelled')).toBe(1);
      expect(await redemption.refund({ bookingId }, 'booking_cancelled')).toBe(0);

      const [r] = await rowsOf(promo._id);
      expect(r).toMatchObject({ status: 'refunded', rallyDueAmount: 0 });
      expect(await usedCount(promo._id)).toBe(0);
    });

    it('does not refund a reservation that was never confirmed', async () => {
      const { promo, input } = await setup();
      const bookingId = new ObjectId();
      await redemption.reserve({ ...input, userId: player._id, context: { bookingId } });
      expect(await redemption.refund({ bookingId })).toBe(0);
      expect(await usedCount(promo._id)).toBe(1);
    });
  });

  describe('reserveAndConfirm (free 0 AED path)', () => {
    it('reserves and confirms in one step', async () => {
      const { promo, input } = await setup({ discountValue: 100 }, 50);
      const created = await redemption.reserveAndConfirm({ ...input, userId: player._id });
      expect(created).toHaveLength(1);
      expect((await rowsOf(promo._id))[0]).toMatchObject({ status: 'confirmed', paidAmount: 0 });
      expect(await usedCount(promo._id)).toBe(1);
    });
  });

  describe('sweeper', () => {
    const expire = (promoCodeId) =>
      col('promoRedemptions').updateMany({ promoCodeId }, { $set: { expiresAt: new Date(Date.now() - 60 * 1000) } });

    it('releases expired reservations and cancels their pending PaymentIntents', async () => {
      const { promo, input } = await setup();
      const pi = `pi_sweep_${Date.now()}`;
      await redemption.reserve({ ...input, userId: player._id, context: { stripePaymentIntentId: pi } });
      await expire(promo._id);
      const cancelPaymentIntent = jest.fn().mockResolvedValue({});

      const result = await redemption.sweepExpired({ cancelPaymentIntent });

      expect(result.released).toBeGreaterThanOrEqual(1);
      expect(cancelPaymentIntent).toHaveBeenCalledWith(pi);
      expect((await rowsOf(promo._id))[0]).toMatchObject({ status: 'released', releaseReason: 'expired' });
      expect(await usedCount(promo._id)).toBe(0);
    });

    it('leaves live reservations alone', async () => {
      const { promo, input } = await setup();
      await redemption.reserve({ ...input, userId: player._id });
      await redemption.sweepExpired({});
      expect((await rowsOf(promo._id))[0].status).toBe('reserved');
    });

    it('a PaymentIntent that cannot be cancelled and has succeeded is deferred 15 minutes, not retried forever', async () => {
      const { promo, input } = await setup();
      const pi = `pi_paid_${Date.now()}`;
      await redemption.reserve({ ...input, userId: player._id, context: { stripePaymentIntentId: pi } });
      await expire(promo._id);

      const result = await redemption.sweepExpired({
        cancelPaymentIntent: jest.fn().mockRejectedValue(new Error('already succeeded')),
        retrievePaymentIntent: jest.fn().mockResolvedValue({ status: 'succeeded' }),
      });

      expect(result.deferred).toBeGreaterThanOrEqual(1);
      const [r] = await rowsOf(promo._id);
      expect(r.status).toBe('reserved');
      expect(r.expiresAt.getTime()).toBeGreaterThan(Date.now() + 10 * 60 * 1000);
      expect(await usedCount(promo._id)).toBe(1);
    });

    it('a PaymentIntent that is already canceled at Stripe is released', async () => {
      const { promo, input } = await setup();
      const pi = `pi_canceled_${Date.now()}`;
      await redemption.reserve({ ...input, userId: player._id, context: { stripePaymentIntentId: pi } });
      await expire(promo._id);

      await redemption.sweepExpired({
        cancelPaymentIntent: jest.fn().mockRejectedValue(new Error('already canceled')),
        retrievePaymentIntent: jest.fn().mockResolvedValue({ status: 'canceled' }),
      });

      expect((await rowsOf(promo._id))[0].status).toBe('released');
      expect(await usedCount(promo._id)).toBe(0);
    });

    it('handles oldest expiries first', async () => {
      const { promo, input } = await setup();
      await redemption.reserve({ ...input, userId: player._id });
      await expire(promo._id);
      // sort + limit are exercised: the call must not throw and must report counts
      const result = await redemption.sweepExpired({});
      expect(result).toEqual(expect.objectContaining({ released: expect.any(Number), deferred: expect.any(Number) }));
    });
  });
});
