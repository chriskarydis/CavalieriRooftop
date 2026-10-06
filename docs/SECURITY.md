# Security

What is in place today. Payment, guest manage links and production hardening are added in their
phases and documented here as they land.

## Staff authentication

- Better Auth, email and password, hashes only (scrypt). Minimum password length 12.
- No public sign-up; the sign-up endpoint is disabled and returns an error. The first developer
  account is created with `npm run staff:create`. After that a developer manages accounts at
  `/manage/staff`: create, change role, reset password, remove. The last developer cannot be demoted
  or removed, and nobody can remove themselves.
- A password reset, a role change and a removal sign the person out everywhere.
- Any staff member can change their own password; other devices are then signed out.
- Sessions are stored in the database and expire after 12 hours. The cookie is `HttpOnly`,
  `SameSite=Lax`, and `Secure` in production.
- Sign-in is rate-limited to 5 attempts per minute per client, counted in the database so it holds
  across serverless instances.
- Requests to the auth API from another origin are rejected, which covers CSRF on sign-in.

## Authorisation

- Roles: MANAGER and DEVELOPER (`src/domain/permissions.ts`).
- Pages call `requireStaff()`; every management action calls `requirePermission(...)` on the server.
  Hiding a link is never the control.
- The management application lives under `/manage`, is not linked from the public site and is
  marked `noindex, nofollow`. Its path is not a secret and nothing depends on it being one.

## Booking integrity

- Availability, allocation, price and status are decided on the server. The browser sends only a
  date, a time, a party size and a selection.
- Double booking is prevented by a database constraint, not only by application checks.
- The guest's manage link carries a 256-bit random token; only its SHA-256 hash is stored.

## Payments

- No card data touches this application: the card form is served by Stripe.
- The webhook rejects any request whose Stripe signature does not verify, before reading its body.
- The amount is taken from the server's price snapshot; a refund can never exceed the payment.
- Refunds outside the policy require the "refunds" permission and a written reason, and are audited.

## Guest links and holds

- Manage tokens are derived from a server-side key (HMAC of the reservation id). The database stores
  only their hash, so a copy of the database alone opens no reservation.
- One unpaid hold per visitor, and a cap per network address, so tables cannot be kept out of sale.
- The visitor's IP address is never stored, only a keyed hash used for that cap.

## Errors

- Guests and staff never see technical details: an error page shows a short code only.
- Every server error is logged as one line, and emailed to `ALERT_EMAIL` at most once per 15 minutes
  per error. Secret links and the values of failed database queries are removed first.
- In production the site refuses to start if a required setting is missing, and names the setting
  without printing its value.

## Secrets

- Only in environment variables (`.env` locally, never committed). `.env.example` lists the names.
