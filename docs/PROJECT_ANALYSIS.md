# Cavalieri Roof Garden — Project Discovery & Architecture Plan

Status: Phase 0 complete, awaiting approval. No application code has been written.
Date: 2026-10-04

---

## 0. Discovery findings

### Current website (cavalieriroofgarden.com)

| Item | Finding |
|---|---|
| Platform | WordPress with the VikRestaurants booking plugin, built by "alfabookonline" |
| Pages | Home, Dinner Reservation (`/book-a-table/`), Dinner Menu, My Reservation, Reservation Policy, Privacy Policy, Cookie Policy |
| Languages | English only |
| Booking flow | 3 steps: date and time → table availability → confirm. No table choice |
| Time slots | 18:30 to 23:30, every 30 minutes |
| Party size online | 2 to 9 |
| Season / hours | May to 10 October, 18:30–00:00, closed Mondays |
| Reservation lookup | "Order Number" + "Order Key" |
| Menu | Text list: Starters (5), Mains (9), Pasta (4), Salads (3), Desserts (5). Legend for Spicy / Vegetarian / Contains Nuts. No dish photos. Prices were not captured by my fetch |
| Imagery | Logo, one cover photo, one cuisine photo, one cocktails photo |
| Contact | Kapodistriou 4, Corfu Town 49100 · +30 26610 39041 · info@cavalieriroofgarden.com |
| Legal entity | ΤΟΥΡΙΣΤΙΚΑΙ ΕΠΙΧΕΙΡΗΣΕΙΣ ΚΑΒΑΛΙΕΡΙ ΜΟΝΟΠΡΟΣΩΠΗ Ε.Π.Ε., VAT EL095028031 |
| Social | Facebook, Instagram, TripAdvisor |
| Policy | Matches spec §20 and §51 exactly (€30/person, 15-minute grace, 24-hour refund cutoff, Stripe) |

### Workspace

- The project folder is empty. **The floor-plan image referenced in §12 and §65 is not in it.**
- Toolchain present: Node 25.2, npm 11.6, git 2.56, Docker 28.4. No local PostgreSQL (will run in Docker).
- The folder sits inside OneDrive. `node_modules` and build output sync badly there (file locks, slow installs). See question Q8.

---

## 1. Understanding of the requirements

One application with two faces sharing one domain core:

1. **Public site** (EN/EL): home, experience, menu, gallery, about, contact, policies, a booking flow where the table is part of the purchase, and a tokenised "manage my reservation" page.
2. **Management app** (unadvertised, authenticated): live floor plan as the main operational screen, reservations, timeline, walk-ins, tables/categories/combinations, floor-plan editor, menu, customers, analytics, settings, notifications, audit log.

The business-critical core is four server-side services: **availability**, **allocation**, **pricing**, and the **reservation state machine**. Everything else is presentation over them.

Mandatory rules as understood:

- Dinner only online; drinks are walk-in only.
- Deposit = €30 × *billable seats*. Billable seats = party size, or the table's capacity when the guest explicitly picks a larger table. The deposit is credited to the bill and is the minimum spend.
- Table-category fee is a separate line, not credit toward the bill.
- Guest dining window 120 min, table blocked 150 min, grace 15 min, refund cutoff 24 h, hold about 10 min. All configurable.
- Only configured combinations may be used. A disabled table is never offered or assigned.
- Automatic late/no-show handling is always reversible by staff.
- Double booking must be impossible at the database level.

---

