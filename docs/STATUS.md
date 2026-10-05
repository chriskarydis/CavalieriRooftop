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
| Hold limits | One unpaid hold per visitor; cap of 10 per network address |
| Guest booking pages | Search, floor plan, hold with countdown, details, confirmation, cancel (EN/EL) |
| Staff | Sign-in, roles, rate limit; live floor; seat, no-show, table free, cancel, walk-in (EN/EL) |
| Settings screens | Tables, categories and fees, joined tables, neighbouring groups, reservation settings, closed dates |
| Dashboard | Table details, blocks from now or for a future date and time, move a reservation with price preview, reservations list, notifications |
| Menu | Seeded from the current site with the 14 EU allergens; management screens; public menu page, prices hidden by default; no dish photos (owner's decision) |
| Public pages | Home, contact, reservation policy, privacy and cookies, header and footer, sitemap, robots, structured data |
| Emails | Guest confirmation, reminder, cancellation; restaurant new, cancelled, no-show; EN/EL; sent once each and recorded. Not sent anywhere until an email provider key is set |
| Stripe | Payment form, webhook, automatic refund on in-policy cancellation, automatic refund of late payments, manager refund with reason. Cards only. Run against Stripe test mode with the owner's test keys (2026-10-06): pay, webhook confirmation, guest cancellation with refund, declined card then retry, staff cancellation with refund all pass. **3-D Secure card not yet verified** (see below) |
| Hardening | Security headers and CSP, no-store and no-referrer on secret links, production configuration check, error and not-found pages, optional guest-data retention, automated accessibility checks on every page |
| Timeline | Every table's evening for any date: reservations, walk-ins, blocks, holds |
| Analytics | Reservations, guests, cancellations, no-shows, deposits, table fees, kept and refunded amounts, chosen tables, walk-ins, by time and weekday |
| Floor tools | Close or reopen several tables at once; floor-plan editor (drag or arrow keys, size, rotation, shape); add a table |
| Tests | 197 unit/integration; 60 browser tests (desktop and mobile); 4 opt-in real-Stripe tests (`npm run test:stripe`), 3 passing |
| Docs | PROJECT_ANALYSIS, DECISIONS, BOOKING_LOGIC, TABLE_ALLOCATION, DATABASE, SECURITY |

## To do, in order

1. **Where we stopped (2026-10-06):** the 3-D Secure test in `tests/stripe/payment.spec.ts` fails
   because the test cannot find the "Complete" button of Stripe's test bank page inside its nested
   frames. Not yet known whether the page or the test is at fault. Next step: open the trace of that
   test to see the frame structure, fix the locator, and also try the card `4000 0025 0000 3155` by
   hand. To run these tests: start `stripe listen --forward-to localhost:3200/api/stripe/webhook`
   (the CLI was only downloaded temporarily; install it properly), then `npm run test:stripe`.
   Note for the tests: a pointer click on the pay button right after typing the card was lost in
   automation, so the tests press Enter on it; the owner confirmed by hand that a normal click works
   the first time.
2. **Re-run the standard browser suite** (`npm run test:e2e`); it last passed before the Stripe
   changes of 2026-10-06.
3. **Send a real test email** through Resend (key is in the local `.env`; sender is
   `onboarding@resend.dev`, which only delivers to the Resend account owner's address).
4. **Manager refund and late-payment refund against Stripe:** covered by logic tests, not yet by a
   real-Stripe run.
5. **Public site, remaining:** photography (the hero is a colour gradient stand-in), gallery and
   experience pages once photos exist, page caching.
6. **Error monitoring** (for example Sentry).
7. **Small dashboard item:** drag a reservation to another table on the live floor (moving already
   works from the Move button).
8. **Deployment:** Vercel + Neon (EU), scheduler for `/api/cron/tick` every minute, production
   configuration script, DEPLOYMENT.md, TESTING.md, ARCHITECTURE.md, domain cut-over.

Later, if wanted: photos of the view from each paid table (the data model has the field).

## Needed from the owner

| Item | Needed for |
|---|---|
| Stripe test keys from any Stripe account (free; see README) | Running real test payments |
| A Resend account key and a sender address | Sending real emails |
| Greek names and descriptions for the dishes (can be typed in at /manage/menu) | Menu |
| Photography: hero sunset (wide and vertical), the views, terrace at dusk, cocktails; logo file | Public site |
| View descriptions for the paid tables (can be typed in at /manage/tables) | Booking page |
| The restaurant's real notification address (the developer's own is used locally for now) | Emails |
| Contact with whoever manages DNS for cavalieriroofgarden.com | Deployment |
| Vercel and Neon accounts | Deployment |

## Text the owner should read and correct

- Home and contact pages: "on the roof of the Cavalieri Hotel, at the edge of the Spianada", "take the
  lift to the top floor", and the cuisine and bar descriptions. Written from the current site and
  general knowledge, not verified.
- Privacy page: describes what the system does. It needs the restaurant's legal adviser to review,
  especially how long reservation records are kept.
- Menu: dish spellings were corrected (for example Prosciutto, Cuttlefish, Parmesan, Soufflé). Dietary
  labels and allergens are only those the old site showed and are incomplete.
- Email wording, in both languages.

## Rules worth re-confirming when convenient

- Two guests who choose table 29 pay 90 (its 3 seats). Should that be 60?
- A chosen larger table is billed on its seats even when every smaller table is booked that evening
  (the guest can use "let us choose" to pay by party size).
- "Offered from" party sizes for combinations (TABLE_ALLOCATION.md) are engineering defaults.
- The cap of 10 unpaid holds per network address (hotels and mobile networks share addresses).
- Reminder email 24 hours before the reservation.

## Resuming work

```bash
cd C:\dev\cavalieri-roof-garden
npm run db:up
npm run db:migrate && npm run db:seed
npm run dev
npm test && npm run test:e2e
```
