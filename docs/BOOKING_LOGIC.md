# Booking logic

Code: `src/domain` (pure rules) and `src/server/services` (transactions).
Tests: `src/domain/*.test.ts` and `tests/integration`.

## Pricing

`price()` is the only place amounts are calculated. Its result is shown to the guest, sent to
Stripe, written to emails and stored on the reservation as a snapshot. Money is integer cents.

Two amounts are always kept apart:

| Amount | Meaning | Credited to the final bill |
|---|---|---|
| Deposit | billable seats x deposit per person (30). Also the minimum spend | Yes, in full |
| Table fee | the chosen table's category fee | No (unless the category is configured otherwise) |

### Billable seats

1. Start with the party size, but never fewer than `min_billable_guests` (2). A solo diner pays 60.
2. **Let us choose:** stop here. No table fee, whichever table is assigned.
3. **Guest chooses a single table:** add the category fee. If the table has more standard seats than
   the smallest regular table type that fits the party, bill the table's standard seats.
4. **Combination or two-group seating:** party size only, no table fee.

"Standard seats" excludes the extra chair. Tables 1, 5, 17 and 18 have 4 standard seats and seat 5
with a chair. Table 29 (3 seats, mostly drinks) is not a regular dinner table, so it does not set
the baseline for a party of 3.

### Examples (all covered by tests)

| Party | Seating | Deposit | Fee | Total | Credit |
|---|---|---|---|---|---|
| 2 | chose table 19 (2 seats, Standard) | 60 | 0 | 60 | 60 |
| 2 | chose table 13 (4 seats, Standard) | 120 | 0 | 120 | 120 |
| 2 | chose table 23 (5 seats, Standard) | 150 | 0 | 150 | 150 |
| 2 | chose table 18 (4 seats, 5 with chair) | 120 | 0 | 120 | 120 |
| 2 | chose table 1 (4 seats, Premium) | 120 | 50 | 170 | 120 |
| 2 | chose table 70 (2 seats, Best for Two) | 60 | 10 | 70 | 60 |
| 2 | chose table 29 (3 seats) | 90 | 0 | 90 | 90 |
| 3 | chose table 13 (4 seats) | 90 | 0 | 90 | 90 |
| 3 | chose table 29 (3 seats) | 90 | 0 | 90 | 90 |
| 4 | chose table 6 (4 seats, Preferred) | 120 | 20 | 140 | 120 |
| 5 | chose table 18 with extra chair | 150 | 0 | 150 | 150 |
| 1 | any 2-seat table | 60 | 0 | 60 | 60 |
| 2 | auto-assigned, lands on table 1 | 60 | 0 | 60 | 60 |
| 6 | combination 18+33 | 180 | 0 | 180 | 180 |
| 16 | two groups | 480 | 0 | 480 | 480 |

## Booking flow on the server

| Step | Service | Result |
|---|---|---|
| Guest picks date, time, party | `getAvailability` | Each table as AVAILABLE, HELD ("being reserved"), TAKEN or NOT_SUITABLE, with its price; joined-table options; the "let us choose" price |
| Guest selects a table or "let us choose" | `createHold` | Reservation in PENDING_PAYMENT, table held for 10 minutes, price snapshot stored |
| Guest enters details | `attachGuestDetails` | Refused once the hold has expired |
| Payment verified by webhook | `confirmReservation` | CONFIRMED; idempotent |
| Hold lapses | `expireHolds` (also runs before every hold) | EXPIRED, table free again |

A slot is bookable when the date is in season, not a closed weekday or closed date, the time is a
configured slot in the future, and the party is within the online limits (1 to 16).

## Concurrency

Two layers:

1. Transactions that allocate tables take a database advisory lock, so they run one after another
   and the second one sees the first one's allocation and returns `TABLE_UNAVAILABLE`.
2. The exclusion constraint on `table_allocation` rejects any overlapping allocation regardless of
   application code. This is the guarantee; layer 1 only makes the failure clean.

Simultaneous "let us choose" requests therefore receive different tables.

## Time on the table

A reservation at 20:00 gives the guest 20:00-22:00 and blocks the table 20:00-22:30. A second
booking of that table is refused for any start from 17:30 (exclusive) to 22:30 (exclusive), and
accepted at 22:30.

## Reservation states

```
PENDING_PAYMENT -> CONFIRMED | EXPIRED
CONFIRMED       -> SEATED | LATE | CANCELLED
LATE            -> SEATED | NO_SHOW | CANCELLED
NO_SHOW         -> SEATED          (staff override, if the table is free)
SEATED          -> COMPLETED
```

Every change goes through one function that validates the transition and writes a history row.

## Late arrival and no-show

- More than 15 minutes after the reservation time the reservation becomes LATE. The table is still
  theirs.
- Staff may seat late guests at any time, or mark a no-show, which frees the table.
- If nobody decides, LATE becomes NO_SHOW when the 2.5-hour block ends.
- A NO_SHOW can still be seated if its table has not been given away. The deposit is kept in every
  no-show case; nothing is refunded automatically.

## Cancellation

- At least 24 hours before the reservation time: everything paid online is refunded (deposit and
  table fee). Exactly 24 hours counts as in time.
- Later: nothing is refunded automatically. A manager may issue a discretionary refund.
- Seated and completed reservations cannot be cancelled.

## Walk-ins

- Staff pick a table (or a configured combination) and an expected duration; the system suggests
  free tables ranked by the allocation rules.
- If the table has a reservation inside the expected stay, the walk-in is refused unless staff
  confirm an override. The walk-in is then recorded as ending when that reservation starts.
- A table that is occupied, held or out of service is always refused.

## Not built yet

Stripe payment and refunds, moving a reservation to another table, manual table blocks, extending a
walk-in, scheduling of the automatic jobs, and all guest-facing screens.
