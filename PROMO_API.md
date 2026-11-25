# Promo Codes API (contract)

Status: **skeleton (milestone 1)**. Shapes below are the contract the app builds against. Each milestone marks its endpoints as implemented. Source of truth for the product rules: `promo-code-plan.md` (§1 decisions).

All routes need `Authorization: Bearer <token>` unless marked admin. Money is in **AED, 2 decimal places**. VAT is 5%, charged on the discounted subtotal. Dates are ISO 8601 UTC strings.

Implementation status: `quote` **implemented (M2)** · checkout fields **implemented (M3)** · organiser API **implemented (M4)** · admin API **implemented (M5)**.

---

## 1. Conventions

**Success**: `{ "success": true, "data": { ... } }`
**Error**: `{ "success": false, "message": "human text", "code": "STABLE_CODE" }` (HTTP 400 unless noted; 401/403/404 as usual)

### 1.1 Promo error codes (field `code`)
| code | meaning | suggested app text |
|---|---|---|
| `INVALID` | no such code | "This code isn't valid" |
| `EXPIRED` | past `validUntil` | "This code has expired" |
| `NOT_STARTED` | before `validFrom` | "This code isn't active yet" |
| `PAUSED` | `isActive=false` | "This code is currently paused" |
| `LIMIT_REACHED` | total uses used up | "This code has been fully redeemed" |
| `USER_LIMIT_REACHED` | per-player limit hit | "You've already used this code" |
| `NOT_ELIGIBLE_FIRST_BOOKING` | not the player's first booking | "This code is for first bookings only" |
| `NOT_ELIGIBLE_SUBSCRIBERS` | player doesn't follow the organiser | "Follow this organiser to use this code" |
| `NOT_APPLICABLE` | wrong organiser/sport/event/package | "This code doesn't apply to this booking" |
| `MIN_PURCHASE` | below `minPurchaseAmount` | "Minimum spend not reached" |
| `TOO_MANY_CODES` | more than `MAX_PROMO_CODES_PER_ORDER` (1) | "Only one code can be used per booking" |

### 1.2 Shared shapes

```jsonc
// AppliedPromo
{ "code": "SAVE20", "fundedBy": "rally|organiser", "discountAmount": 20.00 }

// Quote (server-computed price; the app must render this, never compute its own)
{
  "originalAmount": 100.00,      // price x guests (pre-VAT)
  "discountAmount": 20.00,       // total discount
  "subtotal": 80.00,             // originalAmount - discountAmount
  "vatAmount": 4.00,             // round(subtotal x 0.05, 2)
  "finalAmount": 84.00,          // subtotal + vatAmount; 0 => free booking, Stripe skipped
  "appliedPromos": [ /* AppliedPromo */ ],
  "rallyFundedDiscount": 20.00,
  "organiserFundedDiscount": 0.00
}
```

**State** (computed on promo code cards): `active` | `paused` | `expired` | `used_up` | `archived`.
`past` tab = `expired`, `used_up` or `archived`.

**PromoCode** (organiser/admin views):
```jsonc
{
  "id": "<mongo _id>",
  "promoCodeId": "PRO12",
  "code": "SAVE20",
  "description": null,
  "discountType": "percentage",  // always "percentage" for new codes; an old record may still say "fixed"
  "discountValue": 20,           // 1-99 (percent) for new codes
  "minPurchaseAmount": 0,
  "maxDiscountAmount": null,
  "usageLimit": 60,              // null = no limit
  "usedCount": 41,               // reserved + confirmed
  "userUsageLimit": 1,           // null = unlimited
  "validFrom": "2026-12-01T00:00:00.000Z",
  "validUntil": null,            // null = no end date
  "isActive": true,              // false = paused
  "state": "active",
  "fundedBy": "organiser",
  "ownerType": "organiser",
  "sports": ["Padel"],           // [] = all sports
  "appliesTo": "events",         // events | packages | both
  "eventIds": [], "packageIds": [],
  "eligibility": "everyone|first_booking|subscribers",
  "notifyOnCreate": false,
  "lastNotifiedAt": null,
  "createdAt": "...", "updatedAt": "..."
}
```

---

## 2. Player: quote  (M2)

### POST `/api/promo-codes/quote`
Server-side price for a checkout. Call after the player types a code; send the same codes to booking/payment afterwards.

