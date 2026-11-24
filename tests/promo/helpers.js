/**
 * Shared helpers for the promo code tests. Everything runs against the sandboxed *_test collections
 * (see src/config/database.js) with Stripe mocked (tests/setup.js).
 */
const jwt = require('jsonwebtoken');
const User = require('../../src/models/User');
const Event = require('../../src/models/Event');
const PromoCode = require('../../src/models/PromoCode');
const { getDB } = require('../../src/config/database');

const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

const tokenFor = (user) => jwt.sign({ userId: user._id.toString() }, process.env.JWT_SECRET || 'relly-is-really');

async function createOrganiser(name = 'Promo Organiser') {
  return User.create({
    userType: 'organiser',
    email: `org_${uniq()}@test.com`,
    mobileNumber: `+97150${Math.floor(1000000 + Math.random() * 9000000)}`,
    password: 'password123',
    fullName: name,
    communityName: `${name} Community`,
    yourCity: 'Dubai',
    isEmailVerified: true,
    isMobileVerified: true,
  });
}

async function createPlayer(name = 'Promo Player') {
  return User.create({
    userType: 'player',
    email: `player_${uniq()}@test.com`,
    mobileNumber: `+97150${Math.floor(1000000 + Math.random() * 9000000)}`,
    password: 'password123',
    fullName: name,
    isEmailVerified: true,
    isMobileVerified: true,
  });
}

/** A paid event owned by `organiser`. hoursFromNow controls the cancellation window (24h rule). */
async function createPaidEvent(organiser, { price = 100, hoursFromNow = 72, sports = ['padel'], maxGuest = 50 } = {}) {
  return Event.create({
    creatorId: organiser._id,
    eventName: `Promo Test Event ${uniq()}`,
    eventType: 'public',
    eventSports: sports,
    eventDateTime: new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString(),
    eventMaxGuest: maxGuest,
    eventPricePerGuest: price,
    eventCreatorName: organiser.fullName,
  });
}

/** Create a promo code straight through the model. Defaults: organiser-funded 20% code. */
async function createCode(overrides = {}) {
  return PromoCode.create({
    code: `T${uniq()}`.slice(0, 20),
    discountType: 'percentage',
    discountValue: 20,
    usageLimit: null,
    userUsageLimit: null,
    fundedBy: 'organiser',
    ownerType: 'organiser',
    ownerId: null,
    createdBy: 'test',
    ...overrides,
  });
}

/** Build the {quote, validated, target} triple that pricing.quoteDetailed returns, without needing a real event. */
function fakeQuoteInput(promoCode, { base = 100, organiserId } = {}) {
  const { buildTotals } = require('../../src/services/pricing.service');
  const validated = [{ promoCode }];
  return {
    quote: buildTotals(base, validated),
    validated,
    target: {
      targetType: 'event',
      organiserId: organiserId || promoCode.ownerId,
      event: { _id: new (require('mongodb').ObjectId)(), eventId: `E${uniq()}` },
      pkg: null,
    },
  };
}

const col = (name) => getDB().collection(name);

module.exports = { uniq, tokenFor, createOrganiser, createPlayer, createPaidEvent, createCode, fakeQuoteInput, col };
