import "dotenv/config";

/**
 * Replaces the menu in the database with the three lists in
 * src/config/initial-menu.ts. Everything typed in at /manage/menu is lost, so
 * this is for development databases and first set-up only.
 *
 *   npx tsx scripts/sync-menu.ts
 */
async function main(): Promise<void> {
  const { db } = await import("@/server/db/client");
  const { seedInitialMenu } = await import("@/server/db/seed-menu");
  const { MENU } = await import("@/config/initial-menu");
  await seedInitialMenu(db);
  console.log(`Menu replaced: ${MENU.length} sections, ${MENU.reduce((sum, section) => sum + section.dishes.length, 0)} entries.`);
  process.exit(0);
}

void main();
