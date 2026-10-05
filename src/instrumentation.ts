/** Runs once when a server instance starts. */
export async function register(): Promise<void> {
  // Only the live site is held to the full list; previews and local runs may lack payment and email keys.
  if (process.env.VERCEL_ENV === "production") {
    const { checkProductionEnvironment } = await import("@/server/env");
    checkProductionEnvironment(process.env);
  }
}
