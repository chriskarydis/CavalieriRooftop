import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import * as schema from "@/server/db/schema";
import { audit, type Actor, type Db } from "./context";

/**
 * Manager configuration: tables, categories, combinations, pairings, opening
 * rules and reservation settings. Every change is validated here and written
 * to the audit log with before and after values. Callers must have authorised
 * the actor for the "configuration" permission.
 */

export type ConfigErrorCode = "INVALID" | "NOT_FOUND" | "IN_USE" | "DUPLICATE";

export class ConfigError extends Error {
  constructor(public readonly code: ConfigErrorCode) {
    super(code);
    this.name = "ConfigError";
  }
}

function parse<T>(shape: z.ZodType<T>, input: unknown): T {
  const result = shape.safeParse(input);
  if (!result.success) throw new ConfigError("INVALID");
  return result.data;
}

const localizedText = z.object({ en: z.string().trim().max(300), el: z.string().trim().max(300) });
const MAX_CENTS = 100_000;

// ── Tables ──────────────────────────────────────────────────────────────────

const tableSchema = z
  .object({
    capacity: z.number().int().min(1).max(30),
    maxCapacity: z.number().int().min(1).max(30),
    categoryId: z.string().uuid(),
    status: z.enum(["ACTIVE", "INACTIVE", "OUT_OF_SERVICE"]),
    statusReason: z.string().trim().max(200),
    onlineBookable: z.boolean(),
    autoAssignable: z.boolean(),
    priority: z.number().int().min(-100).max(100),
    viewDescription: localizedText,
    notes: z.string().trim().max(500),
  })
  .refine((table) => table.maxCapacity >= table.capacity);

export type TableInput = z.input<typeof tableSchema>;

/**
 * Updates a table. Returns how many upcoming reservations still sit on it, so
 * the manager can be told when a table they just disabled has bookings.
 */
export async function updateTable(db: Db, tableId: string, input: TableInput, actor: Actor): Promise<{ upcoming: number }> {
  const data = parse(tableSchema, input);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(schema.diningTable).where(eq(schema.diningTable.id, tableId));
    if (!before) throw new ConfigError("NOT_FOUND");
    const [category] = await tx.select().from(schema.tableCategory).where(eq(schema.tableCategory.id, data.categoryId));
    if (!category) throw new ConfigError("INVALID");

    const values = {
      ...data,
      statusReason: data.status === "ACTIVE" ? null : data.statusReason || null,
      notes: data.notes || null,
      updatedAt: new Date(),
    };
    await tx.update(schema.diningTable).set(values).where(eq(schema.diningTable.id, tableId));
    await audit(tx, {
      actor,
      action: before.status !== data.status ? "table.status_changed" : "table.updated",
      entityType: "dining_table",
      entityId: tableId,
      before: {
        capacity: before.capacity,
        maxCapacity: before.maxCapacity,
        categoryId: before.categoryId,
        status: before.status,
        onlineBookable: before.onlineBookable,
        autoAssignable: before.autoAssignable,
        priority: before.priority,
      },
      after: data,
    });

    const [{ count }] = await tx
      .select({ count: sql<number>`count(distinct ${schema.tableAllocation.reservationId})::int` })
      .from(schema.tableAllocation)
      .where(
        and(
          eq(schema.tableAllocation.tableId, tableId),
          eq(schema.tableAllocation.kind, "RESERVATION"),
          isNull(schema.tableAllocation.releasedAt),
          gt(sql`upper(${schema.tableAllocation.period})`, sql`now()`),
        ),
      );
    return { upcoming: count };
  });
}

// ── Categories ──────────────────────────────────────────────────────────────

const categorySchema = z.object({
  name: z.object({ en: z.string().trim().min(1).max(60), el: z.string().trim().min(1).max(60) }),
  description: localizedText,
  extraFeeCents: z.number().int().min(0).max(MAX_CENTS),
  feeCountsTowardMinSpend: z.boolean(),
  priority: z.number().int().min(-100).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  displayOrder: z.number().int().min(0).max(1000),
  active: z.boolean(),
});

export type CategoryInput = z.input<typeof categorySchema>;

export async function createCategory(db: Db, input: CategoryInput, actor: Actor): Promise<string> {
  const data = parse(categorySchema, input);
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(schema.tableCategory).values(data).returning({ id: schema.tableCategory.id });
    await audit(tx, { actor, action: "category.created", entityType: "table_category", entityId: row.id, after: data });
    return row.id;
  });
}

/**
 * Updates a category. A category that tables still use cannot be deactivated;
 * move those tables to another category first.
 */
