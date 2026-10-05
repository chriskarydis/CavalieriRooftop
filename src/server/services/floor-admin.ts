import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import * as schema from "@/server/db/schema";
import { ConfigError } from "./configuration";
import { audit, type Actor, type Db } from "./context";

/**
 * Manager changes to the floor itself: taking several tables out of service
 * at once, moving and resizing tables on the plan, and adding a table.
 */

function parse<T>(shape: z.ZodType<T>, input: unknown): T {
  const result = shape.safeParse(input);
  if (!result.success) throw new ConfigError("INVALID");
  return result.data;
}

const bulkStatusSchema = z.object({
  tableIds: z.array(z.string().uuid()).min(1).max(100),
  status: z.enum(["ACTIVE", "OUT_OF_SERVICE"]),
  reason: z.string().trim().max(200),
});

/**
 * Takes several tables out of service, or puts them back, in one step (bad
 * weather, a private event). Existing reservations are not cancelled; the
 * result says how many upcoming ones sit on the affected tables.
 */
export async function setTablesStatus(
  db: Db,
  input: z.input<typeof bulkStatusSchema>,
  actor: Actor,
): Promise<{ changed: number; upcoming: number }> {
  const data = parse(bulkStatusSchema, input);
  return db.transaction(async (tx) => {
    const changed = await tx
      .update(schema.diningTable)
      .set({
        status: data.status,
        statusReason: data.status === "ACTIVE" ? null : data.reason || null,
        updatedAt: new Date(),
      })
      .where(and(inArray(schema.diningTable.id, data.tableIds), sql`${schema.diningTable.status} <> ${data.status}`))
      .returning({ id: schema.diningTable.id, number: schema.diningTable.number });
    if (changed.length === 0) return { changed: 0, upcoming: 0 };

    await audit(tx, {
      actor,
      action: "table.status_changed_bulk",
      entityType: "dining_table",
      entityId: changed[0].id,
      after: { tables: changed.map((table) => table.number).sort((a, b) => a - b), status: data.status, reason: data.reason },
    });

    const [{ count }] = await tx
      .select({ count: sql<number>`count(distinct ${schema.tableAllocation.reservationId})::int` })
      .from(schema.tableAllocation)
      .where(
        and(
          inArray(
            schema.tableAllocation.tableId,
            changed.map((table) => table.id),
          ),
          eq(schema.tableAllocation.kind, "RESERVATION"),
          isNull(schema.tableAllocation.releasedAt),
          gt(sql`upper(${schema.tableAllocation.period})`, sql`now()`),
        ),
      );
    return { changed: changed.length, upcoming: data.status === "ACTIVE" ? 0 : count };
  });
}

const MIN_SIZE = 30;
const MAX_SIZE = 600;

const layoutSchema = z
  .array(
    z.object({
      id: z.string().uuid(),
      x: z.number().finite(),
      y: z.number().finite(),
      width: z.number().min(MIN_SIZE).max(MAX_SIZE),
      height: z.number().min(MIN_SIZE).max(MAX_SIZE),
      rotation: z.number().min(-180).max(180),
      shape: z.enum(["RECT", "ROUND"]),
    }),
  )
  .min(1)
  .max(200);

export type TableLayout = z.input<typeof layoutSchema>[number];

/** Saves where tables stand on the floor plan. A table's centre must stay inside the plan. */
export async function saveFloorLayout(db: Db, input: TableLayout[], actor: Actor): Promise<void> {
  const layout = parse(layoutSchema, input);
  await db.transaction(async (tx) => {
    const [plan] = await tx.select().from(schema.floorPlan).limit(1);
    if (!plan) throw new ConfigError("NOT_FOUND");
    if (layout.some((table) => table.x < 0 || table.x > plan.width || table.y < 0 || table.y > plan.height)) {
      throw new ConfigError("INVALID");
    }
    for (const { id, ...position } of layout) {
      const updated = await tx
        .update(schema.diningTable)
        .set({ ...position, updatedAt: new Date() })
        .where(eq(schema.diningTable.id, id))
        .returning({ id: schema.diningTable.id });
      if (updated.length === 0) throw new ConfigError("NOT_FOUND");
    }
    await audit(tx, {
      actor,
      action: "floor_plan.layout_saved",
      entityType: "floor_plan",
      entityId: plan.id,
      after: { tables: layout.length },
    });
  });
}

const newTableSchema = z
  .object({
    number: z.number().int().min(1).max(999),
    capacity: z.number().int().min(1).max(30),
    maxCapacity: z.number().int().min(1).max(30),
    categoryId: z.string().uuid(),
  })
  .refine((table) => table.maxCapacity >= table.capacity);

const NEW_TABLE_SIZE = 95;

/**
 * Adds a table. It starts inactive in the middle of the plan, so it can be
 * placed and checked before guests can book it.
 */
export async function createTable(db: Db, input: z.input<typeof newTableSchema>, actor: Actor): Promise<string> {
  const data = parse(newTableSchema, input);
  return db.transaction(async (tx) => {
    const [plan] = await tx.select().from(schema.floorPlan).limit(1);
    const [category] = await tx.select().from(schema.tableCategory).where(eq(schema.tableCategory.id, data.categoryId));
    if (!plan || !category) throw new ConfigError("INVALID");
    const existing = await tx.select().from(schema.diningTable).where(eq(schema.diningTable.number, data.number));
    if (existing.length > 0) throw new ConfigError("DUPLICATE");

    const [row] = await tx
      .insert(schema.diningTable)
      .values({
        ...data,
        status: "INACTIVE",
        floorPlanId: plan.id,
        x: plan.width / 2,
        y: plan.height / 2,
        width: NEW_TABLE_SIZE,
        height: NEW_TABLE_SIZE,
      })
      .returning({ id: schema.diningTable.id });
    await audit(tx, { actor, action: "table.created", entityType: "dining_table", entityId: row.id, after: data });
    return row.id;
  });
}
