# Cavalieri Roof Garden

Website, reservation system and management dashboard for Cavalieri Roof Garden, Corfu.

## Status

Built so far:

- Database schema and seeded floor configuration.
- Pricing, allocation and reservation engines (availability, holds, confirmation, late/no-show,
  cancellation, walk-ins).
- Guest booking in English and Greek: search, interactive floor plan, 10-minute hold with countdown,
  details, confirmation page, self-service cancellation (`/en/reserve`, `/el/reserve`).
- Staff sign-in with roles and a live floor at `/manage`, in English and Greek: seat, no-show,
  table free, cancel, walk-ins.

Not built yet: Stripe payments (a development stand-in confirms the booking), emails, public content
pages and design, table/category/menu editors, moving a reservation, manual blocks, analytics.

## Run locally

Requires Node 20+ and Docker Desktop.

```bash
cp .env.example .env
npm install
npm run db:up        # PostgreSQL on localhost:5433
npm run db:migrate
npm run db:seed      # tables, categories, combinations, settings
npm run dev          # http://localhost:3000  (booking: /en/reserve)

# create a staff account, then sign in at http://localhost:3000/manage
STAFF_PASSWORD="at-least-12-characters" npm run staff:create -- you@example.com "Your Name" DEVELOPER
```

## Card payments in test mode

Any Stripe account has test keys; they move no real money. Create a free account at
https://dashboard.stripe.com/register, switch to test mode, and copy the two keys from
Developers > API keys into `.env`:

```
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
```

Then install the Stripe CLI and, while `npm run dev` is running, forward webhooks to the app:

```bash
stripe login
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Copy the `whsec_...` value it prints into `STRIPE_WEBHOOK_SECRET` and restart `npm run dev`. Pay with
the test card 4242 4242 4242 4242, any future expiry and any CVC. For the live site, replace the
three values with the restaurant's own keys; no code changes.

Without Stripe keys the checkout shows a "Pay (test)" button instead, when
`ALLOW_SIMULATED_PAYMENTS=true`.

## Checks

```bash
npm test             # unit tests + database integration tests (needs the database running)
npm run test:e2e     # builds, then runs browser tests on desktop and mobile against a separate database
npm run typecheck
npm run lint
```

## Layout

| Path | Contents |
|---|---|
| `src/domain` | Pure business logic: pricing, allocation. No framework or database imports |
| `src/server` | Database schema, client, seed, queries |
| `src/config/initial-floor.ts` | Initial tables, categories, combinations, settings (seed and tests only) |
| `src/ui` | Shared UI, including the SVG floor plan |
| `src/app/[locale]` | Public pages (`/en`, `/el`) |
| `src/messages` | Translations |
| `drizzle` | SQL migrations |
| `docs` | Project documentation |

## Documentation

- [docs/PROJECT_ANALYSIS.md](docs/PROJECT_ANALYSIS.md): discovery and architecture plan
- [docs/DECISIONS.md](docs/DECISIONS.md): business and technical decisions, open questions
- [docs/BOOKING_LOGIC.md](docs/BOOKING_LOGIC.md): pricing rules
- [docs/TABLE_ALLOCATION.md](docs/TABLE_ALLOCATION.md): allocation algorithm and combinations
- [docs/DATABASE.md](docs/DATABASE.md): data model
- [docs/SECURITY.md](docs/SECURITY.md): authentication, authorisation, booking integrity
- [docs/STATUS.md](docs/STATUS.md): what is done, what is next, what is needed from the owner
