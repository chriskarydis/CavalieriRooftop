import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/server/db/client";
import * as schema from "@/server/db/schema";

const HOUR_SECONDS = 60 * 60;

/** Sign-in attempts allowed per minute from one address. Raised only for automated tests. */
const configuredAttempts = Number(process.env.SIGN_IN_ATTEMPTS_PER_MINUTE);
const SIGN_IN_ATTEMPTS = Number.isInteger(configuredAttempts) && configuredAttempts > 0 ? configuredAttempts : 5;

/**
 * Staff authentication. There is no public sign-up: accounts are created
 * with `npm run staff:create`. Sessions live in the database and travel in an
 * HttpOnly, SameSite=Lax cookie (Secure in production).
 */
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.staffUser,
      session: schema.staffSession,
      account: schema.staffAccount,
      verification: schema.staffVerification,
      rateLimit: schema.authRateLimit,
    },
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
  },
  user: {
    additionalFields: {
      role: { type: "string", required: true, defaultValue: "MANAGER", input: false },
    },
  },
  session: {
    expiresIn: 12 * HOUR_SECONDS,
    updateAge: HOUR_SECONDS,
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 60,
    customRules: {
      "/sign-in/email": { window: 60, max: SIGN_IN_ATTEMPTS },
      "/change-password": { window: 60, max: 5 },
    },
  },
  advanced: { cookiePrefix: "crg" },
  // Must stay last so it can set cookies from server actions.
  plugins: [nextCookies()],
});
