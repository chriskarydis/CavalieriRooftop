# Booking logic

Implemented so far: pricing (`src/domain/pricing.ts`, tests in `pricing.test.ts`).
Availability, holds, the reservation state machine and cancellation are designed in
PROJECT_ANALYSIS.md section 5 and will be documented here as they are built.

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
   the smallest online-bookable table type that fits the party, bill the table's standard seats.
4. **Combination or two-group seating:** party size only, no table fee.

"Standard seats" excludes the extra chair. Tables 1, 5, 17 and 18 have 4 standard seats and seat 5
with a chair.

### Examples (all covered by tests)

| Party | Seating | Deposit | Fee | Total | Credit |
|---|---|---|---|---|---|
| 2 | chose table 19 (2 seats, Standard) | 60 | 0 | 60 | 60 |
| 2 | chose table 13 (4 seats, Standard) | 120 | 0 | 120 | 120 |
| 2 | chose table 23 (5 seats, Standard) | 150 | 0 | 150 | 150 |
| 2 | chose table 18 (4 seats, 5 with chair) | 120 | 0 | 120 | 120 |
| 2 | chose table 1 (4 seats, Premium) | 120 | 50 | 170 | 120 |
| 2 | chose table 70 (2 seats, Best for Two) | 60 | 10 | 70 | 60 |
| 3 | chose table 13 (4 seats) | 90 | 0 | 90 | 90 |
| 4 | chose table 6 (4 seats, Preferred) | 120 | 20 | 140 | 120 |
| 5 | chose table 18 with extra chair | 150 | 0 | 150 | 150 |
| 1 | any 2-seat table | 60 | 0 | 60 | 60 |
| 2 | auto-assigned, lands on table 1 | 60 | 0 | 60 | 60 |
| 6 | combination 18+33 | 180 | 0 | 180 | 180 |
| 16 | two groups | 480 | 0 | 480 | 480 |
