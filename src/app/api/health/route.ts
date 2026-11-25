import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Setup check: which settings exist (yes/no only, never the values) and whether the database answers. */
export async function GET() {
  const has = (k: string) => Boolean(process.env[k]);
  const env = {
    DATABASE_URL: has("DATABASE_URL") || has("POSTGRES_URL"),
    INGEST_TOKEN: has("INGEST_TOKEN"),
    CRON_SECRET: has("CRON_SECRET"),
  };
  let db: { ok: boolean; tables?: number; error?: string } = { ok: false, error: "DATABASE_URL is not set" };
  if (env.DATABASE_URL) {
    const raw = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
    (env as Record<string, unknown>).DATABASE_URL_looks_valid = /^postgres(ql)?:\/\/[^:]+:[^@\[\]]+@[^/]+:\d+\/\w+/.test(raw.trim());
    (env as Record<string, unknown>).DATABASE_URL_port = raw.match(/:(\d{4})\//)?.[1] ?? null;
    try {
      const r = await getDb().execute(sql`select count(*)::int as n from information_schema.tables where table_schema = 'public'`);
      const rows = (Array.isArray(r) ? r : (r as unknown as { rows: { n: number }[] }).rows) as { n: number }[];
      db = { ok: true, tables: rows[0]?.n };
    } catch (e) {
      const err = e as { code?: string; message?: string };
      db = { ok: false, error: `${err.code ?? "error"}: ${(err.message ?? "").replace(/postgres(ql)?:\/\/\S+/gi, "[url]").slice(0, 160)}` };
    }
  }
  return NextResponse.json({ env, db }, { status: db.ok ? 200 : 500, headers: { "cache-control": "no-store" } });
}
