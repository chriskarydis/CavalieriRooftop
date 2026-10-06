import { verifyPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/server/db/schema";
import { ConfigError } from "@/server/services/configuration";
import { createStaff, listStaff, removeStaff, resetStaffPassword, setStaffRole } from "@/server/services/staff";
import { openTestDatabase } from "./test-db";

const ACTOR = "developer-1";

describe("staff accounts", () => {
  let ctx: Awaited<ReturnType<typeof openTestDatabase>>;

  const code = async (promise: Promise<unknown>): Promise<string> => {
    try {
      await promise;
      return "NO_ERROR";
    } catch (error) {
      if (error instanceof ConfigError) return error.code;
      throw error;
    }
  };
  const add = (name: string, role: "MANAGER" | "DEVELOPER", email = `${name.toLowerCase()}@example.com`) =>
    createStaff(ctx.db, { name, email, role, password: "a-long-enough-password" }, ACTOR);
  const passwordHash = async (userId: string) =>
    (await ctx.db.select().from(schema.staffAccount).where(eq(schema.staffAccount.userId, userId)))[0].password!;

  beforeAll(async () => {
    ctx = await openTestDatabase();
  });
  beforeEach(async () => {
    await ctx.client.unsafe("TRUNCATE staff_user, audit_log CASCADE");
  });
  afterAll(async () => {
    await ctx.close();
  });

  it("creates an account whose password is stored only as a hash", async () => {
    const id = await createStaff(
      ctx.db,
      { name: "  Maria Manager ", email: " Maria@Example.COM ", role: "MANAGER", password: "correct horse battery" },
      ACTOR,
    );
    expect(await listStaff(ctx.db)).toMatchObject([{ id, name: "Maria Manager", email: "maria@example.com", role: "MANAGER" }]);

    const hash = await passwordHash(id);
    expect(hash).not.toContain("correct horse battery");
    expect(await verifyPassword({ hash, password: "correct horse battery" })).toBe(true);
    expect(await verifyPassword({ hash, password: "wrong password here" })).toBe(false);

    const [entry] = await ctx.db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "staff.created"));
    expect(JSON.stringify(entry)).not.toContain("correct horse battery");
  });

  it("rejects a duplicate email, a short password, a bad email and an unknown role", async () => {
    await add("Maria", "MANAGER");
    expect(await code(add("Other", "MANAGER", "MARIA@example.com"))).toBe("DUPLICATE");
    const attempt = (changes: Record<string, string>) =>
      code(createStaff(ctx.db, { name: "Nikos", email: "nikos@example.com", role: "MANAGER", password: "a-long-enough-password", ...changes } as never, ACTOR));
    expect(await attempt({ password: "short" })).toBe("INVALID");
    expect(await attempt({ email: "not-an-email" })).toBe("INVALID");
    expect(await attempt({ role: "OWNER" })).toBe("INVALID");
    expect(await attempt({ name: " " })).toBe("INVALID");
  });

  it("a password reset replaces the hash and signs the person out", async () => {
    const id = await add("Maria", "MANAGER");
    await ctx.db.insert(schema.staffSession).values({ id: "s1", userId: id, token: "t1", expiresAt: new Date(Date.now() + 60_000) });

    await resetStaffPassword(ctx.db, id, "a-brand-new-password", ACTOR);
    expect(await verifyPassword({ hash: await passwordHash(id), password: "a-brand-new-password" })).toBe(true);
    expect(await verifyPassword({ hash: await passwordHash(id), password: "a-long-enough-password" })).toBe(false);
    expect(await ctx.db.$count(schema.staffSession)).toBe(0);

    expect(await code(resetStaffPassword(ctx.db, id, "short", ACTOR))).toBe("INVALID");
    expect(await code(resetStaffPassword(ctx.db, "no-such-user", "a-brand-new-password", ACTOR))).toBe("NOT_FOUND");
  });

  it("the last developer cannot be demoted or removed; nobody removes themselves", async () => {
    const developer = await add("Dimitris", "DEVELOPER");
    const manager = await add("Maria", "MANAGER");

    expect(await code(setStaffRole(ctx.db, developer, "MANAGER", ACTOR))).toBe("LAST_DEVELOPER");
    expect(await code(removeStaff(ctx.db, developer, ACTOR))).toBe("LAST_DEVELOPER");
    expect(await code(removeStaff(ctx.db, manager, manager))).toBe("SELF");

    // With a second developer, the first may step down.
    await setStaffRole(ctx.db, manager, "DEVELOPER", ACTOR);
    await setStaffRole(ctx.db, developer, "MANAGER", ACTOR);
    expect((await listStaff(ctx.db)).map((member) => [member.name, member.role])).toEqual([
      ["Dimitris", "MANAGER"],
      ["Maria", "DEVELOPER"],
    ]);
  });

  it("removing an account removes its sign-in and sessions, and is audited", async () => {
    await add("Dimitris", "DEVELOPER");
    const manager = await add("Maria", "MANAGER");
    await ctx.db.insert(schema.staffSession).values({ id: "s1", userId: manager, token: "t1", expiresAt: new Date(Date.now() + 60_000) });

    await removeStaff(ctx.db, manager, ACTOR);
    expect((await listStaff(ctx.db)).map((member) => member.name)).toEqual(["Dimitris"]);
    expect(await ctx.db.$count(schema.staffSession)).toBe(0);
    expect(await ctx.db.$count(schema.staffAccount)).toBe(1);
    const [entry] = await ctx.db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "staff.removed"));
    expect(entry).toMatchObject({ actor: ACTOR, before: { email: "maria@example.com" } });
  });
});
