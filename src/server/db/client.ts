import { drizzle } from "drizzle-orm/postgres-js";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as schema from "./schema";

/** Works for the live Supabase connection, a transaction, and the in-memory test database. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type DbBundle = { db: Db };

export const SEED_TAGS = ["Aerospace", "Automotive", "Medical", "Procurement", "OEM", "CNC Machining", "Packaging", "Agriculture"];

const g = globalThis as unknown as { __dbBundle?: DbBundle };

/**
 * `prepare: false` is required by Supabase's transaction pooler. Keep `max` at 4: with a single connection the pooler
 * stalls when pages run two queries at once, and big bursts of simultaneous queries stall it too.
 */
export function getBundle(): DbBundle {
  if (!g.__dbBundle) {
    // The Supabase/Vercel integration names it POSTGRES_URL; accept either, and ignore stray quotes or spaces.
    const url = (process.env.DATABASE_URL || process.env.POSTGRES_URL || "").trim().replace(/^["']|["']$/g, "");
    if (!url) throw new Error("DATABASE_URL is not set");
    if (/[\[\]]/.test(url.split("@")[0] ?? "")) throw new Error("DATABASE_URL still contains the [YOUR-PASSWORD] placeholder");
    const client = postgres(url, { prepare: false, max: 4, idle_timeout: 20, connect_timeout: 15 });
    g.__dbBundle = { db: drizzle(client, { schema }) as unknown as Db };
  }
  return g.__dbBundle;
}

export function getDb(): Db {
  return getBundle().db;
}
