"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ForbiddenError, requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import {
  addClosure,
  ConfigError,
  createCategory,
  createCombination,
  createPairing,
  removeClosure,
  setPairingActive,
  updateCategory,
  updateCombination,
  updateSettings,
  updateTable,
} from "@/server/services/configuration";

const CENTS = 100;

const text = (form: FormData, name: string): string => String(form.get(name) ?? "");
const number = (form: FormData, name: string): number => Number(form.get(name));
const checked = (form: FormData, name: string): boolean => form.get(name) === "on";
const euros = (form: FormData, name: string): number => Math.round(number(form, name) * CENTS);

/**
 * Runs one configuration change for the signed-in staff member, then returns
 * to `path` with either a saved notice or the rule that was broken.
 */
async function configAction(path: string, run: (staffId: string) => Promise<Record<string, string> | void>): Promise<void> {
  const query = new URLSearchParams();
  try {
    const staff = await requirePermission("configuration");
    const extra = await run(staff.id);
    query.set("saved", "1");
    for (const [key, value] of Object.entries(extra ?? {})) query.set(key, value);
  } catch (error) {
    if (error instanceof ConfigError) query.set("error", error.code);
    else if (error instanceof ForbiddenError) query.set("error", "FORBIDDEN");
    else throw error;
  }
  // The public booking pages read this configuration too.
  revalidatePath("/", "layout");
  redirect(`${path}?${query}`);
}

export async function saveTable(tableId: string, form: FormData): Promise<void> {
  await configAction("/manage/tables", async (staffId) => {
    const { upcoming } = await updateTable(
      db,
      tableId,
      {
        capacity: number(form, "capacity"),
        maxCapacity: number(form, "maxCapacity"),
        categoryId: text(form, "categoryId"),
        status: text(form, "status") as "ACTIVE",
        statusReason: text(form, "statusReason"),
        onlineBookable: checked(form, "onlineBookable"),
        autoAssignable: checked(form, "autoAssignable"),
        priority: number(form, "priority"),
        viewDescription: { en: text(form, "viewEn"), el: text(form, "viewEl") },
        notes: text(form, "notes"),
      },
      staffId,
    );
    const disabled = text(form, "status") !== "ACTIVE";
    return { table: text(form, "number"), ...(disabled && upcoming > 0 ? { upcoming: String(upcoming) } : {}) };
  });
}

function categoryInput(form: FormData) {
  return {
    name: { en: text(form, "nameEn"), el: text(form, "nameEl") },
    description: { en: text(form, "descriptionEn"), el: text(form, "descriptionEl") },
    extraFeeCents: euros(form, "fee"),
    feeCountsTowardMinSpend: checked(form, "feeCountsTowardMinSpend"),
    priority: number(form, "priority"),
    color: text(form, "color"),
    displayOrder: number(form, "displayOrder"),
    active: checked(form, "active"),
  };
}

export async function saveCategory(categoryId: string, form: FormData): Promise<void> {
  await configAction("/manage/categories", async (staffId) => {
    await updateCategory(db, categoryId, categoryInput(form), staffId);
  });
}

export async function addCategory(form: FormData): Promise<void> {
  await configAction("/manage/categories", async (staffId) => {
    await createCategory(db, { ...categoryInput(form), active: true }, staffId);
  });
}

export async function saveCombination(combinationId: string, form: FormData): Promise<void> {
  await configAction("/manage/combinations", async (staffId) => {
    await updateCombination(
      db,
      combinationId,
      {
        capacity: number(form, "capacity"),
        minParty: number(form, "minParty"),
        active: checked(form, "active"),
        onlineBookable: checked(form, "onlineBookable"),
        priority: number(form, "priority"),
      },
      staffId,
    );
  });
}

export async function addCombination(form: FormData): Promise<void> {
  await configAction("/manage/combinations", async (staffId) => {
    await createCombination(
      db,
      {
        tableIds: form.getAll("tableIds").map(String),
        capacity: number(form, "capacity"),
        minParty: number(form, "minParty"),
      },
      staffId,
    );
  });
}

export async function togglePairing(pairingId: string, active: boolean): Promise<void> {
  await configAction("/manage/combinations", async (staffId) => {
    await setPairingActive(db, pairingId, active, staffId);
  });
}

export async function addPairing(form: FormData): Promise<void> {
  await configAction("/manage/combinations", async (staffId) => {
    await createPairing(db, text(form, "first"), text(form, "second"), staffId);
  });
}

export async function saveSettings(form: FormData): Promise<void> {
  await configAction("/manage/settings", async (staffId) => {
    await updateSettings(
      db,
      {
        depositPerPersonCents: euros(form, "deposit"),
        minBillableGuests: number(form, "minBillableGuests"),
        diningMinutes: number(form, "diningMinutes"),
        blockMinutes: number(form, "blockMinutes"),
        graceMinutes: number(form, "graceMinutes"),
        refundCutoffHours: number(form, "refundCutoffHours"),
        holdMinutes: number(form, "holdMinutes"),
        minOnlineParty: number(form, "minOnlineParty"),
        maxOnlineParty: number(form, "maxOnlineParty"),
        showMenuPrices: checked(form, "showMenuPrices"),
        timeSlots: text(form, "timeSlots")
          .split(/[\s,]+/)
          .filter(Boolean),
        closedWeekdays: form.getAll("closedWeekdays").map(Number),
        seasonStart: text(form, "seasonStart"),
        seasonEnd: text(form, "seasonEnd"),
        retentionMonths: text(form, "retentionMonths").trim() === "" ? null : number(form, "retentionMonths"),
      },
      staffId,
    );
  });
}

export async function addClosedDate(form: FormData): Promise<void> {
  await configAction("/manage/settings", async (staffId) => {
    await addClosure(db, { date: text(form, "date"), reason: text(form, "reason") }, staffId);
  });
}

export async function removeClosedDate(closureId: string): Promise<void> {
  await configAction("/manage/settings", async (staffId) => {
    await removeClosure(db, closureId, staffId);
  });
}