export async function updateCategory(db: Db, categoryId: string, input: CategoryInput, actor: Actor): Promise<void> {
  const data = parse(categorySchema, input);
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(schema.tableCategory).where(eq(schema.tableCategory.id, categoryId));
    if (!before) throw new ConfigError("NOT_FOUND");
    if (before.active && !data.active) {
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.diningTable)
        .where(eq(schema.diningTable.categoryId, categoryId));
      if (count > 0) throw new ConfigError("IN_USE");
    }
    await tx.update(schema.tableCategory).set(data).where(eq(schema.tableCategory.id, categoryId));
    await audit(tx, {
      actor,
      action: before.extraFeeCents !== data.extraFeeCents ? "category.fee_changed" : "category.updated",
      entityType: "table_category",
      entityId: categoryId,
      before: {
        name: before.name,
        extraFeeCents: before.extraFeeCents,
        feeCountsTowardMinSpend: before.feeCountsTowardMinSpend,
        priority: before.priority,
        active: before.active,
      },
      after: data,
    });
  });
}

// ── Combinations and pairings ───────────────────────────────────────────────

const combinationSchema = z
  .object({
    capacity: z.number().int().min(2).max(40),
    minParty: z.number().int().min(1).max(40),
    active: z.boolean(),
    onlineBookable: z.boolean(),
    priority: z.number().int().min(-100).max(100),
  })
  .refine((combination) => combination.minParty <= combination.capacity);

export type CombinationInput = z.input<typeof combinationSchema>;

export async function updateCombination(db: Db, combinationId: string, input: CombinationInput, actor: Actor): Promise<void> {
  const data = parse(combinationSchema, input);
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(schema.tableCombination).where(eq(schema.tableCombination.id, combinationId));
    if (!before) throw new ConfigError("NOT_FOUND");
    await tx.update(schema.tableCombination).set(data).where(eq(schema.tableCombination.id, combinationId));
    await audit(tx, {
      actor,
      action: "combination.updated",
      entityType: "table_combination",
      entityId: combinationId,
      before: {
        capacity: before.capacity,
        minParty: before.minParty,
        active: before.active,
        onlineBookable: before.onlineBookable,
      },
      after: data,
    });
  });
}

const newCombinationSchema = z.object({
  tableIds: z.array(z.string().uuid()).min(2).max(6),
  capacity: z.number().int().min(2).max(40),
  minParty: z.number().int().min(1).max(40),
});

/** Declares that a set of tables may be joined. The manager is asserting they are physically adjacent. */
export async function createCombination(
  db: Db,
  input: z.input<typeof newCombinationSchema>,
  actor: Actor,
): Promise<string> {
  const data = parse(newCombinationSchema, input);
  const tableIds = [...new Set(data.tableIds)];
  if (tableIds.length < 2 || data.minParty > data.capacity) throw new ConfigError("INVALID");

  return db.transaction(async (tx) => {
    const tables = await tx.select().from(schema.diningTable).where(inArray(schema.diningTable.id, tableIds));
    if (tables.length !== tableIds.length) throw new ConfigError("INVALID");
    const name = tableIds
      .map((id) => tables.find((table) => table.id === id))
      .map((table) => (table?.isSpare ? "spare" : String(table?.number)))
      .join("+");
    const existing = await tx.select().from(schema.tableCombination).where(eq(schema.tableCombination.name, name));
    if (existing.length > 0) throw new ConfigError("DUPLICATE");

    const [row] = await tx
      .insert(schema.tableCombination)
      .values({ name, capacity: data.capacity, minParty: data.minParty })
      .returning({ id: schema.tableCombination.id });
    await tx
      .insert(schema.tableCombinationMember)
      .values(tableIds.map((tableId) => ({ combinationId: row.id, tableId })));
    await audit(tx, {
      actor,
      action: "combination.created",
      entityType: "table_combination",
      entityId: row.id,
      after: { name, ...data },
    });
    return row.id;
  });
}

export async function setPairingActive(db: Db, pairingId: string, active: boolean, actor: Actor): Promise<void> {
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(schema.combinationPairing)
      .set({ active })
      .where(eq(schema.combinationPairing.id, pairingId))
      .returning({ id: schema.combinationPairing.id });
    if (updated.length === 0) throw new ConfigError("NOT_FOUND");
    await audit(tx, {
      actor,
      action: "pairing.updated",
      entityType: "combination_pairing",
      entityId: pairingId,
      after: { active },
    });
  });
}

