import { drizzle } from "drizzle-orm/postgres-js";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as schema from "./schema";

/** Works for the live Supabase connection, a transaction, and the in-memory test database. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type DbBundle = { db: Db };

export const SEED_TAGS = ["Aerospace", "Automotive", "Medical", "Procurement", "OEM", "CNC Machining", "Packaging", "Agriculture"];

const g = globalThis as unknown as { __dbBundle?: DbBundle };

/** One small connection per serverless instance. `prepare: false` is required by Supabase's transaction pooler. */
export function getBundle(): DbBundle {
  if (!g.__dbBundle) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const client = postgres(url, { prepare: false, max: 1, idle_timeout: 20, connect_timeout: 15 });
    g.__dbBundle = { db: drizzle(client, { schema }) as unknown as Db };
  }
  return g.__dbBundle;
}

export function getDb(): Db {
  return getBundle().db;
}
