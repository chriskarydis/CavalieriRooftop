"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { STAFF_ROLES, type StaffRole } from "@/domain/permissions";
import { ForbiddenError, requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { ConfigError } from "@/server/services/configuration";
import { createStaff, removeStaff, resetStaffPassword, setStaffRole } from "@/server/services/staff";

const PATH = "/manage/staff";
const text = (form: FormData, name: string): string => String(form.get(name) ?? "");

async function staffAction(run: (staffId: string) => Promise<unknown>): Promise<void> {
  const query = new URLSearchParams();
  try {
    const staff = await requirePermission("system");
    await run(staff.id);
    query.set("saved", "1");
  } catch (error) {
    if (error instanceof ConfigError) query.set("error", error.code);
    else if (error instanceof ForbiddenError) query.set("error", "FORBIDDEN");
    else throw error;
  }
  revalidatePath(PATH);
  redirect(`${PATH}?${query}`);
}

function roleOf(form: FormData): StaffRole {
  const role = text(form, "role");
  if (!STAFF_ROLES.includes(role as StaffRole)) throw new ConfigError("INVALID");
  return role as StaffRole;
}

export async function addStaff(form: FormData): Promise<void> {
  await staffAction((actor) =>
    createStaff(
      db,
      { name: text(form, "name"), email: text(form, "email"), role: roleOf(form), password: text(form, "password") },
      actor,
    ),
  );
}

export async function changeRole(userId: string, form: FormData): Promise<void> {
  await staffAction((actor) => setStaffRole(db, userId, roleOf(form), actor));
}

export async function resetPassword(userId: string, form: FormData): Promise<void> {
  await staffAction((actor) => resetStaffPassword(db, userId, text(form, "password"), actor));
}

export async function deleteStaff(userId: string): Promise<void> {
  await staffAction((actor) => removeStaff(db, userId, actor));
}
