import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { hasPermission, STAFF_ROLES, type Permission, type StaffRole } from "@/domain/permissions";
import { auth } from "./auth";

export interface Staff {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
}

export class ForbiddenError extends Error {
  constructor(public readonly permission: Permission) {
    super("Forbidden");
    this.name = "ForbiddenError";
  }
}

/** The signed-in staff member, or null. Reads the session from the database. */
export async function getStaff(): Promise<Staff | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const role = (session.user as { role?: string }).role;
  if (!STAFF_ROLES.includes(role as StaffRole)) return null;
  return { id: session.user.id, name: session.user.name, email: session.user.email, role: role as StaffRole };
}

/** For pages: sends anyone who is not signed in to the login screen. */
export async function requireStaff(): Promise<Staff> {
  const staff = await getStaff();
  if (!staff) redirect("/manage/login");
  return staff;
}

/** For server actions and route handlers: every management action starts with this. */
export async function requirePermission(permission: Permission): Promise<Staff> {
  const staff = await requireStaff();
  if (!hasPermission(staff.role, permission)) throw new ForbiddenError(permission);
  return staff;
}
