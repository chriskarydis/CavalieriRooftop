import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { STAFF_ROLES, type StaffRole } from "@/domain/permissions";
import * as schema from "@/server/db/schema";
import { ConfigError } from "./configuration";
import { audit, type Actor, type Db } from "./context";

/**
 * Staff accounts. There is no public sign-up: a developer creates accounts
 * here (or with `npm run staff:create` for the very first one). Callers must
 * have authorised the actor for the "system" permission.
 */

export const MIN_PASSWORD_LENGTH = 12;

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  createdAt: Date;
}

const newStaffSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(200),
  role: z.enum(STAFF_ROLES),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(200),
});

function parse<T>(shape: z.ZodType<T>, input: unknown): T {
  const result = shape.safeParse(input);
  if (!result.success) throw new ConfigError("INVALID");
  return result.data;
}

export async function listStaff(db: Db): Promise<StaffMember[]> {
  return db
    .select({
      id: schema.staffUser.id,
      name: schema.staffUser.name,
      email: schema.staffUser.email,
      role: schema.staffUser.role,
      createdAt: schema.staffUser.createdAt,
    })
    .from(schema.staffUser)
    .orderBy(asc(schema.staffUser.name));
}

export async function createStaff(db: Db, input: z.input<typeof newStaffSchema>, actor: Actor): Promise<string> {
  const data = parse(newStaffSchema, input);
  const passwordHash = await hashPassword(data.password);
  return db.transaction(async (tx) => {
    const existing = await tx.select().from(schema.staffUser).where(eq(schema.staffUser.email, data.email));
    if (existing.length > 0) throw new ConfigError("DUPLICATE");

    const userId = randomUUID();
    await tx
      .insert(schema.staffUser)
      .values({ id: userId, name: data.name, email: data.email, emailVerified: true, role: data.role });
    await tx.insert(schema.staffAccount).values({
      id: randomUUID(),
      userId,
      accountId: userId,
      providerId: "credential",
      password: passwordHash,
    });
    // The password itself is never written anywhere but as a hash.
    await audit(tx, {
      actor,
      action: "staff.created",
      entityType: "staff_user",
      entityId: userId,
      after: { name: data.name, email: data.email, role: data.role },
    });
    return userId;
  });
}

/** Sets a new password and signs the person out everywhere, so only the new password works. */
export async function resetStaffPassword(db: Db, userId: string, password: string, actor: Actor): Promise<void> {
  if (password.length < MIN_PASSWORD_LENGTH || password.length > 200) throw new ConfigError("INVALID");
  const passwordHash = await hashPassword(password);
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(schema.staffAccount)
      .set({ password: passwordHash, updatedAt: new Date() })
      .where(eq(schema.staffAccount.userId, userId))
      .returning({ id: schema.staffAccount.id });
    if (updated.length === 0) throw new ConfigError("NOT_FOUND");
    await tx.delete(schema.staffSession).where(eq(schema.staffSession.userId, userId));
    await audit(tx, { actor, action: "staff.password_reset", entityType: "staff_user", entityId: userId });
  });
}

async function developerCount(tx: Pick<Db, "select">): Promise<number> {
  const [{ count }] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.staffUser)
    .where(eq(schema.staffUser.role, "DEVELOPER"));
  return count;
}

/** Changes a role. The last developer cannot be demoted, or nobody could manage accounts again. */
export async function setStaffRole(db: Db, userId: string, role: StaffRole, actor: Actor): Promise<void> {
  if (!STAFF_ROLES.includes(role)) throw new ConfigError("INVALID");
  await db.transaction(async (tx) => {
    const [user] = await tx.select().from(schema.staffUser).where(eq(schema.staffUser.id, userId)).for("update");
    if (!user) throw new ConfigError("NOT_FOUND");
    if (user.role === role) return;
    if (user.role === "DEVELOPER" && (await developerCount(tx)) <= 1) throw new ConfigError("LAST_DEVELOPER");
    await tx.update(schema.staffUser).set({ role, updatedAt: new Date() }).where(eq(schema.staffUser.id, userId));
    // A changed role takes effect at the next sign-in for certain.
    await tx.delete(schema.staffSession).where(eq(schema.staffSession.userId, userId));
    await audit(tx, {
      actor,
      action: "staff.role_changed",
      entityType: "staff_user",
      entityId: userId,
      before: { role: user.role },
      after: { role },
    });
  });
}

/** Removes an account and signs it out. Nobody can remove themselves or the last developer. */
export async function removeStaff(db: Db, userId: string, actor: Actor): Promise<void> {
  if (userId === actor) throw new ConfigError("SELF");
  await db.transaction(async (tx) => {
    const [user] = await tx.select().from(schema.staffUser).where(eq(schema.staffUser.id, userId)).for("update");
    if (!user) throw new ConfigError("NOT_FOUND");
    if (user.role === "DEVELOPER" && (await developerCount(tx)) <= 1) throw new ConfigError("LAST_DEVELOPER");
    await tx.delete(schema.staffUser).where(eq(schema.staffUser.id, userId));
    await audit(tx, {
      actor,
      action: "staff.removed",
      entityType: "staff_user",
      entityId: userId,
      before: { name: user.name, email: user.email, role: user.role },
    });
  });
}
