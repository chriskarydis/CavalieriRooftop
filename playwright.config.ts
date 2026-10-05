import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

/** The end-to-end suite runs against its own database so it never touches development data. */
const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
databaseUrl.pathname = "/cavalieri_e2e";
export const E2E_DATABASE_URL = databaseUrl.toString();

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: BASE_URL, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /(booking|public)\.spec\.ts/ },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    // A page that needs no database: the test database is only rebuilt after the server is up.
    url: `${BASE_URL}/robots.txt`,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      BETTER_AUTH_URL: BASE_URL,
      ALLOW_SIMULATED_PAYMENTS: "true",
      // The browser suite never talks to Stripe or the email provider, whatever is in .env.
      STRIPE_SECRET_KEY: "",
      STRIPE_WEBHOOK_SECRET: "",
      RESEND_API_KEY: "",
      // Every test browser shares this machine's address; the per-address cap is covered by integration tests.
      MAX_HOLDS_PER_ADDRESS: "1000",
    },
  },
});
