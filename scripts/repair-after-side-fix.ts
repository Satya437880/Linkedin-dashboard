/* After the sides were corrected: hide sheet replies that the real conversation also contains, then categorise
 * prospects whose reply was not analysed yet. Nothing is deleted. Safe to run again. */
import { and, eq, isNull, sql } from "drizzle-orm";
import { analyzeProspect } from "../src/server/ai/analyze";
import { getBundle } from "../src/server/db/client";
import { messages, prospects } from "../src/server/db/schema";
import { markSheetDuplicates } from "../src/server/ingest/dedupe";

const b = getBundle();
const hidden = (await markSheetDuplicates(b));
console.log(`Sheet replies hidden because the real conversation has them: ${hidden}`);

let categorised = 0;
for (const p of (await b.db.select().from(prospects).where(and(eq(prospects.category, "unclassified"), isNull(prospects.archivedAt))))) {
  if (p.categorySource === "manual") continue;
  const n = (await b.db.select({ c: sql<number>`count(*)` }).from(messages).where(and(eq(messages.prospectId, p.id), eq(messages.direction, "inbound"), isNull(messages.duplicateOf))).limit(1))[0].c;
  if (!n) continue;
  (await analyzeProspect(b, p.id));
  if ((await b.db.select().from(prospects).where(eq(prospects.id, p.id)).limit(1))[0].category !== "unclassified") categorised++;
}
console.log(`Prospects now categorised from their reply: ${categorised}`);
