import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";
import * as schema from "./schema";
import type { Db, DbBundle } from "./client";

/** A fresh in-memory Postgres with every migration applied. Used by tests only. */
export async function openMemoryDb(): Promise<DbBundle> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "src/server/db/migrations") });
  return { db: db as unknown as Db };
}
