"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ForbiddenError, requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { ConfigError } from "@/server/services/configuration";
import { createTable, saveFloorLayout, setTablesStatus, type TableLayout } from "@/server/services/floor-admin";

async function run(path: string, action: (staffId: string) => Promise<Record<string, string> | void>): Promise<void> {
  const query = new URLSearchParams();
  try {
    const staff = await requirePermission("configuration");
    const extra = await action(staff.id);
    query.set("saved", "1");
    for (const [key, value] of Object.entries(extra ?? {})) query.set(key, value);
  } catch (error) {
    if (error instanceof ConfigError) query.set("error", error.code);
    else if (error instanceof ForbiddenError) query.set("error", "FORBIDDEN");
    else throw error;
  }
  revalidatePath("/", "layout");
  redirect(`${path}?${query}`);
}

/** Takes the ticked tables out of service, or puts them back. */
export async function setTablesStatusAction(status: "ACTIVE" | "OUT_OF_SERVICE", form: FormData): Promise<void> {
  await run("/manage/tables", async (staffId) => {
    const result = await setTablesStatus(
      db,
      { tableIds: form.getAll("tableIds").map(String), status, reason: String(form.get("reason") ?? "") },
      staffId,
    );
    return { changed: String(result.changed), ...(result.upcoming > 0 ? { upcomingMany: String(result.upcoming) } : {}) };
  });
}

export async function saveFloorLayoutAction(layoutJson: string): Promise<void> {
  await run("/manage/floor", async (staffId) => {
    let layout: TableLayout[];
    try {
      layout = JSON.parse(layoutJson) as TableLayout[];
    } catch {
      throw new ConfigError("INVALID");
    }
    await saveFloorLayout(db, layout, staffId);
  });
}

export async function createTableAction(form: FormData): Promise<void> {
  await run("/manage/floor", async (staffId) => {
    const capacity = Number(form.get("capacity"));
    await createTable(
      db,
      { number: Number(form.get("number")), capacity, maxCapacity: capacity, categoryId: String(form.get("categoryId")) },
      staffId,
    );
  });
}
