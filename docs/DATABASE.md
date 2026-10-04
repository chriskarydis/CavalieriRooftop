# Database

PostgreSQL. Schema in `src/server/db/schema.ts`, migrations in `drizzle/`.

Conventions: money is integer cents; instants are `timestamptz`; guest-visible content is JSON per
locale; column names are snake_case.

| Group | Tables |
|---|---|
| Configuration | `restaurant_settings` (single row), `closure` |
| Floor | `floor_plan`, `table_category`, `dining_table`, `table_combination`, `table_combination_member`, `combination_pairing` |
| Bookings | `customer`, `reservation`, `walk_in`, `table_allocation`, `reservation_event` |
| Money | `payment`, `refund`, `stripe_event` |
| Menu | `menu_category`, `menu_item`, `menu_item_image`, `allergen`, `menu_item_allergen` |
| System | `notification`, `email_log`, `audit_log` |

Staff `user` and `session` tables are added with authentication.

## `table_allocation`

The single record of which table is taken when. Holds, reservations, walk-ins and manual blocks all
write here, one row per physical table.

```sql
EXCLUDE USING gist (table_id WITH =, period WITH &&) WHERE (released_at IS NULL)
```

Two live allocations of one table can never overlap; the losing insert fails with error `23P01`.
`period` is half-open, so a booking ending at 21:00 and one starting at 21:00 do not collide.
Releasing an allocation (cancellation, no-show, expired hold) sets `released_at` and keeps the row.

## Reservation price snapshot

`reservation` stores the full price breakdown as booked. Changing the deposit or a category fee
later never alters an existing reservation.
