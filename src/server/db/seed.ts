import "dotenv/config";
import { sql } from "drizzle-orm";
import * as schema from "./schema";
import { seedInitialConfiguration } from "./seed-config";
import { seedInitialMenu } from "./seed-menu";

/**
 * Loads the initial restaurant configuration and menu. Each part is skipped
 * when the database already has data for it, so the seed can never overwrite
 * what the manager has edited.
 */
async function main(): Promise<void> {
  const { db } = await import("./client");
  const count = sql<number>`count(*)::int`;

  const [tables] = await db.select({ count }).from(schema.diningTable);
  if (tables.count > 0) console.log("Tables already configured; floor seed skipped.");
  else {
    await seedInitialConfiguration(db);
    console.log("Seeded floor configuration.");
  }

  const [categories] = await db.select({ count }).from(schema.menuCategory);
  const [allergens] = await db.select({ count }).from(schema.allergen);
  if (categories.count > 0 || allergens.count > 0) console.log("Menu already present; menu seed skipped.");
  else {
    await seedInitialMenu(db);
    console.log("Seeded menu.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
