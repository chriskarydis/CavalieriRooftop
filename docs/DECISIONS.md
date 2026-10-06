# Decisions

Newest first. "Owner" means the project owner's explicit instruction; "Engineering" means a
technical choice made during implementation.

## Open questions

None blocking. Still to come from the owner: Stripe test keys, Greek menu text, photography, DNS
access (once the site is nearly ready).

## 2026-10-05 (second round): owner

- **No phone reservations.** In an exceptional case staff keep a table by hand by blocking it for the
  date and time, with no deposit. Replaces the earlier "phone reservations are not built" note.
- **No dish photos.** Photos of the view from each table may be added later; not now.
- **One hold per guest.** A guest holds one seating at a time; for a party of 16 that is all the
  tables the party needs. *Engineering:* a new selection releases the previous hold, and at most 3
  unpaid holds may exist per network address.
- **Test notification address** is the developer's own, set only in the local `.env` file, which is not committed.

## 2026-10-05 (second round): engineering

- **Manage tokens are derived** (HMAC of the reservation id with a server key) so that emails can
  carry the link; the database still stores only a hash.
- **Emails go through Resend** when a key is set; without one nothing is sent and each message is
  only recorded.
- **Stripe sits behind a small gateway interface**, so payment and refund logic is tested without
  calling Stripe. It has not yet been run against Stripe itself.
- **A late payment is refunded automatically** when the table has been released, as agreed.
- **Manager refunds** are limited to cancelled and no-show reservations and need a written reason.

## 2026-10-05: engineering

- **Configuration changes never touch existing reservations.** Fees, deposit, capacity and time
  settings apply to new bookings; a reservation keeps the price and time block it was booked with.
- **Disabling a table does not cancel its reservations.** The manager is told how many upcoming
  reservations remain on it and moves them or contacts the guests.
