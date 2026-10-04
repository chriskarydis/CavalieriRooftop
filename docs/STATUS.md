# Status and next steps

Last updated: 2026-10-04. Update this file at the end of every working session.

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
| Tests | 115 unit/integration, 13 browser tests (desktop and mobile) |
| Docs | PROJECT_ANALYSIS, DECISIONS, BOOKING_LOGIC, TABLE_ALLOCATION, DATABASE, SECURITY |

## To do, in order

1. **Settings screens:** tables (capacity, category, status, online/auto switches), categories and
   fees, combinations and pairings, opening rules, closed dates, reservation settings.
2. **Dashboard:** table details on click, move a reservation (record price difference, no refund or
   charge), manual block, disable tables in bulk (weather), phone reservation by staff, extend a
   walk-in, reservation list with search and filters, timeline view, notifications.
3. **Floor-plan editor:** drag tables, edit position and shape.
4. **Menu:** management screens and public menu (prices hidden by default).
5. **Public site:** home, experience, gallery, about, contact, terms, privacy, cookies; real design;
   SEO (metadata, sitemap, robots, structured data).
6. **Stripe:** Payment Element, webhook, refunds on cancellation, manager discretionary refund,
   cancel the payment when a hold expires. Remove reliance on the test stand-in.
7. **Emails:** confirmation, reminder, cancellation, refund; restaurant notifications (EN/EL).
8. **Analytics.**
9. **Hardening:** rate limit on hold creation, security headers, error monitoring, data retention,
   accessibility pass, browser tests for dashboard reservation actions.
10. **Deployment:** Vercel + Neon (EU), scheduler for `/api/cron/tick` every minute, production
    configuration script, DEPLOYMENT.md, TESTING.md, ARCHITECTURE.md, domain cut-over.

## Needed from the owner

| Item | Needed for |
|---|---|
| Stripe test keys (publishable, secret, webhook secret) | Step 6 |
| Greek menu text; confirm the English menu from the current site is still right | Step 4 |
| Photography: hero sunset (wide and vertical), the views, terrace at dusk, view from tables 1-5, 6/11/12/16 and 70/80/90, 8-12 dishes, cocktails; logo file | Step 5 |
| View descriptions for the paid tables (one line each) | Step 1 |
| Restaurant email address for notifications; sender address | Step 7 |
| Contact with whoever manages DNS for cavalieriroofgarden.com | Step 10 |
| Vercel and Neon accounts | Step 10 |

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
