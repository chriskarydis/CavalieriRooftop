# Security

What is in place today. Payment, guest manage links and production hardening are added in their
phases and documented here as they land.

## Staff authentication

- Better Auth, email and password, hashes only (scrypt). Minimum password length 12.
- No public sign-up. Accounts are created with `npm run staff:create`; the sign-up endpoint is
  disabled and returns an error.
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

## Secrets

- Only in environment variables (`.env` locally, never committed). `.env.example` lists the names.