## 2. Technology stack

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript strict | SSR/SEO for the public site and an authenticated app in one deployable; server actions and route handlers keep business logic on the server |
| Database | PostgreSQL 16+ | Exclusion constraints on time ranges give a hard, database-enforced no-double-booking guarantee |
| ORM | Drizzle ORM + drizzle-kit migrations | First-class support for raw SQL, `tstzrange` and custom constraints, which the availability engine depends on. Prisma would need those hand-written outside its schema |
| Validation | Zod | One schema per input, shared by forms and server |
| UI | Tailwind CSS; shadcn/ui (Radix) for the management app; bespoke components for the public site | Accessible primitives for the dense admin UI, no template look on the public side |
| Floor plan | SVG, data-driven, in a normalised 1000-unit coordinate space | Precise hit targets, scales to any screen, keyboard-focusable, same renderer for guest, manager and editor |
| i18n | next-intl, locale-prefixed routes (`/en`, `/el`) | Typed message catalogues, per-locale SEO, adding a language is adding a file |
| Auth | Better Auth, staff only, email + password (argon2), database sessions, optional TOTP | Mature, self-hosted in our DB, built-in rate limiting and reset flow |
| Payments | Stripe PaymentIntents + Payment Element, webhooks authoritative | See §10 for why not hosted Checkout |
| Email | Resend + React Email templates | Typed, bilingual, previewable templates |
| Images | Object storage (Vercel Blob or S3-compatible) + `next/image` | Manager uploads for menu and table photos |
| Jobs | Cron-triggered route handlers (reminders, late flagging, hold cleanup) | No queue infrastructure needed at this scale |
| Tests | Vitest (unit, and integration against real Postgres), Playwright (E2E) | Concurrency tests must hit a real database |
| Hosting | Vercel + Neon Postgres (EU region); Docker Compose for local dev | No server for the restaurant to maintain; EU data residency |

Rejected: separate SPA + API (two deployables, no benefit here); a hosted auth SaaS (unnecessary for a handful of staff accounts); WebSockets (dashboard uses 5-second polling, which is simpler and reliable on serverless).

---

## 3. System architecture

```
src/
  app/
    [locale]/(public)/...     public pages, booking flow, /reservation/[token]
    (manage)/manage/...       management app, noindex, session + role required
    api/stripe/webhook        Stripe events
    api/cron/*                scheduled jobs (secret-protected)
  domain/                     pure TypeScript, no framework or DB imports
    pricing/                  price(quote input) -> breakdown
    allocation/               candidate generation + scoring
    availability/             interval maths
    reservation/              state machine, cancellation policy
    time/                     Europe/Athens service-day helpers
  server/
    db/                       Drizzle schema, migrations, seed
    services/                 transactional use-cases (createHold, confirm, move, cancel, walkIn...)
    auth/  payments/  email/  notifications/  audit/
  ui/                         shared components, floor-plan renderer
  messages/                   en.json, el.json
```

Rules:

- `domain/` is pure and fully unit-tested. `services/` is the only layer that writes to the database, and every write path (guest booking, manager action, drag-and-drop, webhook) goes through the same service functions.
- UI components never compute prices, availability or status. They render what the server returns.
- All times stored as UTC `timestamptz`; all business reasoning done in `Europe/Athens`.
- All money stored as integer cents.

---

## 4. Database model

Core tables (abridged; full column list goes in DATABASE.md in Phase 1).

**Configuration**
- `restaurant_settings` — typed single row: deposit per person, dining minutes, block minutes, grace minutes, refund cutoff hours, hold minutes, booking lead time, min/max online party, slot list, timezone, notification addresses, reminder timing.
- `opening_rules`, `closures` — season dates, weekly closed days, one-off closed dates.

**Floor**
- `floor_plan` — name, canvas size, static shapes (walls, bar, kitchen, toilets, entrance) as JSON.
- `table_category` — name (EN/EL), description, `extra_fee_cents`, `fee_counts_toward_min_spend` (default false), priority, colour, display order, active.
- `dining_table` — number (unique), capacity, category, `status` (ACTIVE / INACTIVE / OUT_OF_SERVICE), status reason, `is_spare`, allocation priority, `online_bookable`, view description (EN/EL), photo, notes, and position: x, y, width, height, rotation, shape.
- `table_combination` — name, `capacity` (explicit, not summed), `min_party`, active, `online_bookable`, priority.
- `table_combination_member` — combination ↔ table.

