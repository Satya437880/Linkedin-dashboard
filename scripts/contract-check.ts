/* Feeds the extension parsers' output (from saved fixtures) into the app's ingestEvent() on a throwaway in-memory DB. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { openDb } from "../src/server/db/client";
import { ingestEvent } from "../src/server/ingest/ingestEvent";
import { parseJson } from "../../extension/src/parsers";

const b = openDb(":memory:");
for (const f of ["classic-thread.json", "salesnav-thread.json"]) {
  const json = JSON.parse(readFileSync(resolve(process.cwd(), "../extension/fixtures", f), "utf8"));
  const events = parseJson(json);
  const results = events.map((e) => ingestEvent(b, e).status);
  const again = events.map((e) => ingestEvent(b, e).status);
  console.log(f, "first:", results.join(","), "| replay:", again.join(","));
}
const n = (t: string) => (b.sqlite.prepare(`select count(*) c from ${t}`).get() as { c: number }).c;
console.log({ prospects: n("prospects"), messages: n("messages"), activities: n("activities"), alerts: n("alerts") });
