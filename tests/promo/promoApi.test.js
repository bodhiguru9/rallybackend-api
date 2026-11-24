/**
 * Organiser promo API (ownership, edit rules, purchases, CSV, notify) and the admin API (X-Admin-Key).
 */
// The broadcast controller pulls in the ESM-only uuid package, which jest can't load; it is unrelated to promo codes
jest.mock('../../src/controllers/admin/broadcast.controller', () => ({
  createBroadcast: jest.fn(),
  getBroadcastStatus: jest.fn(),
  listBroadcasts: jest.fn(),
}));

const request = require('supertest');
const express = require('express');
const { ObjectId } = require('mongodb');
const promoRoutes = require('../../src/routes/promo.routes');
const adminRoutes = require('../../src/routes/admin.routes');
const { createOrganiser, createPlayer, createPaidEvent, createCode, fakeQuoteInput, tokenFor, col } = require('./helpers');
const redemption = require('../../src/services/promoRedemption.service');

const ADMIN_KEY = 'test-admin-key-not-a-real-secret';

const app = express();
app.use(express.json());
app.use('/api/promo-codes', promoRoutes);
app.use('/api/admin', adminRoutes);

const as = (user) => ({ Authorization: `Bearer ${tokenFor(user)}` });
const admin = (email = 'admin@rally.test') => ({ 'X-Admin-Key': ADMIN_KEY, 'X-Admin-Email': email });