- **A category in use cannot be deactivated**; its tables must be moved first.
- **Moving a reservation** keeps what the guest paid. The screen shows what the new table would have
  cost and records the difference; nothing is charged or refunded (owner's rule).
- **Phone reservations by staff are not built** because the deposit rule for them is unknown.
- **Dish photos are given as a web address** until file storage is set up at deployment.
- **Dates in English read day-first** (12 August 2027), as in Greece.
- **robots.txt does not list private paths**, since that would advertise them. Private pages carry
  a noindex tag and are protected by sign-in or secret tokens.
- **No cookie banner**: only strictly necessary cookies are used (language, staff session).

## 2026-10-04 (third round)

- **Owner:** every page is available in Greek and English, including the management application.
  *Engineering:* public pages carry the language in the URL (`/en`, `/el`); the management
  application has no language in its URL and remembers the staff member's choice in a cookie.
- **Owner:** the code lives at https://github.com/chriskarydis/CavalieriRooftop.
- **Engineering: payment stand-in.** Until Stripe keys exist, a "Pay (test)" button confirms the
  reservation. It only works when `ALLOW_SIMULATED_PAYMENTS=true`, no Stripe key is set, and the
  deployment is not production.
- **Engineering: scheduled jobs** (expire holds, mark late, close out no-shows) run from
  `/api/cron/tick`, protected by `CRON_SECRET`. The scheduler itself is configured at deployment.
- **Engineering: the hold link is the manage link.** After selecting a table the guest is sent to
  `/reserve/<secret token>`; the same token later opens `/reservation/<token>`. Both pages are
  marked noindex.
- **Not yet done:** rate limiting of hold creation, so one visitor cannot keep many tables held.

## 2026-10-04 (second round): business rules (Owner)

- **Cancellation 24 hours or more ahead refunds everything paid online**, deposit and table fee.
- **Two-table joins are 2+70, 3+80 and 4+90**; the three-table joins add 7, 8 and 9. This corrects
  the original specification and matches the floor plan.
- **Pairings for parties of 13 to 16** are only between physically neighbouring groups:
  (1+6)-(2+70+7), (2+70+7)-(3+80+8), (3+80+8)-(4+90+9), (4+90+9)-(5+11).
- **Table 29** is visible to guests and can be chosen online, but is never auto-assigned.
  *Engineering consequence:* because it is not a regular dinner table it does not count as the
  "smallest table type" for a party of 3, so 3 guests at a 4-seat table still pay 90. Two guests who
  choose table 29 pay for its 3 seats (90), by the same rule as any larger table.

## 2026-10-04: business rules (Owner)

- A party of 3 at a 4-seat table pays 3 x 30 = 90.
- "Let us choose" charges by party size and no table fee, and avoids fee-carrying tables unless
  nothing else is free.
- Combinations and large parties: no table fee; deposit = guests x 30.
- Tables 1, 5, 17 and 18 seat 4, or 5 with an extra chair. Two guests choosing one pay the
  minimum spend of 4. Five guests pay 150. *Engineering interpretation:* 17 and 18 are therefore
  modelled as capacity 4 / max 5, replacing the original "5-seat" listing.
- Combination capacities confirmed (see TABLE_ALLOCATION.md).
- Cancellation under 24 hours: no refund. A manager can refund manually in an emergency
  (illness with proof, restaurant closed); every such refund is audited.
- Staff do not move guests to another table on their own initiative. If the guest asks to move, no
  money is refunded or collected; the change is recorded.
- Solo diners are accepted and billed as 2 guests (60).
- Online bookings up to 16 guests; larger parties are asked to contact the restaurant.
- Hold: 10 minutes with a visible countdown. On expiry the flow restarts with a fresh floor plan.
  Other guests see a held table in orange as "being reserved" and cannot select it.
- Categories: Premium +50 (tables 1-5), Preferred +20 (6, 11, 12, 16), Best for Two +10
  (70, 80, 90), Standard for the rest.
- Menu prices are not shown publicly (`show_menu_prices` = false; prices remain optional data).
- Hosting: Vercel + Neon (EU).

## 2026-10-04: engineering

- **"Larger table" rule.** A chosen table is billed on its seats only when it has more standard
  seats than the smallest regular table type that fits the party. The comparison uses the
  restaurant's configuration, not what happens to be free that evening, so a table's price does not
  change with other guests' bookings.
- **A hold exists before the guest's details do.** The 10-minute hold starts when the table is
  selected; name, email and phone are attached afterwards and are required before payment.
- **A payment landing just after the hold's expiry is honoured** if the table has not yet been
  released to anyone else. If it has, confirmation reports `HOLD_EXPIRED` and the payment layer
  refunds in full.
- **Late and no-show.** The system marks a reservation LATE after the grace period and keeps the
  table. Staff decide: seat the guests (no time limit) or mark no-show (frees the table). If nobody
  decides, it becomes NO_SHOW when the table block ends. NO_SHOW can still be seated if the table is
  free.
- **Walk-in before a reservation.** Placing a walk-in on a table with a later reservation is refused
  unless staff confirm an override; the walk-in is then recorded as ending when the reservation
  starts.
- **Staff accounts** are created only with `npm run staff:create`; there is no sign-up. Sign-in is
  rate-limited to 5 attempts per minute per client.
- **Drizzle ORM** instead of Prisma, for first-class range types and custom constraints.
- **Double booking** is prevented by a PostgreSQL exclusion constraint on `table_allocation`,
  verified by integration tests with simultaneous bookings.
- **Reservation status and payment status are separate columns.**
- **next-intl without its build plugin.** The plugin eagerly loads `@swc/core`, whose native binding
  refuses to load on this Windows machine. `next.config.ts` sets the one alias the plugin provides.
- **Translatable database content** is stored as JSON per locale (`{ "en": ..., "el": ... }`), so a
  new language needs no schema change.
- **Repository** lives at `C:\dev\cavalieri-roof-garden`, outside OneDrive.

## Visual identity (public site)

- Taken from the restaurant's logo: gold on warm white, near-black text, thin gold lines, square buttons
  with spaced capitals. Tokens and shared classes (`btn`, `panel`, `eyebrow`, `notice`, `field`) live in
  `src/app/globals.css`.
- Headings in GFS Didot, the classic face of Greek book printing; body text in Commissioner. Both were
  chosen because their Greek is as good as their Latin.
- Languages are switched with flags (drawn as SVG so they look the same on every device); the language
  name remains the accessible label.
- Booking starts from our own calendar (`reserve/BookingForm.tsx`): closed weekdays, closed dates and
  out-of-season months cannot be picked, and the arrows skip months with no open evening. The server
  still validates every search.
- The management application keeps its plain working style.
- English text uses no semicolons (owner's preference, enforced by `messages.test.ts`).
- After a search the page scrolls smoothly to the results. The floor plan is drawn large, with a
  chair for every standard seat, and the price stays beside it on wide screens.

## Moving a reservation (guest)

Owner's rules, implemented in `src/server/services/reschedule.ts`:

- A guest may move a confirmed reservation to another date or time from their link, as often as they
  like, until the free-cancellation cut-off (24 hours before the reservation as it stands).
- Only date and time change. For a different number of guests they call the restaurant.
- They choose a table again. Their own table is suggested first, then tables of the same category.
- No money moves. A cheaper table gives no refund of the difference.
- A table that costs more than was paid cannot be picked when moving. This was not asked for
  explicitly: it was chosen so that moving never needs a second payment. A guest who wants a dearer
  table cancels (full refund, as it is before the cut-off) and books again.
- After a move the cancellation cut-off counts from the new date.
- The guest and the restaurant get an email each time, and the dashboard a notification.
- A manager's block from a date with no time starts at opening time that day, never "now".
- Staff changing a reservation for a guest (button in the reservations list, which opens the guest's
  move page while signed in) are not bound by the guest's limits: any time before the reservation,
  a different number of guests, any free table. Nothing is charged or refunded; the amounts stay as
  paid and the change is recorded with the staff member's id.

## Dates

- Dates are written dd/mm/yyyy everywhere, in both languages, with the weekday in words where it
  helps (`formatDate`, `formatLongDate` in `src/i18n/intl-locale.ts`). Native date pickers in the
  management pages follow the browser's own language setting and cannot be forced.

## Map and parking

- The contact page has a Google map that loads only when the visitor asks for it, so the site sets
  no third-party cookies by itself. Car parks are listed in `src/config/site.ts`; the owner should
  confirm and extend the list.
