import type { Instrumentation } from "next";

/** Runs once when a server instance starts. */
export async function register(): Promise<void> {
  // Only the live site is held to the full list; previews and local runs may lack payment and email keys.
  if (process.env.VERCEL_ENV === "production") {
    const { checkProductionEnvironment } = await import("@/server/env");
    checkProductionEnvironment(process.env);
  }
}

/** Called by Next.js for every error on the server: pages, route handlers and server actions. */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const { describeError, redactPath, reportError } = await import("@/server/monitoring");
  await reportError({
    ...describeError(error),
    path: redactPath(request.path),
    method: request.method,
    kind: context.routeType,
  });
};
