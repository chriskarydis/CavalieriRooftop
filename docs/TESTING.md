# Testing

## What to run

| Command | What it checks | Needs |
|---|---|---|
| `npm run typecheck` | Types across the whole project | Nothing |
| `npm run lint` | Code rules | Nothing |
| `npm test` | Business rules and every service, against a real database | Docker database running |
| `npm run test:e2e` | The site in a real browser, desktop and phone | Docker database running |
| `npm run stripe:check` | The Stripe keys in `.env` work (create, pay, refund, cancel) | Stripe **test** keys |
| `npm run test:stripe:services` | Late-payment refund and manager refund, against Stripe | Stripe **test** keys |
| `npm run test:stripe` | Paying through Stripe's real card form in a browser | Stripe test keys and the Stripe CLI |
| `npm run email:check -- you@example.com` | Sample emails arrive in a real inbox | Resend key |

Run the first four before every push. The Stripe and email commands talk to outside services, so
they are run on purpose, not automatically. All of them refuse to run with a live Stripe key.

## Layers

**Unit tests** (`src/**/*.test.ts`) cover the pure rules: every pricing case the owner specified,
allocation ranking, every configured joined table, status changes, the 24-hour and 15-minute
boundaries to the second, time zones and clock changes, permissions, message catalogues, error
reporting.

**Integration tests** (`tests/integration`) run the services against PostgreSQL in a database named
`cavalieri_test`, created and emptied automatically. They cover overlapping and back-to-back
bookings, the 30-minute buffer, hold expiry, 15 and 20 simultaneous bookings of one table, late and
no-show handling with staff overrides, cancellations, walk-ins, moving reservations, blocks,
configuration changes, the menu, payments and refunds with a stand-in for Stripe, emails with a
stand-in transport, staff accounts, analytics and retention.

**Browser tests** (`tests/e2e`) drive the built site with Playwright against a database named
`cavalieri_e2e`, rebuilt on every run. They cover the full guest booking in both languages on
desktop and phone, cancellation, the management pages, settings taking effect for guests, security
headers, an automated accessibility check of every page, and that no page scrolls sideways on a
phone. Payment is stood in for; Stripe is covered by the commands above.

## Running the Stripe browser tests

```bash
stripe listen --forward-to localhost:3200/api/stripe/webhook   # keep running; copy whsec_... into .env
npm run test:stripe
```

Test cards: `4242 4242 4242 4242` succeeds, `4000 0000 0000 0002` is declined,
`4000 0025 0000 3155` asks for 3-D Secure. Any future expiry and any CVC.

In these tests the pay button and Stripe's "Complete" button are pressed with the keyboard. Pointer
clicks were lost in automation while Stripe's frames were still moving; clicking by hand works.

## Writing a test

- A new business rule gets a unit test in `src/domain` first.
- A new service gets an integration test that also tries the cases it must refuse.
- Tests pass the current time in; services never read the clock in a way a test cannot control.
- A browser test uses its own date so it cannot collide with another test's bookings.

## Known gaps

- The real Stripe browser tests and the email check are not part of the automatic suite.
- The scheduled job is tested through its services, not through the scheduler itself.
- No load test has been run. The booking path is serialised by design, which is ample for one
  restaurant, but the number has not been measured.
