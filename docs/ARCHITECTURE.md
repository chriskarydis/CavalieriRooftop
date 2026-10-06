# Architecture

One Next.js application with two faces: the public site (English and Greek) and the management
application at `/manage`. Both sit on the same domain logic and the same PostgreSQL database.

## The rule that shapes everything

**The server decides.** Availability, table allocation, prices, reservation status, cancellation and
refunds are computed on the server from the database. The browser sends only what a person chose
(a date, a time, a party size, a table) and shows what comes back.

## Layers

```
src/
  domain/      Pure rules. No database, no framework. Fully unit-tested.
  server/      Everything that touches the database or another service.
    db/          Schema, client, seeds
    services/    Use-cases: each one is a transaction that enforces the rules
    payments/    The Stripe gateway behind a small interface
    email/       Templates and the sending transport
    auth/        Staff sign-in and permission checks
  app/         Pages, server actions and API routes. Thin: validate, call a service, show the result.
  ui/          Shared components (floor plan, language switcher)
  config/      Initial data for seeding, site facts, photographs
  messages/    Every piece of text, in en.json and el.json
```

Dependencies point one way: `app` uses `server` and `domain`; `server` uses `domain`; `domain` uses
nothing. A page never queries the database for a business decision, and a service never renders.

## Domain rules (`src/domain`)

| File | Decides |
|---|---|
| `pricing.ts` | Deposit, table fee, total, amount credited to the bill |
| `allocation.ts` | Which tables or joined tables can seat a party, best first |
| `reservation-state.ts` | Which status changes are allowed |
| `cancellation.ts` | Whether a cancellation is refunded; when a reservation is late |
| `table-state.ts` | What a table is doing right now, for the live floor |
| `time.ts` | Restaurant-local dates and times, opening rules |
| `permissions.ts` | What each staff role may do |

Details: BOOKING_LOGIC.md and TABLE_ALLOCATION.md.

## Services (`src/server/services`)

| File | Use-cases |
|---|---|
| `booking.ts` | Availability, holding a table, guest details, confirmation, hold expiry |
| `floor-service.ts` | Seat, no-show, complete, cancel, walk-ins, automatic late and no-show jobs |
| `table-ops.ts` | Manual blocks, moving a reservation |
| `payments.ts` | Starting a payment, handling Stripe's results, refunds |
| `notifications.ts` | Emails and dashboard notifications for reservation events, reminders |
| `configuration.ts`, `floor-admin.ts`, `menu.ts`, `staff.ts` | What managers and developers configure |
| `live-floor.ts`, `timeline.ts`, `reservation-list.ts`, `analytics.ts` | Read models for the dashboard |
| `retention.ts` | Erasing old guest details |

Every service takes the database handle as its first argument, so tests run the same code against a
test database, and takes the acting person so the audit log can say who did what.

## The booking guarantee

`table_allocation` records which table is taken for which time span, for holds, reservations,
walk-ins and blocks alike. A PostgreSQL exclusion constraint forbids two live rows for one table from
overlapping. Double booking is therefore impossible whatever the application code does. On top of
that, allocating transactions take an advisory lock so they run one at a time and fail with a clear
"table unavailable" instead of a database error.

## Request flow for a guest booking

1. `/[locale]/reserve` (server page) calls `getAvailability` and renders the floor plan.
2. The guest picks a table; the `startHold` server action calls `createHold`, which holds the table
   for 10 minutes and stores the price as booked.
3. `/[locale]/reserve/[token]` shows the countdown, collects details, and starts the Stripe payment.
4. Stripe's webhook (`/api/stripe/webhook`) verifies the signature and calls
   `handlePaymentSucceeded`, which confirms the reservation. When the guest returns from paying
   before the webhook has arrived, the checkout page asks Stripe directly (`reconcilePayment`) and
   runs the same function. Only Stripe's own answer can confirm a reservation, never the browser.
5. `notifyReservationEvent` emails the guest and the restaurant and adds a dashboard notification.

## Languages

Public pages carry the language in the address (`/en/...`, `/el/...`). The management application has
no language in its address and remembers the staff member's choice in a cookie. Text stored in the
database (menu, categories, table descriptions) is kept per language. A test fails the build if a
text exists in one language only.

## Background work

`/api/cron/tick`, called by a scheduler with a secret, expires holds, marks late reservations, closes
out no-shows, sends reminders and applies the retention period. It is safe to call at any frequency
and to call twice.

## External services

| Service | Used for | If it is down |
|---|---|---|
| PostgreSQL (Neon) | All state | The site shows an error page; nothing is lost |
| Stripe | Card payments and refunds | Guests cannot pay; holds expire and free their tables |
| Resend | Emails | Bookings still work; the failed email is recorded in `email_log` |

## Technology choices

Recorded with their reasons in DECISIONS.md.
