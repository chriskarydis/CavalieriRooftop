# Status and next steps

Last updated: 2026-10-06. Update this file at the end of every working session.

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
| Public pages | Home, gallery, contact, reservation policy, privacy and cookies, header and footer, sitemap, robots, structured data. Uses the owner's photographs (16 chosen from the first batch), logo and knight favicon |
| Emails | Guest confirmation, reminder, cancellation; restaurant new, cancelled, no-show; EN/EL; sent once each and recorded. Sample emails were sent through Resend on 2026-10-06 (`npm run email:check`). Until a sender domain is verified, Resend delivers only to its account owner's address |
| Stripe | Payment form, webhook, automatic refund on in-policy cancellation, automatic refund of late payments, manager refund with reason. Cards only. Run against Stripe test mode with the owner's test keys (2026-10-06): pay, webhook confirmation, guest cancellation with refund, declined card then retry, 3-D Secure card, staff cancellation with refund, automatic refund of a late payment and manager refund all pass |
| Hardening | Security headers and CSP, no-store and no-referrer on secret links, production configuration check, error and not-found pages, optional guest-data retention, automated accessibility checks on every page |
| Timeline | Every table's evening for any date: reservations, walk-ins, blocks, holds |
| Analytics | Reservations, guests, cancellations, no-shows, deposits, table fees, kept and refunded amounts, chosen tables, walk-ins, by time and weekday |
| Floor tools | Close or reopen several tables at once; floor-plan editor (drag or arrow keys, size, rotation, shape); add a table |
| Tests | 209 unit/integration; 66 browser tests (desktop and mobile); real-Stripe checks: 4 browser scenarios, 2 refund scenarios and the key check, all passing in test mode |
| Staff accounts | Developers create accounts, change roles, reset passwords and remove accounts at /manage/staff; anyone can change their own password |
| Error reporting | One log line per server error and an optional email alert, with secret links and query values removed |
| Deployment preparation | vercel.json, database client for Neon's pooler, migrations before each build, DEPLOYMENT.md |
| Docs | STATUS, ARCHITECTURE, DEPLOYMENT, TESTING, DECISIONS, BOOKING_LOGIC, TABLE_ALLOCATION, DATABASE, SECURITY, PROJECT_ANALYSIS |

## To do, in order

1. **Put the site online for a trial** (owner is creating Vercel and Neon accounts): follow
   DEPLOYMENT.md steps 1 to 3 with Stripe test keys.
2. **Sender domain for email:** verify cavalieriroofgarden.com at Resend (needs DNS access) so emails
   reach guests, not only the account owner.
3. **Content from the owner:** Greek dish names, view descriptions for paid tables, corrections to
   the home and contact page text, more photographs.
4. **Before going live:** scheduled job every minute (DEPLOYMENT.md step 6), the restaurant's own
   Stripe keys and a live webhook, legal review of the privacy page, staff accounts for the
   managers, domain cut-over (DEPLOYMENT.md step 7).
5. **Nice to have:** drag a reservation to another table on the live floor (moving already works
   from the Move button), page caching, a nonce-based content security policy.

Notes for whoever runs the Stripe browser tests again: the Stripe CLI was only downloaded
temporarily; install it properly. See TESTING.md.

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
