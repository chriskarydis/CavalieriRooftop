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
| Tests | 228 unit/integration; 68 browser tests (desktop and mobile); real-Stripe checks: 4 browser scenarios, 2 refund scenarios and the key check, all passing in test mode |
| Redesign (2026-10-06) | Public site rebuilt around the logo: gold on warm white, GFS Didot and Commissioner, flags for languages, own booking calendar, larger floor plan with chairs and view labels, tables on an even grid. Management pages restyled with logo, dark header and footer |
| Moving a reservation | Guest moves date or time until 24 hours before, as often as they like, picks a table again, no money moves; staff can do it for a guest at any time, change the party size and pick any table. Emails and dashboard notification |
| My reservation page | Opens a reservation from its number plus the email or phone, with limited attempts; link in the menu |
| Other changes that day | Confirmation right after payment without waiting for the webhook; clearer cancelled page; manager sees "refund sent"; blocks for a future date no longer start now; dates written dd/mm/yyyy; map on request, directions and parking on the contact page |
| Staff accounts | Developers create accounts, change roles, reset passwords and remove accounts at /manage/staff; anyone can change their own password |
| Error reporting | One log line per server error and an optional email alert, with secret links and query values removed |
| Deployment preparation | vercel.json, database client for Neon's pooler, migrations before each build, DEPLOYMENT.md |
| Docs | STATUS, ARCHITECTURE, DEPLOYMENT, TESTING, DECISIONS, BOOKING_LOGIC, TABLE_ALLOCATION, DATABASE, SECURITY, PROJECT_ANALYSIS |

## To do, in order

1. **Owner looks at the latest changes** (see "To check by hand" below) and says what to adjust.
2. **Put the site online for a trial.** The Vercel and Neon accounts exist (Neon runs PostgreSQL 18,
   which the test suite passes on). Follow DEPLOYMENT.md steps 1 to 3 with Stripe test keys. The Neon
   connection strings go straight into Vercel's settings, never into chat or the repository. Then
   create the first staff account against the Neon database.
3. **Sender domain for email:** verify cavalieriroofgarden.com at Resend (needs DNS access) so emails
   reach guests, not only the account owner.
4. **Content from the owner:** Greek dish names, view descriptions for paid tables, corrections to
   the home and contact page text, more photographs, the car parks to recommend.
5. **Before going live:** scheduled job every minute (DEPLOYMENT.md step 6), the restaurant's own
   Stripe keys and a live webhook, legal review of the privacy page, staff accounts for the
   managers, domain cut-over (DEPLOYMENT.md step 7).
6. **Nice to have:** drag a reservation to another table on the live floor (moving already works
   from the Move button), page caching, a nonce-based content security policy.

Notes for whoever runs the Stripe browser tests again: the Stripe CLI was only downloaded
temporarily; install it properly. See TESTING.md.

## To check by hand

- The three menus: wording and spellings against the printed cards, especially wines.
- The view photographs on the booking page (16 tables so far) and the photo proposal in
  `photos/protasi-fotografion.jpg`, which the owner has still to approve.
- Table 1's fifth chair did not seem to be drawn when the table was selected.

Built on 2026-10-06 and covered by automated tests, but not yet looked at by a person:

- A real card payment in Stripe test mode after the change that confirms on return from payment
  (card 4242 4242 4242 4242), and the manager's refund message with a real refund.
- Staff changing a reservation: Reservations, "Change date or time", while signed in.
- The contact page: map on request, directions, parking list.
- The emails for a moved reservation, and the new "change the date" link in the confirmation.
- The scrolling list of tables on the booking page.

Local sign-in for the management pages: a DEVELOPER account exists in the local database for the
owner's email address. Its first password was shown once in chat and should be changed at
/manage/account. If it is lost, create another with `npm run staff:create` (README).

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
| Neon connection strings (pooled and direct) entered in Vercel | Deployment |
| Which car parks to recommend, and whether the hotel has its own | Contact page |

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
- When a guest moves a reservation, tables that cost more than they paid are not offered (so no second
  payment is needed). The owner agreed on 2026-10-06.
- The "My reservation" page opens a reservation with its number and the phone or email. Safer
  alternative if wanted: email the link instead of opening it.
- Season dates are still written in words ("1 May to 10 October"); everything else is dd/mm/yyyy.
- Table positions on the floor plan were put on a grid; 80/8 and 90/9 were moved under tables 3 and 4,
  33 next to 18. Adjust in the floor-plan editor if the terrace differs.
- A chosen larger table is billed on its seats even when every smaller table is booked that evening
  (the guest can use "let us choose" to pay by party size).
- "Offered from" party sizes for combinations (TABLE_ALLOCATION.md) are engineering defaults.
- The cap of 10 unpaid holds per network address (hotels and mobile networks share addresses).
- Reminder email 24 hours before the reservation.

## Resuming work

```bash
cd C:\dev\cavalieri-roof-garden
npm run db:up
npm run db:migrate          # db:seed only on an empty database
npm run dev
npm test && npm run test:e2e
```
