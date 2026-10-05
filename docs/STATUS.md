# Status and next steps

Last updated: 2026-10-05. Update this file at the end of every working session.

## Done

| Area | State |
|---|---|
| Project foundation | Next.js, TypeScript strict, PostgreSQL (Docker locally), Drizzle, Tailwind, next-intl |
| Database | Full schema and migrations; no-overlap constraint on table allocations |
| Floor configuration | 35 tables + spare, 4 categories, 13 combinations, 4 pairings, settings, traced floor plan |
| Pricing engine | All owner rules, tested |
| Allocation engine | Ranking, combinations, pairings up to 16 guests, tested |
| Reservation engine | Availability, 10-minute holds, confirmation, late/no-show, cancellation outcome, walk-ins |
| Guest booking pages | Search, floor plan, hold with countdown, details, confirmation, cancel (EN/EL) |
| Staff | Sign-in, roles, rate limit; live floor; seat, no-show, table free, cancel, walk-in (EN/EL) |
| Settings screens | Tables, categories and fees, joined tables, neighbouring groups, reservation settings, closed dates (EN/EL) |
| Dashboard | Table details on click, manual blocks, move a reservation with price preview, reservations list with date, status and search |
| Tests | 139 unit/integration, 17 browser tests (desktop and mobile) |
| Docs | PROJECT_ANALYSIS, DECISIONS, BOOKING_LOGIC, TABLE_ALLOCATION, DATABASE, SECURITY |

## To do, in order

1. **Dashboard, remaining:** phone reservation by staff (needs the owner's deposit rule), disable
   tables in bulk (weather), extend a walk-in, timeline view, notifications, creating a new table.
2. **Floor-plan editor:** drag tables, edit position and shape.
3. **Menu:** management screens and public menu (prices hidden by default).
4. **Public site:** home, experience, gallery, about, contact, terms, privacy, cookies; real design;
   SEO (metadata, sitemap, robots, structured data).
5. **Stripe:** Payment Element, webhook, refunds on cancellation, manager discretionary refund,
   cancel the payment when a hold expires. Remove reliance on the test stand-in.
6. **Emails:** confirmation, reminder, cancellation, refund; restaurant notifications (EN/EL).
7. **Analytics.**
8. **Hardening:** rate limit on hold creation, security headers, error monitoring, data retention,
   accessibility pass, browser tests for dashboard reservation actions.
9. **Deployment:** Vercel + Neon (EU), scheduler for `/api/cron/tick` every minute, production
    configuration script, DEPLOYMENT.md, TESTING.md, ARCHITECTURE.md, domain cut-over.

## Needed from the owner

| Item | Needed for |
|---|---|
| Stripe test keys (publishable, secret, webhook secret) | Stripe |
| Rule for reservations taken by phone: is a deposit required, and how is it paid? | Phone reservations |
| Greek menu text; confirm the English menu from the current site is still right | Menu |
| Photography: hero sunset (wide and vertical), the views, terrace at dusk, view from tables 1-5, 6/11/12/16 and 70/80/90, 8-12 dishes, cocktails; logo file | Public site |
| View descriptions for the paid tables (one line each) | Table settings (can be typed in at /manage/tables) |
| Restaurant email address for notifications; sender address | Emails |
| Contact with whoever manages DNS for cavalieriroofgarden.com | Deployment |
| Vercel and Neon accounts | Deployment |

## Rules worth re-confirming when convenient

- Two guests who choose table 29 pay 90 (its 3 seats). Should that be 60?
- A chosen larger table is billed on its seats even when every smaller table is booked that evening
  (the guest can use "let us choose" to pay by party size).
- "Offered from" party sizes for combinations (TABLE_ALLOCATION.md) are engineering defaults.

## Resuming work

```bash
cd C:\dev\cavalieri-roof-garden
npm run db:up
npm run dev
npm test && npm run test:e2e
```
