import "dotenv/config";
import { eq } from "drizzle-orm";
import { FLOOR_PLAN, TABLES } from "@/config/initial-floor";

/**
 * Copies the drawing in src/config/initial-floor.ts (walls, labels, and each
 * table's position, size and rotation) over the floor plan in the database.
 * Nothing else about a table changes. Positions set in the floor-plan editor
 * are overwritten, so this is for development databases and first set-up.
 *
 *   npx tsx scripts/sync-floor.ts
 */
async function main(): Promise<void> {
  const { db } = await import("@/server/db/client");
  const schema = await import("@/server/db/schema");
  await db.transaction(async (tx) => {
    await tx.update(schema.floorPlan).set({
      width: FLOOR_PLAN.width,
      height: FLOOR_PLAN.height,
      shapes: structuredClone(FLOOR_PLAN.shapes) as unknown as (typeof schema.floorPlan.$inferInsert)["shapes"],
    });
    for (const table of TABLES) {
      await tx
        .update(schema.diningTable)
        .set({ x: table.x, y: table.y, width: table.width, height: table.height, rotation: table.rotation ?? 0 })
        .where(eq(schema.diningTable.number, table.number));
    }
  });
  console.log(`Floor plan synchronised: ${TABLES.length} tables.`);
  process.exit(0);
}

void main();
