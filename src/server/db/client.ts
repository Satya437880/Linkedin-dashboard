import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;
export type DbBundle = { db: Db; sqlite: Database.Database };

export const SEED_TAGS = ["Aerospace", "Automotive", "Medical", "Procurement", "OEM", "CNC Machining", "Packaging", "Agriculture"];

const TRIGGERS = `
CREATE TRIGGER IF NOT EXISTS activities_no_update BEFORE UPDATE ON activities
BEGIN SELECT RAISE(ABORT, 'activities is append-only'); END;
CREATE TRIGGER IF NOT EXISTS activities_no_delete BEFORE DELETE ON activities
BEGIN SELECT RAISE(ABORT, 'activities is append-only'); END;
CREATE TRIGGER IF NOT EXISTS stage_history_no_update BEFORE UPDATE ON stage_history
BEGIN SELECT RAISE(ABORT, 'stage_history is append-only'); END;
CREATE TRIGGER IF NOT EXISTS stage_history_no_delete BEFORE DELETE ON stage_history
BEGIN SELECT RAISE(ABORT, 'stage_history is append-only'); END;
CREATE TRIGGER IF NOT EXISTS messages_no_delete BEFORE DELETE ON messages
BEGIN SELECT RAISE(ABORT, 'messages are never deleted'); END;
CREATE TRIGGER IF NOT EXISTS prospects_no_delete BEFORE DELETE ON prospects
BEGIN SELECT RAISE(ABORT, 'prospects are archived, never deleted'); END;
`;

export function openDb(file: string): DbBundle {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.resolve(process.cwd(), "src/server/db/migrations") });
  sqlite.exec(TRIGGERS);
  const insTag = sqlite.prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)");
  for (const t of SEED_TAGS) insTag.run(t);
  return { db, sqlite };
}

const g = globalThis as unknown as { __dbBundle?: DbBundle };

export function getBundle(): DbBundle {
  if (!g.__dbBundle) g.__dbBundle = openDb(process.env.DATABASE_PATH ?? "./data/dashboard.db");
  return g.__dbBundle;
}

export function getDb(): Db {
  return getBundle().db;
}
