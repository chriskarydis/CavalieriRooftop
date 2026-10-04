# Table allocation

`src/domain/allocation.ts`, tests in `allocation.test.ts`.

`findCandidates()` takes the party size, the configured tables, combinations and pairings, and the
set of tables that are busy for the requested time window. It returns every valid seating, best
first. The same function serves automatic assignment, the guest's floor plan, walk-in suggestions
and reservation moves.

## What counts as a valid seating

| Kind | Valid when |
|---|---|
| Single table | Active, free, and the party fits (including an extra chair where the table allows one) |
| Combination | Configured and active, every member table active and free, `min_party <= party <= capacity` |
| Pairing (two groups) | Configured and active, both groups valid, and the party is too big for either group alone |

Nothing else is ever offered. Adjacency is never inferred from coordinates.

Who may use what:

| Purpose | Tables considered |
|---|---|
| Let us choose | `online_bookable` and `auto_assignable` |
| Guest chooses | `online_bookable` |
| Staff | every active table |

## Ranking

Compared in this order; the first difference decides.

1. Lowest category fee among the tables used. Fee-carrying tables are kept for guests who pay to
   choose them.
2. Fewest empty seats.
3. Fewest physical tables.
4. No extra chair needed.
5. Fewest other combinations blocked. Table 19 is used before table 33 (needed for 18+33), which is
   used before table 7 (needed for 2+7 and 2+7+70).
6. Manager-set priority, higher first.
7. Lowest table number, so results are repeatable.

With the initial configuration, automatic assignment starts with:

| Party | First choice | Next |
|---|---|---|
| 1-2 | 19 | other free-standing 2-seat tables, then 33, then 7, 8, 9 |
| 3-4 | 13 | 14, 17, 18 |
| 5 | 23 | 24, then 17 or 18 with an extra chair |
| 6 | 15 | |
| 7 | 18+33 | 23+24, then 1+6 |
| 12 | 1+6+12 | 5+11+16, then two groups |
| 16 | 1+6 with 2+7+70 | 4+9+90 with 5+11 |
| 17+ | none | guest is asked to contact the restaurant |

## Initial combinations

| Combination | Seats | Offered from |
|---|---|---|
| 1+6 | 8 | 6 guests |
| 1+6+12 | 12 | 9 |
| 2+7 | 6 | 5 |
| 2+7+70 | 8 | 7 |
| 3+8 | 6 | 5 |
| 3+8+80 | 8 | 7 |
| 4+9 | 6 | 5 |
| 4+9+90 | 8 | 7 |
| 5+11 | 8 | 6 |
| 5+11+16 | 12 | 9 |
| 23+24 | 7 | 6 |
| 18+33 | 7 | 6 |
| 17+spare | 7 | 6 (inactive until the spare table is enabled) |

Pairings: (1+6) with (2+7+70); (4+9+90) with (5+11). Each seats up to 16.

The "offered from" values are engineering defaults and are editable.
