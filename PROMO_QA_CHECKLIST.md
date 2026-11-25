# Promo codes: QA checklist

Run this on **staging with Stripe test mode** (never production, never live keys). Branches: `feature/promo-codes` in `rallybackend-api` and `rallyFrontend`. Contract: `PROMO_API.md`.

Test cards (Stripe test mode): success `4242 4242 4242 4242`, declined `4000 0000 0000 0002`, any future expiry and any CVC.

## 0. Before you start

- [ ] Deploy the backend branch to **staging** first, then build the app against it.
- [ ] Take a backup/snapshot of the staging database.
- [ ] `node scripts/migratePromoCodes.js` (dry run) and read the output.
- [ ] `node scripts/migratePromoCodes.js --apply` (add `--archive-existing` only if you want old test codes archived).
- [ ] `npm run indexes` (creates the partial-unique code index and the `promoRedemptions` indexes). The migration must run first.
- [ ] Have these ready: one organiser account with a paid event (about 100 AED), 2-3 player accounts, one player who follows that organiser, an admin key for `X-Admin-Key` / `X-Admin-Email`.
- [ ] Stripe webhook points at staging (or use the Stripe CLI to forward `payment_intent.*` events).

## 1. Organiser app

**Create a code** (Settings > Promo Codes > + Create Promo Code)
- [ ] Settings shows a "Promo Codes" row; the list opens with the three header numbers (Discounted / Active Codes / Redeemed).
- [ ] Create `PADEL20`, 20%, Total uses 20, per player 1, no expiry, Everyone, notify ON. The code appears under **Active**.
- [ ] A code with a space or under 3 characters is rejected on the form. Only percentage codes can be created, 1 to 99: 0, 100 and 150 are rejected, and so is any fixed-AED code (the form has no AED option; a direct API call with `discountType: "fixed"` or `discountValue: 100` returns 400).
- [ ] "No limit" turns the Total uses field off; the card then shows "N used . unlimited".
- [ ] Blank "Usage per player" means unlimited. An expiry date in the past is rejected. "Clear expiry date" works.
- [ ] Creating the same code twice shows an error (a code is unique among non-archived codes).
- [ ] Notify ON: a subscriber receives a push and an in-app notification ("... has a promo code for you"). A non-subscriber does not. (A code that starts in the future cannot notify: you should see an error.)

**List and card**
- [ ] Card shows code with a copy button (copy works and says "Code copied"), "20% off" (an old fixed record, if any, shows "AED 25 off"), the sport tag ("All Sports" / "Padel only"), the eligibility tag only for First bookings / Subscribers, the usage bar, and the expiry text ("Ends 30 Nov", "No end date", "Ends in 2 days" in red when 3 days or less).
- [ ] The pause switch pauses and resumes; a paused code cannot be redeemed by a player (see section 2).
- [ ] The **Past** tab shows expired, used-up and archived codes; the switch is disabled there.
- [ ] Pull to refresh works; scrolling to the bottom loads more when there are more than 20 codes.

