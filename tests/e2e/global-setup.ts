import { chromium, type FullConfig } from "@playwright/test";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { E2E_DATABASE_URL } from "../../playwright.config";
import * as schema from "../../src/server/db/schema";
import { seedInitialConfiguration } from "../../src/server/db/seed-config";
import { seedInitialMenu } from "../../src/server/db/seed-menu";
import { createStaff } from "../../src/server/services/staff";

export const E2E_STAFF = { email: "manager@e2e.test", password: "e2e-manager-password", name: "Eleni Manager" };
export const E2E_DEVELOPER = { email: "developer@e2e.test", password: "e2e-developer-password", name: "Dimitris Developer" };

/** Signed-in sessions, reused by specs so each test does not sign in again. */
export const MANAGER_SESSION = "tests/e2e/.auth/manager.json";
export const DEVELOPER_SESSION = "tests/e2e/.auth/developer.json";

/** Recreates the end-to-end database (schema, initial floor, menu, two staff) and signs each of them in once. */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const admin = postgres(process.env.DATABASE_URL ?? "", { max: 1, onnotice: () => {} });
  await admin.unsafe("DROP DATABASE IF EXISTS cavalieri_e2e WITH (FORCE)");
  await admin.unsafe("CREATE DATABASE cavalieri_e2e");
  await admin.end();

  const client = postgres(E2E_DATABASE_URL, { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema, casing: "snake_case" });
  await migrate(db, { migrationsFolder: "./drizzle" });
  await seedInitialConfiguration(db);
  await seedInitialMenu(db);
  await createStaff(db, { ...E2E_STAFF, role: "MANAGER" }, "test-setup");
  await createStaff(db, { ...E2E_DEVELOPER, role: "DEVELOPER" }, "test-setup");
  await client.end();

  const browser = await chromium.launch();
  for (const [account, file] of [
    [E2E_STAFF, MANAGER_SESSION],
    [E2E_DEVELOPER, DEVELOPER_SESSION],
  ] as const) {
    const context = await browser.newContext({ baseURL: config.projects[0].use.baseURL });
    const page = await context.newPage();
    await page.goto("/manage/login");
    await page.getByLabel("Email").fill(account.email);
    await page.getByLabel("Password").fill(account.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((url) => url.pathname === "/manage");
    await context.storageState({ path: file });
    await context.close();
  }
  await browser.close();
}
