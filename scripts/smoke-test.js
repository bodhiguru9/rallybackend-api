/**
 * Rally Backend – Pre-Deploy Smoke Test
 *
 * Tests every endpoint touched in the recent participant/avatar fix,
 * as well as core event listing behaviour.
 *
 * Usage:
 *   node scripts/smoke-test.js                          # test production
 *   node scripts/smoke-test.js http://localhost:3000    # test local dev server
 *
 * Exit code 0 = all passed. Exit code 1 = one or more failed (safe to block deploy).
 */

const BASE_URL = process.argv[2] || 'https://backend2.rallysports.ae';

let passed = 0;
let failed = 0;
const failures = [];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(symbol, label, msg) {
  console.log(`  ${symbol} ${label.padEnd(55)} ${msg}`);
}

async function get(path) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

function assert(label, condition, detail = '') {
  if (condition) {
    log('✅', label, detail);
    passed++;
  } else {
    log('❌', label, detail);
    failed++;
    failures.push({ label, detail });
  }
}

// ─── Test Suites ─────────────────────────────────────────────────────────────

async function testHealthCheck() {
  console.log('\n📡 Health Check');
  try {
    const { status } = await get('/');
    assert('Server responds', status < 500, `HTTP ${status}`);
  } catch (e) {
    assert('Server responds', false, `Connection failed: ${e.message}`);
  }
}

async function testGetAllEvents() {
  console.log('\n📋 GET /api/events/all — Home Feed');
  const { status, body } = await get('/api/events/all');

  assert('Returns HTTP 200', status === 200, `HTTP ${status}`);
  assert('success: true', body?.success === true, JSON.stringify(body?.success));
  assert('data.events is an array', Array.isArray(body?.data?.events), typeof body?.data?.events);

  const events = body?.data?.events ?? [];
  assert('Returns at least 1 event', events.length > 0, `count=${events.length}`);

  if (events.length > 0) {
    const e = events[0];

    // ── Core fields that EventCard.tsx depends on ──
    assert('event has eventName', typeof e.eventName === 'string', e.eventName);
    assert('event has eventDateTime', !!e.eventDateTime, String(e.eventDateTime));
    assert('event has participantsCount (number)', typeof e.participantsCount === 'number', String(e.participantsCount));
    assert('event has participants (array)', Array.isArray(e.participants), typeof e.participants);
    assert('event has spotsInfo object', typeof e.spotsInfo === 'object' && e.spotsInfo !== null, typeof e.spotsInfo);
    assert('spotsInfo.totalSpots is number', typeof e.spotsInfo?.totalSpots === 'number', String(e.spotsInfo?.totalSpots));
    assert('spotsInfo.spotsBooked is number', typeof e.spotsInfo?.spotsBooked === 'number', String(e.spotsInfo?.spotsBooked));

    // ── Key invariant: spotsBooked === participantsCount ──
    assert(
      'spotsInfo.spotsBooked == participantsCount (data consistency)',
      e.spotsInfo?.spotsBooked === e.participantsCount,
      `spotsBooked=${e.spotsInfo?.spotsBooked}, participantsCount=${e.participantsCount}`
    );

    // ── Each participant in the mini-list must have profilePic (avatar display) ──
    const participantsWithPic = e.participants.filter(p => p.profilePic);
    if (e.participants.length > 0) {
      assert(
        'participants have profilePic (avatars show)',
        participantsWithPic.length > 0,
        `${participantsWithPic.length}/${e.participants.length} have profilePic`
      );
    }

    // ── Creator object must be present (community name display) ──
    assert('event has creator object', typeof e.creator === 'object', typeof e.creator);

    // ── userJoinStatus must be present (button state) ──
    assert('event has userJoinStatus', !!e.userJoinStatus, String(!!e.userJoinStatus));
  }
}

