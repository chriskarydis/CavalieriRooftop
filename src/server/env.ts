import { z } from "zod";

/**
 * Checks the configuration a production server cannot run safely without.
 * Called once at start-up, so a missing secret stops the deployment instead
 * of surfacing later as a broken booking.
 */

const MIN_SECRET_LENGTH = 32;

const productionSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(MIN_SECRET_LENGTH),
    BETTER_AUTH_URL: z.string().url().startsWith("https://"),
    SITE_URL: z.string().url().startsWith("https://"),
    CRON_SECRET: z.string().min(MIN_SECRET_LENGTH),
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().startsWith("pk_"),
    STRIPE_SECRET_KEY: z.string().startsWith("sk_"),
    STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_"),
    RESEND_API_KEY: z.string().min(1),
    EMAIL_FROM: z.string().min(3),
    RESTAURANT_NOTIFICATION_EMAIL: z.string().email(),
    ALLOW_SIMULATED_PAYMENTS: z.string().optional(),
  })
  .refine((env) => env.ALLOW_SIMULATED_PAYMENTS !== "true", {
    message: "ALLOW_SIMULATED_PAYMENTS must not be enabled in production",
    path: ["ALLOW_SIMULATED_PAYMENTS"],
  });

export class EnvironmentError extends Error {
  constructor(public readonly problems: string[]) {
    // Names of the settings only; never their values.
    super(`Invalid production configuration: ${problems.join("; ")}`);
    this.name = "EnvironmentError";
  }
}

export function checkProductionEnvironment(env: Record<string, string | undefined>): void {
  const result = productionSchema.safeParse(env);
  if (result.success) return;
  throw new EnvironmentError(result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`));
}
