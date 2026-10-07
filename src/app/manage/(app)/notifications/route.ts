import { getStaff } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { notificationSummary } from "@/server/services/notifications";

/** Asked every few seconds by the bell in the management header. Counts only, no guest details. */
export async function GET(): Promise<Response> {
  if (!(await getStaff())) return new Response("Unauthorized", { status: 401 });
  return Response.json(await notificationSummary(db), { headers: { "Cache-Control": "no-store" } });
}
