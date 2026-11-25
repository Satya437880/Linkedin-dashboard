/* After the sides were corrected: hide sheet replies that the real conversation also contains, then categorise
 * prospects whose reply was not analysed yet. Nothing is deleted. Safe to run again. */
import { and, eq, isNull, sql } from "drizzle-orm";
import { analyzeProspect } from "../src/server/ai/analyze";
import { getBundle } from "../src/server/db/client";
import { messages, prospects } from "../src/server/db/schema";
import { markSheetDuplicates } from "../src/server/ingest/dedupe";

const b = getBundle();
const hidden = markSheetDuplicates(b);
console.log(`Sheet replies hidden because the real conversation has them: ${hidden}`);

let categorised = 0;
for (const p of b.db.select().from(prospects).where(and(eq(prospects.category, "unclassified"), isNull(prospects.archivedAt))).all()) {
  if (p.categorySource === "manual") continue;
  const n = b.db.select({ c: sql<number>`count(*)` }).from(messages).where(and(eq(messages.prospectId, p.id), eq(messages.direction, "inbound"), isNull(messages.duplicateOf))).get()!.c;
  if (!n) continue;
  analyzeProspect(b, p.id);
  if (b.db.select().from(prospects).where(eq(prospects.id, p.id)).get()!.category !== "unclassified") categorised++;
}
console.log(`Prospects now categorised from their reply: ${categorised}`);
