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
  management pages are a text field that reads and shows dd/mm/yyyy (`DateField`), with the
  browser calendar behind a button.

## Map and parking

- The contact page has a Google map that loads only when the visitor asks for it, so the site sets
  no third-party cookies by itself. Car parks are listed in `src/config/site.ts`; the owner should
  confirm and extend the list.

## Menus and photographs (2026-10-06)

- The menu page shows three lists (dinner, bar, wine) as covers that each open in a window. A menu
  section belongs to one list (`menu_category.menu`). Content was typed from the owner's photographs
  of the printed cards, in both languages, with obvious misprints corrected. Mexican salad was
  replaced by Corfiot salad. No prices are stored or shown.
- `npx tsx scripts/sync-menu.ts` replaces the menu in a database with `src/config/initial-menu.ts`.
- View from a table: photographs named `table_12.jpg`, `table_23_24.jpg`, `table_1_a.jpg` anywhere
  under `photos/` become web images with `node scripts/prepare-table-photos.mjs` and show in the
  booking page when that table is selected. A trial for now.

## 2026-10-07

- Table 29: two guests who choose it pay for two (60), not for its three seats. Implemented as a
  per-table switch, `bill_by_seats`, editable at /manage/tables; off for table 29 only.
- View descriptions for the paid tables were written by the developer from the floor plan and the
  owner's photographs; Greek descriptions for the bar list were translated by the developer. Both
  are for the owner to read through.
- Car parks on the contact page are the three nearest public ones in OpenStreetMap, unverified.
- Live floor: dragging a table with a reservation onto another table opens the usual move preview;
  nothing changes until it is confirmed. A sound plays when a new reservation arrives (can be
  switched off per browser).
- The reservations list shows the evening's totals and prints without the navigation and buttons.
- `scripts/prepare-table-photos.mjs` has a list of photographs the owner does not want shown.
- Walk-in parties can be moved to another table (drag on the live floor, then confirm). The old table
  is free at once; the new one is theirs until the time they were expected to leave.
- On the reservations list, "Change table" and "Change date or time" open a window on the page and
  apply at once. Staff are not bound by the guest's limits; nothing is charged or refunded; the guest
  is emailed the new details. The live floor keeps its own move preview for drags.

## Reservations taken by staff (2026-10-07)

- Staff can take a reservation by hand ("New reservation" on the reservations list and live floor,
  "Reserve this table" in a table's details): name, phone, optional email, guests, date, any quarter
  hour, a table or the best free one. Owner's rules: no deposit and nothing paid online; with an
  email address the guest gets a confirmation and can cancel from its link. Such a reservation is
  marked "taken by staff", is changed only by staff, and behaves like any other otherwise.
- Closing a table is a window with plain choices: from now or a later date and time, until closing
  time or for a number of hours.

## Notes, guest history, waiting list, occasion, calendar, reviews, downloads (2026-10-07)

The owner asked for all of these; the details below were chosen by the developer and are for the
owner to confirm.

- **Menu setup page:** one list (dinner, bar, wine) per tab, so the page loads and saves faster.
- **Bell:** the header of every management page shows the number of unread notifications and plays
  the new-reservation sound; it asks the server every 20 seconds. The sound switch moved there.
- **Notes:** staff can write a note on any reservation at any time ("Add note" in the list). A
  separate standing note belongs to the guest and shows on every reservation of theirs.
- **Guest history:** every reservation stores its own copy of the guest's details, so the same
  guest is recognised by email address or by phone number (last 10 digits, at least 8). The list
  shows earlier visits and no-shows; the guest's name opens their page. Note texts are never
  written to the audit log, since they may hold health details.
- **Waiting list:** offered only when nothing is free for that date, time and party. Name, email,
  optional phone. Nothing is held and nothing is paid. When a fitting table frees (checked after
  every cancellation, move and released hold, and by the scheduled job) the first in line is
  emailed; if they have not booked after 2 hours the next is emailed too. Staff see the list under
  the day's reservations and can email or remove anyone. At most 40 per evening, 5 requests per
  15 minutes per network address. Entries are deleted the morning after the evening.
- **Occasion:** optional field at checkout and in the staff's new-reservation window (birthday,
  anniversary, proposal, other). Shown to staff everywhere the reservation is, and in the
  restaurant's email.
