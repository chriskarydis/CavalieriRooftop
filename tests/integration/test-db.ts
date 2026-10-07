import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "@/server/db/schema";

const TEST_DATABASE = "cavalieri_test";

/** Creates (if needed) and migrates a dedicated test database, then empties it. */
const ALL_TABLES = `waiting_entry, lookup_attempt, menu_item_allergen, menu_item_image, menu_item, menu_category, allergen, audit_log, email_log, notification, refund, payment, stripe_event, reservation_event,
  table_allocation, reservation, walk_in, customer, combination_pairing, table_combination_member,
  table_combination, dining_table, floor_plan, table_category, closure, restaurant_settings`;

export async function resetTestDatabase(client: postgres.Sql): Promise<void> {
  await client.unsafe(`TRUNCATE ${ALL_TABLES} CASCADE`);
}

export async function openTestDatabase() {
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) throw new Error("DATABASE_URL is not set");

  const admin = postgres(baseUrl, { max: 1, onnotice: () => {} });
  const existing = await admin`SELECT 1 FROM pg_database WHERE datname = ${TEST_DATABASE}`;
  if (existing.length === 0) await admin.unsafe(`CREATE DATABASE ${TEST_DATABASE}`);
  await admin.end();

  const url = new URL(baseUrl);
  url.pathname = `/${TEST_DATABASE}`;
  const client = postgres(url.toString(), { max: 25, onnotice: () => {} });
  const db = drizzle(client, { schema, casing: "snake_case" });
  await migrate(db, { migrationsFolder: "./drizzle" });
  await resetTestDatabase(client);
  return { db, client, close: () => client.end() };
}
