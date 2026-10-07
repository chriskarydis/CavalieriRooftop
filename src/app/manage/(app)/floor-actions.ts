"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ForbiddenError, requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { ConfigError } from "@/server/services/configuration";
import { BookingError } from "@/server/services/context";
import { createTable, saveFloorLayout, setTablesStatus, type TableLayout } from "@/server/services/floor-admin";
import { stripeGateway } from "@/server/payments/gateway";
import { cancelForClosedDays } from "@/server/services/closure-cancellations";
import { loadSettings } from "@/server/services/context";
import { closeTablesForDays, reopenTablesForDays } from "@/server/services/table-ops";

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

/**
 * Takes the ticked tables out of service, or puts them back: until someone
 * changes it again, or for the given days only.
 */
export async function setTablesStatusAction(status: "ACTIVE" | "OUT_OF_SERVICE", form: FormData): Promise<void> {
  await run("/manage/tables", async (staffId): Promise<Record<string, string>> => {
    const tableIds = form.getAll("tableIds").map(String);
    if (form.get("mode") === "days") {
      const days = { tableIds, from: String(form.get("from") ?? ""), to: String(form.get("to") ?? "") };
      try {
        if (status === "ACTIVE") {
          const opened = await reopenTablesForDays(db, days, staffId);
          return { daysOpened: String(opened.tables), from: days.from, to: days.to };
        }
        // Only when the restaurant has switched it on: the reservations of those days are cancelled and refunded first.
        const cancelled = (await loadSettings(db)).cancelOnClosure
          ? await cancelForClosedDays(db, stripeGateway(), days, (await requirePermission("refunds")).id)
          : null;
        const closed = await closeTablesForDays(db, { ...days, reason: String(form.get("reason") ?? "") }, staffId);
        return {
          daysClosed: String(closed.tables),
          from: days.from,
          to: days.to,
          ...(closed.reservations > 0 ? { daysKept: String(closed.reservations) } : {}),
          ...(cancelled && cancelled.cancelled > 0
            ? { daysCancelled: String(cancelled.cancelled), daysRefunded: String(cancelled.refundedCents), daysUnrefunded: String(cancelled.unrefunded) }
            : {}),
        };
      } catch (error) {
        if (error instanceof BookingError) throw new ConfigError("INVALID");
        throw error;
      }
    }
    const result = await setTablesStatus(
      db,
      { tableIds, status, reason: String(form.get("reason") ?? "") },
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