**Bookings**
- `customer` — name, email, phone, locale, marketing consent. No account required; nullable `user_id` for a future account feature.
- `reservation` — public reference (`CRG-####`), hashed manage token, customer, start time, party size, status, source (ONLINE / STAFF), `selection_mode` (AUTO / CHOSEN), combination used (nullable), locale, guest notes, staff notes, **price snapshot** (deposit per person, billable seats, deposit cents, table fee cents, total cents, credit cents, category name at time of booking).
- `walk_in` — optional name, party size, kind (FOOD / DRINKS), arrival, expected duration, notes, status.
- `table_allocation` — **the single source of truth for who holds which table when.** Columns: table, `period tstzrange`, kind (HOLD / RESERVATION / WALK_IN / BLOCK), reservation or walk-in reference, `expires_at` (holds only), `released_at`. One row per physical table, so a three-table combination writes three rows.

  ```sql
  EXCLUDE USING gist (table_id WITH =, period WITH &&) WHERE (released_at IS NULL)
  ```
- `reservation_event` — append-only status history with actor and reason.

**Money**
- `payment` — reservation, Stripe PaymentIntent id (unique), amount, status, deposit and fee portions.
- `refund` — payment, Stripe refund id, amount, reason, initiated by, status.
- `stripe_event` — processed event ids, for idempotent webhooks.

