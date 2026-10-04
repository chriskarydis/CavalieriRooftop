import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/server/db/schema";
import { openTestDatabase } from "./test-db";

/**
 * Proves the database itself refuses a double booking, independent of any
 * application-level availability check.
 */
describe("table_allocation exclusion constraint", () => {
  let ctx: Awaited<ReturnType<typeof openTestDatabase>>;
  let tableId: string;
  let otherTableId: string;

  const range = (from: string, to: string): string => `[2027-08-12T${from}:00Z,2027-08-12T${to}:00Z)`;
  const block = (table: string, period: string) =>
    ctx.db.insert(schema.tableAllocation).values({ tableId: table, period, kind: "BLOCK" });

  beforeAll(async () => {
    ctx = await openTestDatabase();
    const [category] = await ctx.db
      .insert(schema.tableCategory)
      .values({ name: { en: "Standard" }, color: "#000000" })
      .returning();
    const [plan] = await ctx.db
      .insert(schema.floorPlan)
      .values({ name: "Test", width: 100, height: 100, shapes: [] })
      .returning();
    const base = { capacity: 2, maxCapacity: 2, categoryId: category.id, floorPlanId: plan.id, x: 0, y: 0, width: 1, height: 1 };
    const tables = await ctx.db
      .insert(schema.diningTable)
      .values([{ ...base, number: 5 }, { ...base, number: 6 }])
      .returning();
    tableId = tables[0].id;
    otherTableId = tables[1].id;
  });

  beforeEach(async () => {
    await ctx.db.delete(schema.tableAllocation);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it("lets exactly one of 20 simultaneous bookings of the same table and time succeed", async () => {
    const attempts = await Promise.allSettled(
      Array.from({ length: 20 }, () => block(tableId, range("20:00", "22:30"))),
    );
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    const rejected = attempts.filter((attempt) => attempt.status === "rejected");
    expect(rejected).toHaveLength(19);
    for (const attempt of rejected) {
      // 23P01 = exclusion_violation
      expect((attempt as PromiseRejectedResult).reason?.cause?.code).toBe("23P01");
    }
  });

  it("rejects a booking that overlaps only the 30-minute operational buffer", async () => {
    await block(tableId, range("20:00", "22:30"));
    await expect(block(tableId, range("22:00", "23:59"))).rejects.toThrow();
  });

  it("accepts back-to-back bookings and the same time on another table", async () => {
    await block(tableId, range("18:30", "21:00"));
    await block(tableId, range("21:00", "23:30"));
    await block(otherTableId, range("18:30", "21:00"));
    expect(await ctx.db.$count(schema.tableAllocation)).toBe(3);
  });

  it("ignores released allocations", async () => {
    await ctx.db.insert(schema.tableAllocation).values({
      tableId, period: range("20:00", "22:30"), kind: "BLOCK", releasedAt: new Date(),
    });
    await block(tableId, range("20:00", "22:30"));
    expect(await ctx.db.$count(schema.tableAllocation)).toBe(2);
  });

  it("requires an expiry on holds and forbids one on anything else", async () => {
    await expect(
      ctx.db.insert(schema.tableAllocation).values({ tableId, period: range("20:00", "22:30"), kind: "HOLD" }),
    ).rejects.toThrow();
    await expect(
      ctx.db.insert(schema.tableAllocation).values({
        tableId, period: range("20:00", "22:30"), kind: "BLOCK", expiresAt: new Date(),
      }),
    ).rejects.toThrow();
  });
});
