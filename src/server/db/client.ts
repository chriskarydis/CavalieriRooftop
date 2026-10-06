import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

/**
 * Hosted Postgres (Neon) is reached through a connection pooler, which cannot
 * keep prepared statements between queries. Its host name contains "-pooler".
 */
const pooled = new URL(url).hostname.includes("-pooler");

/** Each serverless instance keeps few connections; the pooler multiplexes them. */
const MAX_CONNECTIONS = process.env.NODE_ENV === "production" ? 5 : 10;

// Reuse one connection pool across hot reloads in development.
const globalForDb = globalThis as unknown as { pgClient?: ReturnType<typeof postgres> };
const client = globalForDb.pgClient ?? postgres(url, { max: MAX_CONNECTIONS, prepare: !pooled });
if (process.env.NODE_ENV !== "production") globalForDb.pgClient = client;

export const db = drizzle(client, { schema, casing: "snake_case" });
export type Database = typeof db;