**Content**
- `menu_category`, `menu_item` (names and descriptions EN/EL, price, flags: vegetarian, vegan, spicy, signature, chef's recommendation, available, sort order), `menu_item_image`, `allergen`, `menu_item_allergen`.

**System**
- `user`, `session`, `account`, `verification` (Better Auth), with `role` enum MANAGER / DEVELOPER.
- `notification` — dashboard notifications with read state.
- `email_log` — template, recipient, status, provider id.
- `audit_log` — actor, action, entity, before/after JSON, timestamp.

---

## 5. Reservation engine

### Reservation status and payment status are separate

The spec lists REFUNDED, PARTIALLY_REFUNDED and PAYMENT_FAILED among reservation states. I propose keeping them on the payment instead, because a reservation can be CANCELLED and its payment REFUNDED at the same time, and one column cannot say both.

**Reservation status**

```
PENDING_PAYMENT -> CONFIRMED            (verified webhook)
PENDING_PAYMENT -> EXPIRED              (hold lapsed or payment failed)
CONFIRMED       -> SEATED | LATE | CANCELLED
LATE            -> SEATED | NO_SHOW | CANCELLED
NO_SHOW         -> SEATED               (manager override, needs a free table)
SEATED          -> COMPLETED
CANCELLED       -> CONFIRMED            (developer role only, for corrections)
```

"Arriving" is not stored. It is a display state derived from the clock (confirmed and starting within 30 minutes).
"Arrived" and "Seated" are one action in the first version.

**Payment status:** REQUIRES_PAYMENT, SUCCEEDED, FAILED, PARTIALLY_REFUNDED, REFUNDED.

Transitions live in one table in `domain/reservation` and every change goes through `transition(reservation, to, actor, reason)`, which validates, writes `reservation_event` and `audit_log`.

### Late and no-show

- A job running every minute moves CONFIRMED reservations past start + grace to LATE and raises a dashboard notification. The table allocation stays in place but is flagged releasable.
- Staff choose: seat the guests (any time, no time limit), or mark no-show, which releases the table.
- At end of service, anything still LATE becomes NO_SHOW.
- NO_SHOW → SEATED remains possible. If the original table has been reused, the manager is asked to pick another.
- The deposit is retained in both cases. No automatic refund is ever issued for a no-show.

### Table state (derived, never written by the client)

Computed on the server from `dining_table.status` plus current and upcoming allocations:
OUT_OF_SERVICE, BLOCKED, HELD, OCCUPIED, LATE, ARRIVING, RESERVED, AVAILABLE_SOON, CLEANING, AVAILABLE.
CLEANING is the buffer between the dining window ending and the block ending, or until staff press "table ready".

### Holds and concurrency

1. Guest confirms a table. In one transaction: delete expired holds on the candidate tables, insert HOLD allocation rows (`expires_at = now + hold minutes`), create the reservation as PENDING_PAYMENT with its price snapshot, create the PaymentIntent.
2. If another guest inserts an overlapping row, PostgreSQL rejects it through the exclusion constraint. The service maps that error to "this table has just been taken" and returns fresh availability.
3. On `payment_intent.succeeded`, the hold rows become RESERVATION rows and the status becomes CONFIRMED.
4. Expired holds are ignored by availability reads and deleted lazily and by a cleanup job. An abandoned checkout can never block a table.
5. Late-payment race (payment succeeds after the hold expired and someone else took the table): try to re-allocate an equivalent table of the same category and capacity; otherwise refund in full automatically and tell the guest. This needs your sign-off (Q7).

The guarantee does not depend on application code being correct: the constraint makes a double booking unrepresentable.

### Cancellation

`cancellationOutcome(reservation, now, settings)` returns whether the refund is full or nil. Boundary: refundable when `start − now ≥ 24 h`, to the second. The guest sees the outcome before confirming. Staff can cancel with an explicit refund override, which is audited.

---

## 6. Pricing engine

One pure function, `price(input) → PriceBreakdown`, used by the booking UI, the summary step, PaymentIntent creation, emails and the dashboard.

```
input:  partySize, selectionMode, tables[] or combination, category, settings
output: depositPerPerson, billableSeats, depositCents (= credit toward bill = minimum spend),
        tableFeeCents, totalCents, refundableNowCents, explanation[] (i18n keys + values)
```

- `billableSeats` = party size when auto-assigned; `max(party size, seating capacity)` when the guest chose the table. For a combination, the seating capacity is the combination's configured capacity.
- `tableFeeCents` = category fee. For a combination, the highest member fee (proposal, see Q3).
- The breakdown is snapshotted on the reservation at booking. Later price changes never alter existing bookings.
- The server recomputes on every step. A client-sent amount is never read.

Spec examples as test cases: 2 at a 2-top → €60; 2 choosing a 4-top → €120; 2 choosing a premium 5-top → €150 + €50 = €200, credit €150.

---

## 7. Table allocation

**Candidates:** every active single table and every active combination where `min_party ≤ party ≤ capacity`, all member tables are active, and all are free for the full block window.

**Ranking** (compare in order; lower wins):

1. Empty seats (capacity − party).
2. Number of physical tables (a single table beats a combination).
3. Category fee, then category priority. Keeps paid tables for guests who choose them.
4. Combination damage: how many configured combinations become unusable for that window. Seating a couple at table 19 beats table 7, because 7 is needed for 2+7.
5. Manager-set table priority.
6. Table number, for determinism.

The same function powers guest auto-assignment, walk-in suggestions and move suggestions. It returns the ranked list with reasons, so the dashboard can show why a table was suggested.

**Large parties:** if no single candidate fits, the engine may propose two groups, but only from pairs the manager has explicitly marked as "can seat one party together". None are seeded. Until configured, parties above the largest combination see "please contact us". The engine never infers adjacency from coordinates.

**Seeded combinations** (capacities are proposals, see Q4):

| Combination | Proposed capacity |
|---|---|
| 1+6 | 8 |
| 1+6+12 | 12 |
| 2+7 | 6 |
| 2+7+70 | 8 |
| 3+8 | 6 |
| 3+8+80 | 8 |
| 4+9 | 6 |
| 4+9+90 | 8 |
| 5+11 | 8 |
| 5+11+16 | 12 |
| 23+24 | 7 (as specified) |
| 18+33 | 7 |
| 17+spare | 7, inactive until the spare table is enabled |

---

## 8. Floor plan

- One `<FloorPlan>` SVG renderer fed by data, with three modes: guest (select), manager (live status, drag-and-drop), editor (move, resize, rotate).
- Tables are `<g role="button">` elements with labels such as "Table 12, 4 guests, Preferred view, plus €20, available". Arrow-key and tab navigation. A parallel list view gives the same choices without the map.
- Mobile: pinch-zoom and pan, minimum 44 px touch targets, a bottom sheet for table details.
- Guest view shows only bookable tables as selectable; inactive tables are not rendered at all. Combinations appear as a highlighted group when the party size needs one.
- Manager drag-and-drop calls the same `moveReservation` service as the menu action, and shows the financial-change confirmation before committing.
- Editor (first version): drag to position, edit number, capacity, category, status, description and photo in a side panel, manage combinations in a list. Free-form drawing of walls is out of scope for the first version.

---

## 9. Authentication and authorisation

- Staff accounts only. No public sign-up; accounts are created by a developer or by invitation.
- Management app lives at `/manage`, excluded in `robots.txt`, sent with `noindex`, and never linked from the public UI.
- Sessions in the database, cookies `HttpOnly`, `Secure`, `SameSite=Lax`. Login and reset rate-limited. Optional TOTP.
- Every service function starts with `requireRole(...)`. Middleware redirects are a convenience, not the control.
- MANAGER: all operational features. DEVELOPER: plus user management, system settings, email and webhook logs, audit log export, state corrections.
- Guests: manage link carrying a 256-bit random token; only its hash is stored. The lookup endpoint is rate-limited.

---

## 10. Stripe

- **PaymentIntents + Payment Element embedded in the booking flow**, not hosted Checkout. Hosted Checkout sessions cannot expire in under 30 minutes, which conflicts with a 10-minute table hold. The embedded element also keeps the guest inside the bilingual flow and supports cards, Apple Pay and Google Pay with SCA handled by Stripe. Card data never touches our server.
- Amount comes from the server price snapshot. Metadata carries the reservation id.
- Webhook (`payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `refund.updated`) with signature verification and an idempotency table. Only the webhook confirms a reservation. The return page polls for status and never confirms anything itself.
- Refunds are created by the server through the cancellation service, with idempotency keys, and recorded in `refund`.
- Test mode keys throughout development; Stripe CLI for local webhooks.

---

## 11. Email

- React Email templates, EN and EL, selected by the reservation's locale: confirmation, reminder, modification, cancellation, refund. Restaurant templates: new booking, modification, cancellation, refund, no-show.
- Sending is recorded in `email_log` and is idempotent per (reservation, template, event), so webhook retries cannot send duplicates.
- Restaurant emails carry name, party, time, table and reference only.
- Reminder job with configurable lead time (default: the morning of the reservation).
- Requires DNS records (SPF, DKIM) on cavalieriroofgarden.com.

---

## 12. Testing

| Layer | Scope |
|---|---|
| Unit (Vitest) | Pricing (all §63 cases), allocation ranking, state-machine transitions, cancellation boundary at exactly 24 h, grace threshold, time-zone and DST edges |
| Integration (Vitest + Postgres in Docker) | Overlap and non-overlap, the 30-minute buffer, hold expiry, **20 parallel bookings for one table → exactly one succeeds**, every seeded combination, disabled tables, walk-in conflict and override, move validation, role checks on every service |
| Stripe | Webhook handler with signed fixtures; success, failure, duplicate event, late payment, refund |
| E2E (Playwright) | Full booking on mobile and desktop viewports in both languages, guest cancellation, manager seat / no-show / override, walk-in, menu edit |
| Accessibility | axe checks in E2E; keyboard-only booking run |

---

## 13. Deployment

- Vercel (production + preview deployments), Neon Postgres in an EU region with point-in-time recovery, object storage for images, Resend, Stripe.
- Migrations run in CI before deploy. Seed is for development only; production gets a one-off "initial configuration" script (tables, categories, settings) with no sample bookings.
- Secrets only in environment variables, validated at boot with Zod.
- Error monitoring (Sentry) and structured logs with PII redaction.
- Cut-over: the new site goes live on the existing domain between seasons. The season ends 10 October, so winter is the natural window. Existing future bookings in the WordPress plugin, if any, would be entered by hand.

---

## 14. Risks and edge cases

1. **Floor-plan image missing.** Positions, and a sanity check of combinations against the physical layout, depend on it.
2. **Money rules with gaps** (Q1–Q5). I will not guess these.
3. **Accounting.** The table fee is revenue at booking time, while the deposit is a prepayment settled at the table. Greek receipt and myDATA handling of the fee needs the restaurant's accountant. The system will report the two amounts separately.
4. **No POS.** The dashboard shows "deposit to deduct: €X" per table; deducting it remains a manual step for staff.
5. **Late-payment race** after hold expiry (§5).
6. **Staff moving a reservation to a different price.** The system warns and records the difference; whether money is collected or refunded is Q5.
7. **Last slot 23:30** with a 00:00 close and a 2-hour dining window. Seeded as the current site has it; slots are configurable.
8. **Time zone and DST.** The season avoids both clock changes, but the code handles them.
9. **Rooftop weather.** Bulk "disable tables / block evening" action is included; affected bookings are listed for staff to contact. Refund handling for restaurant-initiated cancellation is a staff decision with override.
10. **Content.** Only four photos exist on the current site, and no per-table photos. A premium visual site needs real photography. Menu prices and Greek translations are needed.
11. **GDPR.** Privacy and cookie pages, consent only for non-essential cookies, retention policy for customer data (proposal: anonymise 24 months after the visit).
12. **Abuse.** Rate limits on hold creation, so tables cannot be locked up by repeated abandoned checkouts.

---

## 15. Implementation phases

Each phase ends with passing tests, updated docs and a short demo.

| Phase | Deliverable |
|---|---|
| 1. Architecture | ARCHITECTURE, DATABASE, BOOKING_LOGIC, TABLE_ALLOCATION, SECURITY, DECISIONS; final schema |
| 2. Foundation | Repo, tooling, Docker Postgres, Drizzle schema and migrations, auth and roles, settings, i18n shell, logging, error handling |
| 3. Tables and floor plan | Tables, categories, combinations, seed, SVG renderer, manager view, first editor |
| 4. Reservation engine | Availability, allocation, holds, state machine, late/no-show, overrides, concurrency tests |
| 5. Payments | PaymentIntents, webhooks, refunds, reconciliation |
| 6. Public site | Design system, all pages, booking flow, manage-reservation page, SEO |
| 7. Management app | Live floor, reservations, timeline, walk-ins, menu, customers, analytics, settings |
| 8. Notifications | Emails, dashboard notifications, reminders |
| 9. Testing | E2E, mobile, accessibility, load on the booking path |
| 10. Production readiness | Security review, performance, backups, monitoring, DEPLOYMENT, cut-over plan |

Phase 4 is built before the public site on purpose: the engine is the product, and the UI should be shaped by what it returns.

---

## 16. Questions

### Blocking (money or allocation rules; needed before Phase 4)

**Q1. Odd-sized parties and the "larger table" rule.** There is one 3-seat table and no 1-seat table. If 3 guests choose a 4-seat table themselves, do they pay 3 × €30 or 4 × €30? Options:
- (a) Always capacity when the guest picks the table (3 guests → €120).
- (b) Capacity only when a smaller suitable table type exists in the restaurant for that party size; otherwise party size. *My recommendation*, but it is a pricing rule and yours to set.

**Q2. Auto-assignment and table fees.** When the guest picks "let us choose" and the system lands on a Preferred or Premium table, is the fee charged? I propose no fee and party-size deposit, with the allocator avoiding paid tables unless nothing else is free.

**Q3. Fee on a combination.** If a combination includes tables of different categories, is the fee the highest member's, the sum, or set per combination?

**Q4. Combination capacities.** Please confirm or correct the table in §7. Joined tables often seat fewer than the sum, as with 23+24 = 7. Also: is the minimum spend for a chosen combination based on its capacity, as with single tables?

**Q5. Is the table fee refundable?** On a cancellation more than 24 hours ahead, is it refunded along with the deposit? And when staff move a guest to a cheaper or dearer table, is the difference refunded or collected, or only recorded?

**Q6. Online party limits.** The current site allows 2 to 9. Keep that? Are solo diners allowed online? Above the maximum, should the site say "contact us"?

**Q7. Late-payment race.** If a payment completes after the hold expired and the table is gone, is "equivalent table if one exists, otherwise automatic full refund" acceptable?

### Needed, but not blocking the start

**Q8. Repository location.** May I create the repository outside OneDrive (for example `C:\dev\cavalieri-roof-garden`)? Otherwise OneDrive should be told to ignore `node_modules` and `.next`.

**Q9. Floor-plan image.** Please add it to the project folder. It is needed for Phase 3.

**Q10. Initial categories.** Which tables are Standard, Preferred and Premium, and at what fees? Until told, all tables are seeded as Standard and the two paid categories exist with the example fees but no tables.

**Q11. Hosting.** Is Vercel + Neon (managed, roughly €20–45 per month) acceptable, or does the restaurant want a single VPS?

**Q12. Accounts and assets.** Access to the existing Stripe account (test keys are enough for now), who controls DNS for the domain, menu prices, Greek menu text, and photography.
