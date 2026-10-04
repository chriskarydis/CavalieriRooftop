import {
  CATEGORIES,
  COMBINATIONS,
  DEFAULT_SETTINGS,
  FLOOR_PLAN,
  PAIRINGS,
  TABLES,
} from "@/config/initial-floor";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

/**
 * Inserts the initial restaurant configuration: settings, categories, floor
 * plan, tables, combinations and pairings.
 */
export async function seedInitialConfiguration(db: PostgresJsDatabase<typeof schema>): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(schema.restaurantSettings).values({
      id: 1,
      ...DEFAULT_SETTINGS,
      timeSlots: [...DEFAULT_SETTINGS.timeSlots],
      closedWeekdays: [...DEFAULT_SETTINGS.closedWeekdays],
    });

    const categories = await tx
      .insert(schema.tableCategory)
      .values(
        CATEGORIES.map((category, order) => ({
          name: category.name,
          extraFeeCents: category.feeCents,
          priority: category.priority,
          color: category.color,
          displayOrder: order,
        })),
      )
      .returning({ id: schema.tableCategory.id });
    const categoryId = new Map(CATEGORIES.map((category, i) => [category.key, categories[i].id]));

    const [plan] = await tx
      .insert(schema.floorPlan)
      .values({
        name: FLOOR_PLAN.name,
        width: FLOOR_PLAN.width,
        height: FLOOR_PLAN.height,
        shapes: structuredClone(FLOOR_PLAN.shapes) as unknown as schema.FloorShape[],
      })
      .returning({ id: schema.floorPlan.id });

    const tables = await tx
      .insert(schema.diningTable)
      .values(
        TABLES.map((table) => ({
          number: table.number,
          capacity: table.capacity,
          maxCapacity: table.maxCapacity ?? table.capacity,
          categoryId: categoryId.get(table.category)!,
          status: table.status ?? ("ACTIVE" as const),
          isSpare: table.isSpare ?? false,
          onlineBookable: table.onlineBookable ?? true,
          autoAssignable: table.autoAssignable ?? true,
          notes: table.notes,
          floorPlanId: plan.id,
          x: table.x,
          y: table.y,
          width: table.width,
          height: table.height,
          shape: table.shape,
        })),
      )
      .returning({ id: schema.diningTable.id, number: schema.diningTable.number });
    const tableId = new Map(tables.map((table) => [table.number, table.id]));

    const combinationId = new Map<string, string>();
    for (const combination of COMBINATIONS) {
      const [row] = await tx
        .insert(schema.tableCombination)
        .values({
          name: combination.key,
          capacity: combination.capacity,
          minParty: combination.minParty,
          active: combination.active ?? true,
          onlineBookable: combination.onlineBookable ?? true,
        })
        .returning({ id: schema.tableCombination.id });
      combinationId.set(combination.key, row.id);
      await tx.insert(schema.tableCombinationMember).values(
        combination.tables.map((number) => ({ combinationId: row.id, tableId: tableId.get(number)! })),
      );
    }

    await tx.insert(schema.combinationPairing).values(
      PAIRINGS.map(([first, second]) => ({
        firstCombinationId: combinationId.get(first)!,
        secondCombinationId: combinationId.get(second)!,
      })),
    );
  });
}