/** Declares that two combinations stand next to each other and may seat one large party together. */
export async function createPairing(db: Db, firstId: string, secondId: string, actor: Actor): Promise<void> {
  if (firstId === secondId) throw new ConfigError("INVALID");
  await db.transaction(async (tx) => {
    const combinations = await tx
      .select({ id: schema.tableCombination.id })
      .from(schema.tableCombination)
      .where(inArray(schema.tableCombination.id, [firstId, secondId]));
    if (combinations.length !== 2) throw new ConfigError("INVALID");
    const members = await tx
      .select()
      .from(schema.tableCombinationMember)
      .where(inArray(schema.tableCombinationMember.combinationId, [firstId, secondId]));
    if (new Set(members.map((member) => member.tableId)).size !== members.length) throw new ConfigError("INVALID");

    const existing = await tx.select().from(schema.combinationPairing);
    const duplicate = existing.some(
      (pairing) =>
        (pairing.firstCombinationId === firstId && pairing.secondCombinationId === secondId) ||
        (pairing.firstCombinationId === secondId && pairing.secondCombinationId === firstId),
    );
    if (duplicate) throw new ConfigError("DUPLICATE");

    const [row] = await tx
      .insert(schema.combinationPairing)
      .values({ firstCombinationId: firstId, secondCombinationId: secondId })
      .returning({ id: schema.combinationPairing.id });
    await audit(tx, {
      actor,
      action: "pairing.created",
      entityType: "combination_pairing",
      entityId: row.id,
      after: { firstId, secondId },
    });
  });
}

// ── Reservation settings and opening rules ──────────────────────────────────

const timeSlot = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const monthDay = z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);

const settingsSchema = z
  .object({
    depositPerPersonCents: z.number().int().min(0).max(MAX_CENTS),
    minBillableGuests: z.number().int().min(1).max(10),
    diningMinutes: z.number().int().min(30).max(600),
    blockMinutes: z.number().int().min(30).max(600),
    graceMinutes: z.number().int().min(0).max(120),
    refundCutoffHours: z.number().int().min(0).max(24 * 30),
    holdMinutes: z.number().int().min(2).max(60),
    minOnlineParty: z.number().int().min(1).max(40),
    maxOnlineParty: z.number().int().min(1).max(40),
    showMenuPrices: z.boolean(),
    timeSlots: z.array(timeSlot).min(1).max(48),
    closedWeekdays: z.array(z.number().int().min(1).max(7)).max(6),
    seasonStart: monthDay,
    seasonEnd: monthDay,
    retentionMonths: z.number().int().min(1).max(240).nullable(),
  })
  .refine(
    (settings) =>
      settings.blockMinutes >= settings.diningMinutes &&
      settings.minOnlineParty <= settings.maxOnlineParty &&
      settings.seasonStart <= settings.seasonEnd,
  );

export type SettingsInput = z.input<typeof settingsSchema>;

/** Changes apply to new bookings only; existing reservations keep their price snapshot and time block. */
export async function updateSettings(db: Db, input: SettingsInput, actor: Actor): Promise<void> {
  const data = parse(settingsSchema, input);
  const values = {
    ...data,
    timeSlots: [...new Set(data.timeSlots)].sort(),
    closedWeekdays: [...new Set(data.closedWeekdays)].sort(),
    updatedAt: new Date(),
  };
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(schema.restaurantSettings).limit(1);
    if (!before) throw new ConfigError("NOT_FOUND");
    await tx.update(schema.restaurantSettings).set(values).where(eq(schema.restaurantSettings.id, before.id));
    await audit(tx, {
      actor,
      action: "settings.updated",
      entityType: "restaurant_settings",
      entityId: String(before.id),
      before,
      after: values,
    });
  });
}

const closureSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().max(200),
});

/** Closes one date for online booking. Existing reservations on that date are not touched. */
export async function addClosure(db: Db, input: z.input<typeof closureSchema>, actor: Actor): Promise<void> {
  const data = parse(closureSchema, input);
  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(schema.closure)
      .values({ date: data.date, reason: data.reason || null })
      .onConflictDoNothing()
      .returning({ id: schema.closure.id });
    if (inserted.length === 0) throw new ConfigError("DUPLICATE");
    await audit(tx, { actor, action: "closure.added", entityType: "closure", entityId: inserted[0].id, after: data });
  });
}

export async function removeClosure(db: Db, closureId: string, actor: Actor): Promise<void> {
  await db.transaction(async (tx) => {
    const removed = await tx.delete(schema.closure).where(eq(schema.closure.id, closureId)).returning();
    if (removed.length === 0) throw new ConfigError("NOT_FOUND");
    await audit(tx, { actor, action: "closure.removed", entityType: "closure", entityId: closureId, before: removed[0] });
  });
}