**View Code**
- [ ] Tapping a card opens View Code: Discounted, Collected (what players paid excluding VAT) and Redeemed match your test purchases.
- [ ] Purchases are grouped per player with uses, phone, email and "last used ...". Search by name/phone/email, the Gender filter and the Most Recent / Most uses sort all work.
- [ ] **CSV**: iOS opens the share sheet; Android asks for a folder. The file shows player names, the booking number (not a raw id), the event number (E#) and amounts. Open it in Excel and check non-English names read correctly.
- [ ] **Share** opens the share sheet with a message containing the code.
- [ ] **Pause Code** / **Resume Code** at the bottom works. There is **no Edit button** (hidden on purpose).

**Transactions**
- [ ] A booking that used a code shows "Promo CODE"; one that used a Rally code also shows "Rally covers AED X".

## 2. Player checkout (Stripe test mode)

Use an event priced 100 AED, player A, code `PADEL20` (20% off).

**Paid booking with a code**
- [ ] In the booking modal, enter the code and tap the arrow: the summary shows Reservation 100.00, Promo -20.00, VAT 4.00, **Total 84.00** (all from the server). Removing the code returns to 105.00.
- [ ] Pay with `4242...`. The booking confirms and the confirmation screen shows the discount and VAT rows.
- [ ] In Stripe (test) the PaymentIntent is 84.00 AED with metadata: `originalAmount, discountAmount, rallyFundedDiscount, organiserFundedDiscount, promoCodes, promoFundedBy, organiserId`.
- [ ] The organiser's list now shows the code "1 used"; View Code shows Discounted 20, Collected 80, Redeemed 1.
- [ ] No code typed or an unapplied code: the app never sends unvalidated text.

**Code errors** (each shows a friendly message, no booking is created)
- [ ] Unknown code. Expired code. Code that has not started. Paused code.
- [ ] Code fully redeemed (set Total uses to 1, use it, try with player B).
- [ ] Player A tries a once-per-player code a second time.
- [ ] First-bookings-only code for a player who already booked with this organiser. Subscribers-only code for a player who does not follow the organiser (and works after they follow).
- [ ] A code from a different organiser on this event. A Padel-only code on a Tennis event.
- [ ] A code with a minimum spend above the price. A free event (price 0): codes are not accepted.

**Payment problems**
- [ ] Pay with the declined card `4000 0000 0000 0002`: the use is given back (organiser list shows "0 used" again after the failure).
- [ ] Open the booking modal with a code, close the app without paying, wait 30+ minutes: the use is released by the expiry sweeper (and the PaymentIntent is cancelled).
- [ ] Apply a code, then remove it and pay: the earlier reservation is released and you are charged the full 105.00.

**Free bookings (100% codes) are no longer possible**
- [ ] Admin and organiser create/edit both reject `discountValue: 100` and `discountType: "fixed"` with 400 `VALIDATION`.
- [ ] A 99% code on an event works as a normal paid booking (see Small total below); there is no Stripe-skipping path in the app any more.

**Small total**
- [ ] On a 10 AED event, apply a 99% code: the total is exactly **2.00 AED** (Stripe's minimum) and payment works.
- [ ] On an event under about 1.91 AED a code is refused ("doesn't apply to this booking").

**Cancel and refund**
- [ ] Cancel a paid booking more than 24h before: the refund is **amount paid minus VAT** (84 paid, 80 refunded, 4 VAT kept) and the code use is given back (usedCount goes down by 1).
- [ ] Cancel under 24h before: no refund and the redemption stays confirmed.
- [ ] Cancel a booking you have not paid for yet: the code use is released immediately.
- [ ] If an event fills up while a player is paying, the automatic refund also gives the use back.

**Packages (backend only, no app UI)**
- [ ] `POST /api/packages/:id/purchase` with `{ "promoCodes": ["CODE"] }` returns the discounted amount and Stripe metadata. (Use Postman or curl.)

**Older app builds**
- [ ] An older build that sends `?promoCode=CODE` on `book-event` still gets the discount. The old `/api/promo-codes/validate` still answers in its old shape.

## 3. Admin API (X-Admin-Key + X-Admin-Email)

Replace `$KEY` and `$BASE`. In PowerShell use `curl.exe`.

- [ ] No key: `curl.exe -i $BASE/api/admin/promo-codes` returns 401. Wrong key returns 401/403.
- [ ] `GET /api/admin/promo-codes?fundedBy=organiser` lists organiser codes; `?fundedBy=rally` lists Rally codes.
- [ ] `POST /api/admin/promo-codes` creates a Rally-funded app-wide code (`createdBy` is the admin email). `"eligibility":"subscribers"` is rejected.
- [ ] A Rally code works for any player on any event; a player using it shows `fundedBy: "rally"` in the redemption and the price is lowered (e.g. 100 AED, 20% -> player pays 84).
- [ ] `PUT` and `DELETE` on an **organiser** code return 403 `READ_ONLY`; `PATCH .../status` pauses it. `DELETE` on a Rally code archives it (it never disappears from the database).
- [ ] `GET /api/admin/promo-redemptions` filters work: `code`, `organiserId`, `eventId` (id or E-number), `packageId`, `fundedBy`, `status`, `from`/`to`, `updatedSince`; `perPage` stops at 100; `csv=true` downloads a CSV.
- [ ] Rows show `rallyDueAmount` equal to the discount for a Rally code, and 0 after the booking is cancelled and refunded. (This is a record only; payouts are not changed.)
- [ ] Each admin call appears in the `adminAuditLog` collection.

## 4. Security and data checks

- [ ] Organiser B cannot open, edit, pause, archive, export or notify on organiser A's code (the app and API answer "not found").
- [ ] A player account cannot create a code (403).
- [ ] In the database, a code with 3 total uses and 10 simultaneous checkouts ends with exactly 3 reserved/confirmed redemptions (`usedCount` = 3).
- [ ] Sending the Stripe `payment_intent.succeeded` event twice (resend from the Stripe dashboard) confirms the use once and does not double-count `usedCount`.

## 5. Rollout notes

- Deploy order: backend (staging, then production), run the migration and `npm run indexes`, then ship the app build. The new app sends `promoCodes[]`; the backend accepts both that and the old single `promoCode`.
- `eslint` is a **dev** dependency only; the Elastic Beanstalk production install does not include it. I did not deploy anything or change any EB configuration.
- Backend `main` and your uncommitted `.gitignore` line (`scripts/checkPackages.js`) were left untouched.
- The frontend's lint/type baseline fixes are separate commits at the start of the branch; open them as their own PR ahead of the promo PR so the promo diff stays reviewable.
- Not built yet (plan section 10, waiting on the client's answers): anything that pays organisers Rally's share, promo-dues per organiser, settlements, the Lovable panel changes, the Edit screen, and any package promo UI.

## 6. Known limits

- A late payment for a reservation the sweeper already released is re-confirmed (the player paid), so a code's used count can end one above its total limit.
- The app applies one code per order. The backend already accepts several (`MAX_PROMO_CODES_PER_ORDER`).
- On Android the CSV is saved through a folder picker; there is no share sheet for the file.
- Edit is backend-only (`PUT /api/promo-codes/:id`); the app has no Edit screen yet.
- The 1 failing frontend test file `__tests__/App.test.tsx` (the default template test) fails before and after this feature because jest cannot load Expo's ES module setup. It is unrelated to promo codes.
