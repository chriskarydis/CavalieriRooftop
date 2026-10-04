import "dotenv/config";
import { sql } from "drizzle-orm";
import { COMBINATIONS, PAIRINGS, TABLES } from "@/config/initial-floor";
import * as schema from "./schema";
import { seedInitialConfiguration } from "./seed-config";

/**
 * Loads the initial restaurant configuration. Refuses to run on a database
 * that already has tables configured, so it can never overwrite manager edits.
 */
async function main(): Promise<void> {
  const { db } = await import("./client");

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.diningTable);
  if (count > 0) {
    console.log("Tables already configured; seed skipped.");
    return;
  }
  await seedInitialConfiguration(db);
  console.log(`Seeded ${TABLES.length} tables, ${COMBINATIONS.length} combinations, ${PAIRINGS.length} pairings.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