- **Calendar:** the confirmation page and email offer Google Calendar and an .ics file (Apple,
  Outlook). The entry lasts the configured dining time.
- **Review email:** one thank-you with the review links, to guests who were seated, between 10:00
  and 20:00 on the days after the visit (at least 10 hours after the reservation time, dropped
  after 3 days). At most once a year per address. Nothing is sent until the manager enters a
  Google or Tripadvisor link at /manage/settings.
- **Downloads:** reservations of a period and the period's figures as a real Excel workbook
  (.xlsx, written by `xlsx.ts` with no library). A CSV was tried first and opened wrongly on the
  owner's Excel, whose column separator is a comma. Amounts are numbers, text is always text. Needs the analytics permission; a
  period is at most 366 days; each reservations download is recorded in the audit log.
- **Privacy page:** three sentences added for the waiting list, staff notes and the review email.
  The page still needs legal review before launch.
- **Scheduled job on the free plan:** now 08:00 UTC (11:00 in Corfu in summer), so the daily run
  falls at a good hour for reminders and the review email.

## Later the same day (2026-10-07)

- **Closing tables for certain days:** the tool at /manage/tables now has "Select all" and "Clear
  selection", and a choice of how long. "Until I open them again" is the old behaviour (the table
  is out of service until someone changes it). "For certain days only" closes the ticked tables
  from a first to a last day, both included, at most 31 days; the day after they are open again
  with nothing to undo. A day runs from 06:00 to 06:00, so an evening that ends after midnight
  stays whole. Reservations already made for those days are never cancelled: the table is closed
  around them and the page says how many there are, so staff can contact the guests and cancel or
  refund as they decide.
- **Review links:** the owner's Tripadvisor address is the default. The Google one is the
  owner's link to the restaurant's own listing (an earlier one pointed at the hotel). Both can be changed at
  /manage/settings.
- **Times:** every time on the site is written by our own 24-hour formatter and chosen from lists,
  never typed into a browser time field, so no am/pm appears anywhere. Checked on 2026-10-07.
- **Cancelling when closing for days (owner, 2026-10-07):** stays manual for now. A switch at
  /manage/settings, off by default, lets the restaurant choose otherwise: with it on, closing
  tables for certain days first cancels the reservations still to come on those tables, refunds
  everything paid however close the date is (the restaurant is the one cancelling), and emails each
  guest that the restaurant is closed. The Tables page then warns and asks once more before
  closing. It needs the refunds permission. A refund that cannot be made is reported to staff and
  the guest's email promises no date for it. Parties already seated are never touched.
- **Reservation policy (owner, 2026-10-07):** a section was added: if the restaurant has to stay
  closed, for example because of the weather, guests are contacted and refunded everything they
  paid. Greek wording of the home page and policy agreed with the owner; "ταράτσα" is no longer used.
- **Two online reservations per guest per evening (owner, 2026-10-07):** a guest, recognised by
  email address or phone number, can hold at most two online reservations for the same evening.
  Checked when they enter their details; cancelled reservations do not count; reservations taken
  by staff are not bound by it. Until now there was no such limit (only one unpaid hold at a time,
  which still applies). The policy page states it.
- **Retention (owner, 2026-10-07):** guests' details are erased five years after their last
  reservation (`retention_months` = 60, editable at /manage/settings). The privacy page says so.
- **Privacy page:** now also mentions the 30-day browser cookie, the coded network address and
  providers based in the United States. **For the lawyer to check before launch:** the sentence on
  transfers outside the EEA (it names the EU-US Data Privacy Framework and standard contractual
  clauses without confirming which applies to each provider), the five-year period, and the
  thank-you email with review links.