Request:
```json
{
  "targetType": "event",
  "eventId": "<event _id>",
  "occurrenceStart": "2026-12-05T17:00:00.000Z",
  "guestsCount": 2,
  "promoCodes": ["SAVE20"]
}
```
For packages: `{ "targetType": "package", "packageId": "<id>", "promoCodes": [...] }`.
`promoCodes` may be empty (returns the plain price with VAT).

Response `200`: `{ "success": true, "data": { "quote": <Quote> } }`
Errors: a code from 1.1 (HTTP 400). If several codes fail, the first error is returned.

### POST `/api/promo-codes/validate`  (legacy)
Kept for older app builds. Wrapper over `quote`. Request `{ "code", "eventId", "amount" }`. Response keeps the old shape (`promoCode`, `discountAmount`, `finalAmount`).

---

## 3. Checkout changes (M3, implemented)

All of these accept the new body field `promoCodes: string[]` and still accept legacy `?promoCode=CODE`.

- `POST /api/bookings/...` (bookEvent) and `POST /api/payments/create-order` (createPaymentOrder) — body gains `promoCodes`. The amount is always recomputed on the server.
- Free result (`finalAmount == 0`; no longer reachable with new codes since 100% is rejected, kept for old records): response has `"free": true`, no Stripe client secret; the booking is confirmed immediately.
- Booking / payment / package purchase responses add: `appliedPromos[]`, `vatAmount`, `rallyFundedDiscount`, `organiserFundedDiscount`. Legacy `promoCode` (first code) and `discountAmount` (sum) are still returned.
- Refund on cancel = `amount actually paid − VAT`; the redemption is released.
- Stripe PaymentIntent metadata gains: `organiserId, originalAmount, discountAmount, rallyFundedDiscount, organiserFundedDiscount, promoCodes (comma separated), promoFundedBy` (plus legacy `promoCode`).

---

## 4. Organiser API  (M4, implemented)  — `/api/promo-codes` (organisers see only codes they own)

| Method | Path | Notes |
|---|---|---|
| GET | `/summary` | `{ discountedTotal, activeCount, redeemedCount }` |
| GET | `/?tab=active\|past&page=1&perPage=20` | `{ promoCodes: [PromoCode], pagination }` |
| POST | `/` | create (below) |
| GET | `/:id` | `{ promoCode, stats: { discounted, collected, redeemed } }` |
| PUT | `/:id` | edit (backend only; no app UI yet) |
| PATCH | `/:id/status` | `{ "isActive": false }` pause/resume |
| DELETE | `/:id` | archive (soft delete) |
| GET | `/:id/purchases` | `?search&gender&sort=recent\|uses&page&perPage` |
| GET | `/:id/purchases/export` | CSV download |
| POST | `/:id/notify` | push to followers; max 1 per 24h per code |

`discounted` = total discount given. `collected` = what players paid after discount, excluding VAT. `redeemed` = confirmed uses.

**Create** body:
```json
{
  "code": "SAVE20",
  "sports": ["Padel"],
  "discountType": "percentage",
  "discountValue": 20,
  "usageLimit": 60,
  "userUsageLimit": 1,
  "validUntil": "2026-12-31T23:59:59.000Z",
  "eligibility": "everyone",
  "notifyOnCreate": true
}
```
**Discount rule (all create and edit calls, organiser and admin):** percentage only. `discountType` must be `"percentage"` and `discountValue` must be a number from 1 to 99. Fixed-AED codes and 100% codes are rejected with HTTP 400 and `code: "VALIDATION"`:
```json
{ "success": false, "code": "VALIDATION", "message": "Only percentage discounts are supported" }
{ "success": false, "code": "VALIDATION", "message": "Discount must be between 1 and 99%" }
```
(Both messages are joined with `; ` if both rules fail.) Old records that are `fixed` or 100% are still priced correctly, display as before, and can have other fields edited; they just can't be created again or have their discount changed to those values.

`usageLimit: null` = no limit; `userUsageLimit: null` = unlimited; `validUntil` omitted/null = no end date. The server forces `fundedBy: "organiser"`, `ownerType: "organiser"`, `ownerId` = caller. Validation errors: HTTP 400 with `message` (AED amounts).

**Edit rules** (`PUT`): always editable — `description, usageLimit (null or >= usedCount), userUsageLimit, validUntil, eligibility, sports, eventIds, packageIds, minPurchaseAmount, maxDiscountAmount`. Editable only while there are 0 confirmed/reserved redemptions — `code, discountType, discountValue`. Otherwise HTTP 409 `{ "code": "CODE_LOCKED" }`.

