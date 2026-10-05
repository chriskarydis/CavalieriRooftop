import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";
import { E2E_DATABASE_URL } from "./playwright.config";

const PORT = 3200;
const BASE_URL = `http://localhost:${PORT}`;

/**
 * Opt-in suite that pays through Stripe's real card form in TEST mode.
 * Needs test keys in .env and, in another terminal:
 *   stripe listen --forward-to localhost:3200/api/stripe/webhook
 * with the secret it prints stored as STRIPE_WEBHOOK_SECRET. Run with
 *   npm run test:stripe
 */
export default defineConfig({
  testDir: "./tests/stripe",
  workers: 1,
  timeout: 120_000,
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: BASE_URL, trace: "retain-on-failure" },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `${BASE_URL}/robots.txt`,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      BETTER_AUTH_URL: BASE_URL,
      SITE_URL: BASE_URL,
      ALLOW_SIMULATED_PAYMENTS: "false",
      MAX_HOLDS_PER_ADDRESS: "1000",
      // Payment tests should not send emails.
      RESEND_API_KEY: "",
    },
  },
});
