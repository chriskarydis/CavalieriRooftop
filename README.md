# Cavalieri Roof Garden

Website, reservation system and management dashboard for Cavalieri Roof Garden, Corfu.

## Status

Built so far: project foundation, database schema, initial floor configuration, pricing engine,
table allocation engine, English/Greek routing, and a data-driven floor plan preview.

Not built yet: staff authentication, booking flow, payments, public pages, management dashboard,
emails.

## Run locally

Requires Node 20+ and Docker Desktop.

```bash
cp .env.example .env
npm install
npm run db:up        # PostgreSQL on localhost:5433
npm run db:migrate
npm run db:seed      # tables, categories, combinations, settings
npm run dev          # http://localhost:3000  (floor plan preview: /en/floor-plan)
```

## Checks

```bash
npm test             # unit tests + database integration tests (needs the database running)
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
