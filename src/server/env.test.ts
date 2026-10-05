import { describe, expect, it } from "vitest";
import { checkProductionEnvironment, EnvironmentError } from "./env";

const valid = {
  DATABASE_URL: "postgres://user:pass@host/db",
  BETTER_AUTH_SECRET: "a".repeat(32),
  BETTER_AUTH_URL: "https://cavalieriroofgarden.com",
  SITE_URL: "https://cavalieriroofgarden.com",
  CRON_SECRET: "b".repeat(32),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_x",
  STRIPE_SECRET_KEY: "sk_live_x",
  STRIPE_WEBHOOK_SECRET: "whsec_x",
  RESEND_API_KEY: "re_x",
  EMAIL_FROM: "Cavalieri <reservations@cavalieriroofgarden.com>",
  RESTAURANT_NOTIFICATION_EMAIL: "info@cavalieriroofgarden.com",
};

describe("production environment check", () => {
  it("accepts a complete configuration", () => {
    expect(() => checkProductionEnvironment(valid)).not.toThrow();
  });

  it("names what is missing or weak without printing any value", () => {
    const secret = "short-secret-value";
    try {
      checkProductionEnvironment({ ...valid, BETTER_AUTH_SECRET: secret, STRIPE_SECRET_KEY: undefined, SITE_URL: "http://example.com" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EnvironmentError);
      const message = (error as EnvironmentError).message;
      expect(message).toContain("BETTER_AUTH_SECRET");
      expect(message).toContain("STRIPE_SECRET_KEY");
      expect(message).toContain("SITE_URL");
      expect(message).not.toContain(secret);
    }
  });

  it("refuses the payment stand-in in production", () => {
    expect(() => checkProductionEnvironment({ ...valid, ALLOW_SIMULATED_PAYMENTS: "true" })).toThrow(EnvironmentError);
  });
});
