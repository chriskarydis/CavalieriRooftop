import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { E2E_DATABASE_URL } from "../../playwright.config";
import * as schema from "../../src/server/db/schema";
import { seedInitialConfiguration } from "../../src/server/db/seed-config";

export const E2E_STAFF = { email: "manager@e2e.test", password: "e2e-manager-password", name: "Eleni Manager" };

/** Recreates the end-to-end database from scratch: schema, initial floor and one manager. */
export default async function globalSetup(): Promise<void> {
  const admin = postgres(process.env.DATABASE_URL ?? "", { max: 1, onnotice: () => {} });
  await admin.unsafe("DROP DATABASE IF EXISTS cavalieri_e2e WITH (FORCE)");
  await admin.unsafe("CREATE DATABASE cavalieri_e2e");
  await admin.end();

  const client = postgres(E2E_DATABASE_URL, { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema, casing: "snake_case" });
  await migrate(db, { migrationsFolder: "./drizzle" });
  await seedInitialConfiguration(db);

  const userId = randomUUID();
  await db
    .insert(schema.staffUser)
    .values({ id: userId, name: E2E_STAFF.name, email: E2E_STAFF.email, emailVerified: true, role: "MANAGER" });
  await db.insert(schema.staffAccount).values({
    id: randomUUID(),
    userId,
    accountId: userId,
    providerId: "credential",
    password: await hashPassword(E2E_STAFF.password),
  });
  await client.end();
}