async function testSearchEvents() {
  console.log('\n🔍 GET /api/events/search — Search Endpoint');

  // Test 1: no params → expects 400
  const noParams = await get('/api/events/search');
  assert('No params → 400 bad request', noParams.status === 400, `HTTP ${noParams.status}`);

  // Test 2: valid search with eventType
  const { status, body } = await get('/api/events/search?eventType=social');

  // Could be 404 (no events found) or 200 (found) – both are valid
  assert(
    'Valid search returns 200 or 404',
    status === 200 || status === 404,
    `HTTP ${status}`
  );

  if (status === 200) {
    const events = body?.data?.events ?? [];
    assert('Search: events array present', Array.isArray(events), typeof events);

    if (events.length > 0) {
      const e = events[0];
      // Same shape contract as getAllEvents – the fix must be consistent
      assert('Search: event has participants array', Array.isArray(e.participants), typeof e.participants);
      assert('Search: event has participantsCount', typeof e.participantsCount === 'number', String(e.participantsCount));
      assert('Search: event has spotsInfo', typeof e.spotsInfo === 'object' && e.spotsInfo !== null, typeof e.spotsInfo);
      assert(
        'Search: spotsBooked == participantsCount (data consistency)',
        e.spotsInfo?.spotsBooked === e.participantsCount,
        `spotsBooked=${e.spotsInfo?.spotsBooked}, participantsCount=${e.participantsCount}`
      );
      assert('Search: filterOptions present', !!body?.data?.filterOptions, String(!!body?.data?.filterOptions));
    }
  }
}

async function testGetSingleEvent(eventId) {
  if (!eventId) {
    console.log('\n⚠️  Skipping single-event test (no eventId from getAllEvents)');
    return;
  }
  console.log(`\n🎟  GET /api/events/${eventId} — Single Event Details`);

  const { status, body } = await get(`/api/events/${eventId}`);
  assert('Returns HTTP 200', status === 200, `HTTP ${status}`);
  assert('success: true', body?.success === true, String(body?.success));

  // Single-event endpoint nests data as { data: { event: {...} } }
  // (getAllEvents uses { data: { events: [...] } } — different shape)
  const e = body?.data?.event;
  assert('has participants array', Array.isArray(e?.participants), typeof e?.participants);
  assert('has participantsCount', typeof e?.participantsCount === 'number', String(e?.participantsCount));
  assert('has spotsInfo', typeof e?.spotsInfo === 'object' && e?.spotsInfo !== null, typeof e?.spotsInfo);

  // Single event endpoint fetches 50 participants — check the shape of each
  if (e?.participants?.length > 0) {
    const p = e.participants[0];
    assert('participant has userId', !!p.userId, String(p.userId));
    assert('participant has fullName', typeof p.fullName === 'string', p.fullName);
    assert('participant has userType', typeof p.userType === 'string', p.userType);
  }
}

async function testNullSafetyEdgeCases() {
  console.log('\n🛡  Edge-Case / Null Safety');

  // Fetch a non-existent event — must not 500
  const { status: s404 } = await get('/api/events/000000000000000000000000');
  assert(
    'Non-existent event → 404, not 500',
    s404 === 404 || s404 === 400,
    `HTTP ${s404}`
  );

  // Search with numeric price — should not crash
  const { status: priceStatus } = await get('/api/events/search?minPrice=0&maxPrice=999999');
  assert(
    'Price range search → not 500',
    priceStatus !== 500,
    `HTTP ${priceStatus}`
  );

  // Malformed date — should return 400, not 500
  const { status: badDate } = await get('/api/events/search?startDate=not-a-date');
  assert(
    'Invalid startDate → 400, not 500',
    badDate === 400,
    `HTTP ${badDate}`
  );
}

// ─── Runner ──────────────────────────────────────────────────────────────────

async function run() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║         Rally Backend – Pre-Deploy Smoke Test           ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  Target: ${BASE_URL}`);
  console.log(`  Time:   ${new Date().toISOString()}`);

  await testHealthCheck();
  await testGetAllEvents();

  // Grab a real eventId from the first test to use in single-event test
  let firstEventId = null;
  try {
    const { body } = await get('/api/events/all');
    firstEventId = body?.data?.events?.[0]?.eventId || body?.data?.events?.[0]?.id;
  } catch {}

  await testGetSingleEvent(firstEventId);
  await testSearchEvents();
  await testNullSafetyEdgeCases();

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);

  if (failures.length > 0) {
    console.log('\n  Failed assertions:');
    failures.forEach(f => console.log(`    ❌ ${f.label}: ${f.detail}`));
    console.log('\n  ⛔ DO NOT DEPLOY — fix these issues first.\n');
    process.exit(1);
  } else {
    console.log('\n  ✅ All checks passed — safe to deploy.\n');
    process.exit(0);
  }
}

run().catch(err => {
  console.error('\n💥 Smoke test runner crashed:', err);
  process.exit(1);
});