const validBody = (o = {}) => ({
  code: `API${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(0, 20),
  discountType: 'percentage',
  discountValue: 15,
  usageLimit: 10,
  userUsageLimit: 1,
  ...o,
});

/** Make a confirmed redemption of `promo` by `player` (so the code counts as used). */
async function useCode(promo, player, organiser) {
  const input = fakeQuoteInput(promo, { organiserId: organiser._id });
  const bookingId = new ObjectId();
  await redemption.reserve({ ...input, userId: player._id, context: { bookingId } });
  await redemption.confirm({ bookingId });
}

describe('organiser promo API', () => {
  let orgA;
  let orgB;
  let player;

  beforeAll(async () => {
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    orgA = await createOrganiser('Org A');
    orgB = await createOrganiser('Org B');
    player = await createPlayer('Buyer One');
  });

  const createAs = (org, body = validBody()) => request(app).post('/api/promo-codes').set(as(org)).send(body);

  describe('create', () => {
    it('forces organiser funding and ownership, ignoring fields the caller tries to set', async () => {
      const res = await createAs(orgA, validBody({ fundedBy: 'rally', ownerType: 'admin', ownerId: orgB._id.toString(), usedCount: 99 }));
      expect(res.status).toBe(201);
      expect(res.body.data.promoCode).toMatchObject({ fundedBy: 'organiser', ownerType: 'organiser', usedCount: 0 });
      const stored = await col('promoCodes').findOne({ code: res.body.data.promoCode.code });
      expect(String(stored.ownerId)).toBe(String(orgA._id));
    });

    it('supports no limit, unlimited per player and no end date', async () => {
      const res = await createAs(orgA, validBody({ usageLimit: null, userUsageLimit: null, validUntil: null }));
      expect(res.status).toBe(201);
      expect(res.body.data.promoCode).toMatchObject({ usageLimit: null, userUsageLimit: null, validUntil: null });
    });

    it.each([
      ['a bad code', { code: 'a b' }],
      ['a percentage above 100', { discountValue: 150 }],
      ['a zero usage limit', { usageLimit: 0 }],
      ['subscribers is fine for organisers but a bad eligibility is not', { eligibility: 'nobody' }],
    ])('returns 400 for %s', async (_name, override) => {
      const res = await createAs(orgA, validBody(override));
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION');
    });

    it('rejects a duplicate code (409) but allows it again after the first is archived', async () => {
      const body = validBody();
      const first = await createAs(orgA, body);
      expect((await createAs(orgB, body)).status).toBe(409);
      await request(app).delete(`/api/promo-codes/${first.body.data.promoCode.id}`).set(as(orgA));
      expect((await createAs(orgB, body)).status).toBe(201);
    });

    it('event ids must belong to the organiser', async () => {
      const mine = await createPaidEvent(orgA);
      const theirs = await createPaidEvent(orgB);
      expect((await createAs(orgA, validBody({ eventIds: [mine._id.toString()] }))).status).toBe(201);
      const res = await createAs(orgA, validBody({ eventIds: [theirs._id.toString()] }));
      expect(res.status).toBe(400);
    });

    it('players cannot create codes (403)', async () => {
      const res = await request(app).post('/api/promo-codes').set(as(player)).send(validBody());
      expect(res.status).toBe(403);
    });

    it('notify-on-create is refused (409 NOT_LIVE) for a code that starts in the future, and nothing is created', async () => {
      const body = validBody({ notifyOnCreate: true, validFrom: new Date(Date.now() + 5 * 864e5).toISOString() });
      const res = await createAs(orgA, body);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('NOT_LIVE');
      expect(await col('promoCodes').countDocuments({ code: body.code.toUpperCase() })).toBe(0);
    });
  });

  describe('ownership: organiser B cannot see or change organiser A\'s code (404, never 403)', () => {
    let id;
    beforeAll(async () => {
      id = (await createAs(orgA)).body.data.promoCode.id;
    });

    it.each([
      ['GET /:id', (i, org) => request(app).get(`/api/promo-codes/${i}`).set(as(org))],
      ['PUT /:id', (i, org) => request(app).put(`/api/promo-codes/${i}`).set(as(org)).send({ description: 'hijack' })],
      ['PATCH /:id/status', (i, org) => request(app).patch(`/api/promo-codes/${i}/status`).set(as(org)).send({ isActive: false })],
      ['DELETE /:id', (i, org) => request(app).delete(`/api/promo-codes/${i}`).set(as(org))],
      ['GET /:id/purchases', (i, org) => request(app).get(`/api/promo-codes/${i}/purchases`).set(as(org))],
      ['GET /:id/purchases/export', (i, org) => request(app).get(`/api/promo-codes/${i}/purchases/export`).set(as(org))],
      ['POST /:id/notify', (i, org) => request(app).post(`/api/promo-codes/${i}/notify`).set(as(org))],
    ])('%s', async (_name, call) => {
      const res = await call(id, orgB);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('the code is untouched after those attempts', async () => {
      const stored = await col('promoCodes').findOne({ _id: new ObjectId(id) });
      expect(stored.isActive).toBe(true);
      expect(stored.archivedAt).toBeNull();
      expect(stored.description ?? null).toBeNull();
    });

    it('the list only contains the caller\'s own codes', async () => {
      const resB = await request(app).get('/api/promo-codes?tab=active&perPage=100').set(as(orgB));
      expect(resB.status).toBe(200);
      expect(resB.body.data.promoCodes.map((c) => c.id)).not.toContain(id);
      const resA = await request(app).get('/api/promo-codes?tab=active&perPage=100').set(as(orgA));
      expect(resA.body.data.promoCodes.map((c) => c.id)).toContain(id);
    });

    it('requires login (401)', async () => {
      expect((await request(app).get('/api/promo-codes')).status).toBe(401);
    });
  });

  describe('edit rules', () => {
    it('always-editable fields can change; usageLimit cannot go below the uses already counted', async () => {
      const created = (await createAs(orgA, validBody({ usageLimit: 5 }))).body.data.promoCode;
      const stored = await col('promoCodes').findOne({ _id: new ObjectId(created.id) });
      await useCode(stored, player, orgA);
      await useCode(stored, await createPlayer(), orgA);

      const ok = await request(app).put(`/api/promo-codes/${created.id}`).set(as(orgA)).send({ description: 'new text', usageLimit: 2 });
      expect(ok.status).toBe(200);
      expect(ok.body.data.promoCode).toMatchObject({ description: 'new text', usageLimit: 2 });

      const tooLow = await request(app).put(`/api/promo-codes/${created.id}`).set(as(orgA)).send({ usageLimit: 1 });
      expect(tooLow.status).toBe(400);
      const noLimit = await request(app).put(`/api/promo-codes/${created.id}`).set(as(orgA)).send({ usageLimit: null });
      expect(noLimit.status).toBe(200);
    });

    it('code, discount type and value are locked once the code has live redemptions (409 CODE_LOCKED)', async () => {
      const created = (await createAs(orgA)).body.data.promoCode;
      const stored = await col('promoCodes').findOne({ _id: new ObjectId(created.id) });

      // still editable while unused
      expect((await request(app).put(`/api/promo-codes/${created.id}`).set(as(orgA)).send({ discountValue: 25 })).status).toBe(200);

      await useCode(stored, player, orgA);
      for (const change of [{ discountValue: 30 }, { discountType: 'fixed' }, { code: 'RENAMED1' }]) {
        const res = await request(app).put(`/api/promo-codes/${created.id}`).set(as(orgA)).send(change);
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('CODE_LOCKED');
      }
    });

    it('an archived code cannot be edited or paused', async () => {
      const created = (await createAs(orgA)).body.data.promoCode;
      await request(app).delete(`/api/promo-codes/${created.id}`).set(as(orgA));
      expect((await request(app).put(`/api/promo-codes/${created.id}`).set(as(orgA)).send({ description: 'x' })).status).toBe(409);
      expect((await request(app).patch(`/api/promo-codes/${created.id}/status`).set(as(orgA)).send({ isActive: true })).status).toBe(409);
    });
  });

  describe('pause, summary, detail, purchases, CSV, notify', () => {
    let created;
    let org;
    beforeAll(async () => {
      org = await createOrganiser('Org Stats');
      created = (await createAs(org, validBody({ discountValue: 10, userUsageLimit: null }))).body.data.promoCode;
      const stored = await col('promoCodes').findOne({ _id: new ObjectId(created.id) });
      await useCode(stored, player, org);
      await useCode(stored, player, org);
    });

    it('pause and resume', async () => {
      const paused = await request(app).patch(`/api/promo-codes/${created.id}/status`).set(as(org)).send({ isActive: false });
      expect(paused.body.data.promoCode).toMatchObject({ isActive: false, state: 'paused' });
      const resumed = await request(app).patch(`/api/promo-codes/${created.id}/status`).set(as(org)).send({ isActive: true });
      expect(resumed.body.data.promoCode.state).toBe('active');
      expect((await request(app).patch(`/api/promo-codes/${created.id}/status`).set(as(org)).send({ isActive: 'yes' })).status).toBe(400);
    });

    it('detail stats: discounted, collected (excl. VAT) and redeemed', async () => {
      const res = await request(app).get(`/api/promo-codes/${created.id}`).set(as(org));
      expect(res.body.data.stats).toEqual({ discounted: 20, collected: 180, redeemed: 2 });
    });

    it('summary counts this organiser\'s active codes and totals', async () => {
      const res = await request(app).get('/api/promo-codes/summary').set(as(org));
      expect(res.body.data).toMatchObject({ discountedTotal: 20, activeCount: 1, redeemedCount: 2 });
    });

    it('purchases are grouped per player with uses, and support search and sort', async () => {
      const res = await request(app).get(`/api/promo-codes/${created.id}/purchases?search=Buyer`).set(as(org));
      expect(res.status).toBe(200);
      expect(res.body.data.purchases).toHaveLength(1);
      expect(res.body.data.purchases[0]).toMatchObject({ name: 'Buyer One', uses: 2 });
      const none = await request(app).get(`/api/promo-codes/${created.id}/purchases?search=Nobody`).set(as(org));
      expect(none.body.data.purchases).toHaveLength(0);
    });

    it('CSV export has a header, readable player names and no raw ObjectId columns', async () => {
      const res = await request(app).get(`/api/promo-codes/${created.id}/purchases/export`).set(as(org));
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.text).toContain('Redemption,Status,Date,Player');
      expect(res.text).toContain('Buyer One');
      expect(res.text).not.toMatch(/[0-9a-f]{24}/);
    });

    it('notify: only for a live code, once per 24h', async () => {
      const first = await request(app).post(`/api/promo-codes/${created.id}/notify`).set(as(org));
      expect(first.status).toBe(200);
      const second = await request(app).post(`/api/promo-codes/${created.id}/notify`).set(as(org));
      expect(second.status).toBe(429);
      expect(second.body.code).toBe('NOTIFY_COOLDOWN');

      await request(app).patch(`/api/promo-codes/${created.id}/status`).set(as(org)).send({ isActive: false });
      await col('promoCodes').updateOne({ _id: new ObjectId(created.id) }, { $set: { lastNotifiedAt: null } });
      const paused = await request(app).post(`/api/promo-codes/${created.id}/notify`).set(as(org));
      expect(paused.status).toBe(409);
      expect(paused.body.code).toBe('NOT_LIVE');
      expect((await col('promoCodes').findOne({ _id: new ObjectId(created.id) })).lastNotifiedAt).toBeNull();
    });
  });
});

describe('admin promo API', () => {
  let org;
  let player;

  beforeAll(async () => {
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    org = await createOrganiser('Admin Test Org');
    player = await createPlayer('Admin Buyer');
  });

  describe('authentication', () => {
    const paths = [
      ['get', '/api/admin/promo-codes'],
      ['post', '/api/admin/promo-codes'],
      ['get', '/api/admin/promo-redemptions'],
    ];

    it.each(paths)('%s %s without a key is 401', async (method, path) => {
      const res = await request(app)[method](path).send({});
      expect(res.status).toBe(401);
    });

    it('a wrong key is rejected', async () => {
      const res = await request(app).get('/api/admin/promo-codes').set({ 'X-Admin-Key': 'wrong-key', 'X-Admin-Email': 'a@b.com' });
      expect([401, 403]).toContain(res.status);
    });

    it('a missing X-Admin-Email is 401, and a player token is not enough', async () => {
      expect((await request(app).get('/api/admin/promo-codes').set({ 'X-Admin-Key': ADMIN_KEY })).status).toBe(401);
      expect((await request(app).get('/api/admin/promo-codes').set(as(player))).status).toBe(401);
    });

    it('a valid key works and the call is audited', async () => {
      const res = await request(app).get('/api/admin/promo-codes').set(admin('auditor@rally.test'));
      expect(res.status).toBe(200);
      // adminAudit writes after the response; give it a moment
      await new Promise((r) => setTimeout(r, 300));
      expect(await col('adminAuditLog').countDocuments({ adminEmail: 'auditor@rally.test' })).toBeGreaterThan(0);
    });
  });

  describe('Rally-funded codes', () => {
    it('creates an app-wide Rally-funded code owned by the admin email', async () => {
      const res = await request(app).post('/api/admin/promo-codes').set(admin('boss@rally.test')).send(validBody({ notifyOnCreate: true }));
      expect(res.status).toBe(201);
      expect(res.body.data.promoCode).toMatchObject({ fundedBy: 'rally', ownerType: 'admin', ownerId: null, createdBy: 'boss@rally.test', notifyOnCreate: false });
    });

    it('rejects subscribers eligibility on an admin code', async () => {
      const res = await request(app).post('/api/admin/promo-codes').set(admin()).send(validBody({ eligibility: 'subscribers' }));
      expect(res.status).toBe(400);
    });

    it('lists organiser codes read-only: edit and archive are 403 READ_ONLY, pause works', async () => {
      const orgCode = await createCode({ ownerId: org._id });
      const id = String(orgCode._id);

      const list = await request(app).get('/api/admin/promo-codes?fundedBy=organiser&perPage=100').set(admin());
      expect(list.body.data.promoCodes.map((c) => c.id)).toContain(id);
      const rally = await request(app).get('/api/admin/promo-codes?fundedBy=rally&perPage=100').set(admin());
      expect(rally.body.data.promoCodes.map((c) => c.id)).not.toContain(id);

      const edit = await request(app).put(`/api/admin/promo-codes/${id}`).set(admin()).send({ description: 'x' });
      expect(edit.status).toBe(403);
      expect(edit.body.code).toBe('READ_ONLY');
      expect((await request(app).delete(`/api/admin/promo-codes/${id}`).set(admin())).status).toBe(403);

      const pause = await request(app).patch(`/api/admin/promo-codes/${id}/status`).set(admin()).send({ isActive: false });
      expect(pause.status).toBe(200);
      expect(pause.body.data.promoCode.isActive).toBe(false);
    });

    it('edits and archives (never hard-deletes) an admin code', async () => {
      const created = (await request(app).post('/api/admin/promo-codes').set(admin()).send(validBody())).body.data.promoCode;
      const edit = await request(app).put(`/api/admin/promo-codes/${created.id}`).set(admin()).send({ description: 'Black Friday' });
      expect(edit.status).toBe(200);
      expect((await request(app).delete(`/api/admin/promo-codes/${created.id}`).set(admin())).status).toBe(200);
      const stored = await col('promoCodes').findOne({ _id: new ObjectId(created.id) });
      expect(stored).not.toBeNull();
      expect(stored.archivedAt).toBeInstanceOf(Date);
    });
  });

  describe('GET /promo-redemptions', () => {
    let promo;
    let eventDoc;
    beforeAll(async () => {
      eventDoc = await createPaidEvent(org);
      promo = await createCode({ ownerId: org._id, fundedBy: 'rally', ownerType: 'admin' });
      const input = fakeQuoteInput(promo, { organiserId: org._id });
      input.target.event = eventDoc;
      const bookingId = new ObjectId();
      await redemption.reserve({ ...input, userId: player._id, context: { bookingId } });
      await redemption.confirm({ bookingId });
    });

    it('filters by code, status and fundedBy, and includes readable and joinable fields', async () => {
      const res = await request(app).get(`/api/admin/promo-redemptions?code=${promo.code}&status=confirmed&fundedBy=rally`).set(admin());
      expect(res.status).toBe(200);
      expect(res.body.data.redemptions).toHaveLength(1);
      expect(res.body.data.redemptions[0]).toMatchObject({
        code: promo.code,
        status: 'confirmed',
        fundedBy: 'rally',
        playerName: 'Admin Buyer',
        eventNumber: eventDoc.eventId,
        rallyDueAmount: 20,
        discountAmount: 20,
      });
      expect(res.body.data.redemptions[0]).toHaveProperty('bookingId');
      expect(res.body.data.redemptions[0]).toHaveProperty('paymentId');
      expect(res.body.data.redemptions[0]).toHaveProperty('stripePaymentIntentId');
    });

    it('filters by event number and by organiser', async () => {
      const byEvent = await request(app).get(`/api/admin/promo-redemptions?eventId=${eventDoc.eventId}`).set(admin());
      expect(byEvent.body.data.redemptions.length).toBeGreaterThanOrEqual(1);
      const byOrg = await request(app).get(`/api/admin/promo-redemptions?organiserId=${org._id}&code=${promo.code}`).set(admin());
      expect(byOrg.body.data.redemptions).toHaveLength(1);
      const none = await request(app).get(`/api/admin/promo-redemptions?code=${promo.code}&status=refunded`).set(admin());
      expect(none.body.data.redemptions).toHaveLength(0);
    });

    it('updatedSince returns only newer rows, oldest first', async () => {
      const future = new Date(Date.now() + 60 * 1000).toISOString();
      expect((await request(app).get(`/api/admin/promo-redemptions?updatedSince=${future}`).set(admin())).body.data.redemptions).toHaveLength(0);
      const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const res = await request(app).get(`/api/admin/promo-redemptions?updatedSince=${past}&perPage=100`).set(admin());
      const times = res.body.data.redemptions.map((r) => new Date(r.updatedAt).getTime());
      expect([...times].sort((a, b) => a - b)).toEqual(times);
    });

    it('validates filters and caps perPage at 100', async () => {
      expect((await request(app).get('/api/admin/promo-redemptions?fundedBy=bogus').set(admin())).status).toBe(400);
      expect((await request(app).get('/api/admin/promo-redemptions?status=nope').set(admin())).status).toBe(400);
      expect((await request(app).get('/api/admin/promo-redemptions?updatedSince=notadate').set(admin())).status).toBe(400);
      expect((await request(app).get('/api/admin/promo-redemptions?organiserId=zzz').set(admin())).status).toBe(400);
      const res = await request(app).get('/api/admin/promo-redemptions?perPage=5000').set(admin());
      expect(res.body.data.pagination.perPage).toBe(100);
    });

    it('csv=true downloads a CSV', async () => {
      const res = await request(app).get(`/api/admin/promo-redemptions?code=${promo.code}&csv=true`).set(admin());
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.text).toContain('Redemption,Code,Funded by,Status');
      expect(res.text).toContain(promo.code);
    });

    it('per-code purchases and export work for any code', async () => {
      const list = await request(app).get(`/api/admin/promo-codes/${promo._id}/purchases`).set(admin());
      expect(list.body.data.purchases[0]).toMatchObject({ name: 'Admin Buyer', uses: 1 });
      const csv = await request(app).get(`/api/admin/promo-codes/${promo._id}/purchases/export`).set(admin());
      expect(csv.text).toContain('Admin Buyer');
    });
  });
});
