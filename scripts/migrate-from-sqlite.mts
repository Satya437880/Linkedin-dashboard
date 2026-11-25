/*
 * One-time copy of the old local SQLite database into Supabase Postgres.
 *   DATABASE_URL=... npx tsx scripts/migrate-from-sqlite.mts [path/to/dashboard.db]
 * Run `npm run db:migrate` first. Refuses to run if the target already has prospects.
 */
import { DatabaseSync } from "node:sqlite";
import postgres from "postgres";

const file = process.argv[2] ?? "./data/dashboard.db";
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const ORDER = ["companies", "prospects", "conversations", "messages", "ai_insights", "activities", "stage_history", "notes", "tags", "prospect_tags", "attachments", "alerts", "invitations", "raw_events", "jobs", "settings", "prospect_audit"];
const JSON_COLS = new Set(["ai_overview", "output", "details", "payload", "value", "findings", "recommendations", "issues", "pain_points", "requirements"]);
const BOOL_COLS = new Set(["do_not_contact"]);
const TIME_COLS = (c: string) => c.endsWith("_at") || c === "run_after";
const SERIAL = ORDER.filter((t) => !["prospect_tags", "settings"].includes(t));

const src = new DatabaseSync(file, { readOnly: true });
const sql = postgres(url, { prepare: false, max: 1 });

const [{ n }] = await sql`select count(*)::int as n from prospects`;
if (n > 0) throw new Error(`Target already has ${n} prospects; refusing to copy over them.`);

const conv = (col: string, v: unknown) => {
  if (v === null || v === undefined) return null;
  if (BOOL_COLS.has(col)) return Boolean(v);
  if (TIME_COLS(col)) return new Date(Number(v));
  if (JSON_COLS.has(col)) return typeof v === "string" ? JSON.parse(v) : v;
  return v;
};

await sql.begin(async (tx) => {
  for (const table of ORDER) {
    const rows = src.prepare(`select * from ${table}`).all() as Record<string, unknown>[];
    if (!rows.length) continue;
    const out = rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, conv(k, v)])));
    // tags are seeded by the migration; replace them with the real rows, keeping their ids
    if (table === "tags") await tx`delete from tags`;
    for (let i = 0; i < out.length; i += 200) {
      const chunk = out.slice(i, i + 200);
      await tx`insert into ${tx(table)} ${tx(chunk as never)}`;
    }
    console.log(table.padEnd(16), rows.length);
  }
  for (const t of SERIAL) await tx.unsafe(`select setval(pg_get_serial_sequence('${t}', 'id'), coalesce((select max(id) from ${t}), 1), (select count(*) > 0 from ${t}))`);
});
console.log("done");
await sql.end();
