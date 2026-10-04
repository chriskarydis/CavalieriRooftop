import { asc, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { diningTable, floorPlan, tableCategory } from "@/server/db/schema";
import type { FloorPlanView } from "@/ui/floor-plan/types";

/** Every configured table with its position, for drawing the floor plan. */
export async function getFloorPlanView(): Promise<FloorPlanView | null> {
  const [plan] = await db.select().from(floorPlan).limit(1);
  if (!plan) return null;

  const [categories, tables] = await Promise.all([
    db.select().from(tableCategory).where(eq(tableCategory.active, true)).orderBy(asc(tableCategory.displayOrder)),
    db
      .select({ table: diningTable, color: tableCategory.color })
      .from(diningTable)
      .innerJoin(tableCategory, eq(diningTable.categoryId, tableCategory.id))
      .where(eq(diningTable.floorPlanId, plan.id))
      .orderBy(asc(diningTable.number)),
  ]);

  return {
    width: plan.width,
    height: plan.height,
    shapes: plan.shapes,
    categories: categories.map(({ id, name, extraFeeCents, color }) => ({ id, name, extraFeeCents, color })),
    tables: tables.map(({ table, color }) => ({
      id: table.id,
      number: table.number,
      capacity: table.capacity,
      maxCapacity: table.maxCapacity,
      isSpare: table.isSpare,
      categoryId: table.categoryId,
      viewDescription: table.viewDescription,
      x: table.x,
      y: table.y,
      width: table.width,
      height: table.height,
      rotation: table.rotation,
      shape: table.shape,
      color,
      muted: table.status !== "ACTIVE",
    })),
  };
}
