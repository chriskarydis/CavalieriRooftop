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
