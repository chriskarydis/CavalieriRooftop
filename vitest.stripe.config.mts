import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Opt-in: talks to Stripe in test mode. Not part of `npm test`.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/stripe-live/**/*.test.ts"],
    fileParallelism: false,
  },
});
