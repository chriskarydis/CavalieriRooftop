# Decisions

Newest first. "Owner" means the project owner's explicit instruction; "Engineering" means a
technical choice made during implementation.

## Open questions (need the owner)

1. **Table fee on an in-policy cancellation.** When a guest cancels 24 hours or more ahead, is the
   table selection fee refunded together with the deposit, or only the deposit?
2. **Two-table joins in the middle columns.** The specification lists 2+7, 3+8 and 4+9, but on the
   floor plan tables 70, 80 and 90 sit between them (2, 70, 7 from top to bottom). Seeded as
   specified until confirmed.
3. **Other neighbouring group pairs.** Only the two pairings the owner named are seeded
   (1+6 with 2+7+70, and 4+9+90 with 5+11).

## 2026-10-04: business rules (Owner)

- A party of 3 at a 4-seat table pays 3 x 30 = 90.
- Table 29 (3 seats) is mostly for drinks: never auto-assigned for dinner. *Engineering
  interpretation:* it is also not offered on the public floor plan; staff can still use it. Both are
  per-table switches (`online_bookable`, `auto_assignable`).
- "Let us choose" charges by party size and no table fee, and avoids fee-carrying tables unless
  nothing else is free.
- Combinations and large parties: no table fee; deposit = guests x 30.
- Tables 1, 5, 17 and 18 seat 4, or 5 with an extra chair. Two guests choosing one pay the
  minimum spend of 4. Five guests pay 150. *Engineering interpretation:* 17 and 18 are therefore
  modelled as capacity 4 / max 5, replacing the original "5-seat" listing.
- Combination capacities confirmed as proposed (see TABLE_ALLOCATION.md).
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
  seats than the smallest online-bookable table type that fits the party. The comparison uses the
  restaurant's configuration, not what happens to be free that evening, so a table's price does not
  change with other guests' bookings.
- **Drizzle ORM** instead of Prisma, for first-class range types and custom constraints.
- **Double booking** is prevented by a PostgreSQL exclusion constraint on `table_allocation`,
  verified by an integration test with 20 simultaneous inserts.
- **Reservation status and payment status are separate columns.**
- **next-intl without its build plugin.** The plugin eagerly loads `@swc/core`, whose native binding
  refuses to load on this Windows machine. `next.config.ts` sets the one alias the plugin provides.
- **Translatable database content** is stored as JSON per locale (`{ "en": ..., "el": ... }`), so a
  new language needs no schema change.
- **Repository** lives at `C:\dev\cavalieri-roof-garden`, outside OneDrive.