**Purchases** item (grouped per player):
```json
{ "userId": "...", "name": "Sara K", "photo": "https://...", "phone": "+9715...", "email": "s@x.com",
  "gender": "female", "uses": 2, "lastUsedAt": "2026-11-20T10:00:00.000Z" }
```
Response: `{ success: true, data: { purchases: [...], pagination } }`.

**Pagination object** (all list endpoints): `{ totalCount, totalPages, currentPage, perPage, hasNextPage, hasPrevPage }`.

**Responses** (all wrapped as `{ success: true, data }`): `GET /summary` -> `{ discountedTotal, activeCount, redeemedCount }`; `GET /` -> `{ promoCodes: [PromoCode], pagination }`; `POST /` (201) -> `{ promoCode, notified? }`; `GET /:id` -> `{ promoCode, stats: { discounted, collected, redeemed } }`; `PUT /:id` and `PATCH /:id/status` -> `{ promoCode }`; `DELETE /:id` -> `{ success: true, message }`; `POST /:id/notify` -> `{ notified: { totalSubscribers, pushSentCount, inAppCount }, lastNotifiedAt }`.

**Errors**: 404 `NOT_FOUND` for a code that doesn't exist *or belongs to someone else*; 400 `VALIDATION`; 409 `CODE_EXISTS`, `CODE_LOCKED`, `ARCHIVED`, `NOT_ACTIVE`; 429 `NOTIFY_COOLDOWN` (one announcement per code per 24h); 409 `NOT_LIVE` (notify, or create with `notifyOnCreate`, only for a code that is live now: active, started, not expired, not archived).

