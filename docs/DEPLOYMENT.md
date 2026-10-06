# Deployment

The site runs on Vercel with a Neon PostgreSQL database in the EU. Nothing here has been done yet;
this is the procedure.

## What you need

| Account | Used for | Cost |
|---|---|---|
| GitHub (exists) | The code: https://github.com/chriskarydis/CavalieriRooftop | Free |
| Neon | The database | Free tier is enough to start |
| Vercel | Running the site | Hobby is free; see "Scheduled jobs" below |
| Stripe | Card payments | Per transaction |
| Resend | Emails | Free tier is enough to start |

## 1. Database (Neon)

1. Create a project. Region: **Europe (Frankfurt)**. PostgreSQL 16 or 17.
2. Open "Connection details". Copy two addresses:
   - the **pooled** one (its host contains `-pooler`): this is `DATABASE_URL`;
   - the **direct** one: this is `DATABASE_URL_UNPOOLED`, used only for migrations.
3. Point-in-time restore is on by default. Note how many days your plan keeps.

## 2. Site (Vercel)

1. "Add New Project", import the GitHub repository. Framework is detected as Next.js.
2. `vercel.json` in the repository already sets the region (Frankfurt), the build command (it applies
   database migrations, then builds) and the scheduled job.
3. Add the environment variables below, then deploy.

### Environment variables

Set these for the **Production** environment. The site refuses to start in production if one is
missing or malformed, and names the one at fault in the logs (never its value).

| Name | Value |
|---|---|
| `DATABASE_URL` | Neon pooled address |
| `DATABASE_URL_UNPOOLED` | Neon direct address |
| `SITE_URL` | The public address, e.g. `https://cavalieriroofgarden.com` |
| `BETTER_AUTH_URL` | The same address |
| `BETTER_AUTH_SECRET` | 32+ random characters: `openssl rand -base64 32` |
| `CRON_SECRET` | 32+ random characters, a different value |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | From the Stripe webhook endpoint (step 4) |
| `RESEND_API_KEY` | Resend API key |
| `EMAIL_FROM` | e.g. `Cavalieri Roof Garden <reservations@cavalieriroofgarden.com>` |
| `RESTAURANT_NOTIFICATION_EMAIL` | Where the restaurant receives booking emails |
| `ALERT_EMAIL` | Optional: where error alerts go |

Never set `ALLOW_SIMULATED_PAYMENTS` in production; the site refuses to start if it is `true`.

For a first trial on the `*.vercel.app` address, use Stripe **test** keys and set `SITE_URL` and
`BETTER_AUTH_URL` to that address.

## 3. First data

Run once from your own machine, with `DATABASE_URL` pointing at the Neon **direct** address:

```bash
npm run db:seed        # tables, categories, joined tables, settings, menu. Skips what already exists.
STAFF_PASSWORD="..." npm run staff:create -- you@example.com "Your Name" DEVELOPER
```

The seed contains no reservations and no customers. Further staff accounts are created from
`/manage/staff` by a developer.

## 4. Stripe

1. Developers > Webhooks > Add endpoint: `https://<site>/api/stripe/webhook`.
2. Events: `payment_intent.succeeded`, `payment_intent.payment_failed`.
3. Copy the signing secret into `STRIPE_WEBHOOK_SECRET` and redeploy.
4. In Settings > Payment methods nothing needs changing: the site asks for cards only.

## 5. Email (Resend)

1. Add the domain `cavalieriroofgarden.com` and create the DNS records Resend lists (SPF, DKIM).
   This needs whoever manages the domain's DNS.
2. Until the domain is verified, Resend delivers only to the account owner's own address.

## 6. Scheduled jobs

`/api/cron/tick` frees expired holds, marks late reservations, closes out no-shows, sends reminders
and applies the data-retention period. It should run **every minute** during service.

`vercel.json` schedules it once a day, because Vercel's free Hobby plan rejects anything more
frequent and would refuse to deploy. Before going live choose one:

- **Vercel Pro:** change the schedule in `vercel.json` to `* * * * *`. (Vercel's terms also require
  a paid plan for commercial sites.)
- **Stay on Hobby for trials:** call the address every minute from an external scheduler (for
  example cron-job.org) with the header `Authorization: Bearer <CRON_SECRET>`.

If the job does not run, bookings still work: expired holds are also freed whenever anyone searches
or books. What stops is the automatic "late" marking, reminders and no-show close-out.

## 7. Domain cut-over

1. Add the domain in Vercel > Domains. Vercel shows the DNS records to create.
2. Before switching: note any future reservations in the old WordPress system and block those tables
   by hand in `/manage` (table details > block for a date and time, guest's name as the reason).
3. Switch DNS. Update `SITE_URL` and `BETTER_AUTH_URL` to the real address, switch Stripe to live
   keys with a live webhook, and redeploy.
4. Check: book a table with a real card for a small party, see the email arrive, cancel, see the
   refund in Stripe.

## Updating the site

Pushing to `main` deploys. Database migrations run as part of the build, before the new version
goes live. A migration that fails stops the deployment and the old version keeps running.

## Backups and recovery

- The database is the only thing that holds state. Neon keeps a restorable history; use its
  "Restore" to go back to a point in time.
- The code and its history are on GitHub.
- The original photographs are not in the repository. Keep a copy.

## Rolling back

Vercel > Deployments > pick the previous deployment > "Promote to Production". This rolls back the
code only. Migrations are written to be backward compatible with the previous version where
possible; if one is not, restore the database to just before the deployment.
