/* Feeds the extension parsers' output (from saved fixtures) into the app's ingestEvent() on a throwaway in-memory Postgres. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { count } from "drizzle-orm";
import { openMemoryDb } from "../src/server/db/testDb";
import { activities, alerts, messages, prospects } from "../src/server/db/schema";
import { ingestEvent } from "../src/server/ingest/ingestEvent";
import { parseJson } from "../../extension/src/parsers";

const b = await openMemoryDb();
for (const f of ["classic-thread.json", "salesnav-thread.json"]) {
  const json = JSON.parse(readFileSync(resolve(process.cwd(), "../extension/fixtures", f), "utf8"));
  const events = parseJson(json);
  const results: string[] = [];
  for (const e of events) results.push((await ingestEvent(b, e)).status);
  const again: string[] = [];
  for (const e of events) again.push((await ingestEvent(b, e)).status);
  console.log(f, "first:", results.join(","), "| replay:", again.join(","));
}
const n = async (t: typeof prospects | typeof messages | typeof activities | typeof alerts) => (await b.db.select({ n: count() }).from(t))[0].n;
console.log({ prospects: await n(prospects), messages: await n(messages), activities: await n(activities), alerts: await n(alerts) });