**CSV** (`/:id/purchases/export`): one row per redemption (confirmed or refunded) with Redemption id, Status, Date, Player, Phone, Email, Gender, Booking number, Event number (E#), Event name, Occurrence, Original / Discount / Paid (excl. VAT) / VAT in AED. Cells starting with `= + - @` are prefixed with `'`.

**Organiser reporting**
- Transactions/analytics rows add `appliedPromos[]` and `rallyFundedDiscount`.
- `GET /api/organizers/promo-dues?page&perPage` -> `{ rallyFundedDiscounts: [{ redemptionId, code, playerName, bookingNumber, eventNumber, eventName, occurrenceStart, originalAmount, rallyFundedDiscount, confirmedAt }], totals: { rallyFundedDiscountTotal, count }, pagination }`. Read-only record of Rally-funded (admin code) discounts used on this organiser's events. It is **not** an amount owed or a payout; how payouts use it is undecided.

---

## 5. Admin API  (M5, implemented)  — `/api/admin`, headers `X-Admin-Key` + `X-Admin-Email`

Behind the existing `adminKeyAuth` + `adminAudit` (every call is audit-logged). Admin codes are **Rally-funded and app-wide**: `fundedBy: "rally"`, `ownerType: "admin"`, `createdBy` = the `X-Admin-Email` value. Same fields, validation and edit rules as the organiser API, except: `eligibility: "subscribers"` is rejected (400 `VALIDATION`), `notifyOnCreate` is ignored, and default scope = all events and players. Responses use the same `{ success: true, data }` wrapper; errors use the same codes as section 4, plus 403 `READ_ONLY`.

| Method | Path | Notes |
|---|---|---|
| GET | `/promo-codes?fundedBy=rally|organiser&tab=active|past&search&page&perPage` | all codes; each also has `ownerId`, `createdBy`. Organiser codes are read-only |
| POST | `/promo-codes` | create a Rally-funded code |
| GET | `/promo-codes/:id` | `{ promoCode, stats: { discounted, collected, redeemed, rallyFundedDiscountTotal } }` |
| PUT | `/promo-codes/:id` | edit (admin codes only; organiser codes -> 403 `READ_ONLY`) |
| DELETE | `/promo-codes/:id` | archive (admin codes only) |
| PATCH | `/promo-codes/:id/status` | `{ isActive }` pause/resume **any** code |
| GET | `/promo-codes/:id/purchases` | same as organiser (grouped per player) |
| GET | `/promo-codes/:id/purchases/export` | CSV, one row per redemption |
| GET | `/promo-redemptions` | tracking feed, below |

**GET /promo-redemptions** filters: `code`, `organiserId` (Mongo id), `eventId` (Mongo id or `E#`), `packageId` (Mongo id or `PKG#`), `fundedBy` (`rally|organiser`), `status` (one or comma-separated of reserved, confirmed, released, refunded), `from`/`to` (reservedAt range), `updatedSince` (ISO date; returns rows with `updatedAt` after it, ordered by `updatedAt` then `_id` ascending, so rows that share a timestamp keep a stable order; otherwise newest first). **A syncing client should page by calling again with `updatedSince` set to the `updatedAt` of the last row it received, not by page numbers**, because rows move while it syncs (an updated row jumps to the end of the order). Rows are never deleted, only their status changes. `perPage` max 100. `csv=true` downloads up to 5000 rows as CSV. Response: `{ redemptions: [Row], pagination }`.

Row (every row carries ids for joins, plus readable numbers):
```json
{ "redemptionId": "PRD7", "code": "SAVE20", "fundedBy": "rally", "status": "confirmed",
  "userId": "...", "playerName": "Sara K", "playerPhone": "+9715...", "playerEmail": "s@x.com", "playerGender": "female",
  "organiserId": "...", "targetType": "event", "eventId": "...", "eventNumber": "E95", "eventName": "Friday Padel",
  "occurrenceStart": "...", "packageId": null,
  "bookingId": "<Mongo _id>", "bookingNumber": "booking12", "paymentId": "<Mongo _id>", "paymentNumber": "PAY5",
  "stripePaymentIntentId": "pi_...",
  "originalAmount": 100, "discountAmount": 20, "paidAmount": 80, "vatAmount": 4, "rallyDueAmount": 20,
  "reservedAt": "...", "confirmedAt": "...", "releasedAt": null, "updatedAt": "..." }
```
`stripePaymentIntentId` is null for free (0 AED) bookings. `rallyDueAmount` is the Rally-funded discount recorded for that use (0 once refunded or released); it is a record only, how payouts use it is undecided.

**Not built yet** (plan section 10): promo-dues per organiser, settlements, per-event promo summary.

---

## 6. Runbook: migration (run on staging first, never on production without a backup)

1. `node scripts/migratePromoCodes.js` — dry run; prints how many codes lack each new field.
2. `node scripts/migratePromoCodes.js --apply` — fills defaults (never overwrites existing values) and drops the old unique `code_1` index.
3. Optional: add `--archive-existing` to archive every code that exists today (leftover test codes). **Archiving is opt-in**; there are no live codes today (decision 11), so skip it unless old test codes should disappear.
4. `npm run indexes` — creates the partial-unique `code_active_unique` index and the `promoRedemptions` indexes.
Run step 4 only after step 2, otherwise the partial index can't coexist cleanly with old data.

---

## 7. Checkout behaviour notes (M3)

- **Request**: `promoCodes: string[]` in the body (max 1 today), or the legacy `promoCode` / `promo_code` (query or body). Both can be sent; codes are upper-cased and de-duplicated.
- **Errors** from checkout use the same stable `code` values as `/quote` (response also carries `error` and `message`). `409 PAYMENT_IN_PROGRESS`: the player changed codes on a pending booking whose payment is already underway.
- **Lifecycle**: a code use is *reserved* (30 min) when the booking/payment is created, *confirmed* when the payment succeeds (webhook or verify, claim winner only), and *released* on payment failure/cancel, expiry, or when the player changes codes. A cancelled booking whose refund is processed (or that had nothing to refund, e.g. a 100% code) is *refunded*: the use is given back and `rallyDueAmount` becomes 0. A late payment for a reservation the sweeper already released is re-confirmed (the player paid), so `usedCount` can end up one above `usageLimit`.
- **Free (0 AED) with a code**: no Stripe. A Payment is written with `paymentMethod: "promo_free"`, `status: "success"`, and a synthetic `stripePaymentIntentId` (`free_<bookingId>` / `free_pkg_<purchaseId>`), so reporting joins stay consistent. A free event with no code is unchanged (no Payment).
- **Bookings/payments/package purchases** now also carry `appliedPromos[{promoCodeId, code, fundedBy, discountAmount, redemptionId}]`, `vatAmount`, `rallyFundedDiscount`, `organiserFundedDiscount`; legacy `promoCode` (first) and `discountAmount` (sum) are still set.
- **Stripe metadata** (events and packages): `organiserId, originalAmount, discountAmount, rallyFundedDiscount, organiserFundedDiscount, promoCodes (comma-separated), promoFundedBy (rally|organiser|mixed), promoCode (legacy)`.
- **Refund** on cancellation is unchanged in formula: amount paid minus 5% VAT (`amount - discountAmount`).
- **POST /api/promo-codes/validate** (legacy) now applies the same rules as `/quote` for signed-in callers and keeps its old response shape (discount on the client-sent pre-VAT amount).
