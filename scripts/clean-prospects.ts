/* One-off tidy: strips scraped page text (e.g. "Status is offline") from saved prospects and splits
 * the headline into designation and company. Updates only; nothing is deleted. Safe to re-run. */
import { eq, sql } from "drizzle-orm";
import { analyzeProspect, latestInsight } from "../src/server/ai/analyze";
import { getBundle } from "../src/server/db/client";
import { companies, messages, prospects } from "../src/server/db/schema";
import { cleanHeadline, cleanName } from "../src/lib/clean";
import { enqueueJob, parseHeadline } from "../src/server/ingest/ingestEvent";

const b = getBundle();
let changed = 0;

for (const p of (await b.db.select().from(prospects))) {
  const fullName = cleanName(p.fullName) || p.fullName;
  const headline = cleanHeadline(p.headline, p.fullName) ?? cleanHeadline(null, p.fullName);
  const { designation, companyName } = parseHeadline(headline);

  let companyId = p.companyId;
  if (!companyId && companyName) {
    const ex = (await b.db.select().from(companies).where(sql`lower(${companies.name}) = lower(${companyName})`).limit(1))[0];
    companyId = ex ? ex.id : (await b.db.insert(companies).values({ name: companyName }).returning({ id: companies.id }))[0].id;
    if (!ex) (await enqueueJob(b, "enrich_company", { companyId }));
  }

  if (fullName !== p.fullName || headline !== p.headline || designation !== p.designation || companyId !== p.companyId) {
    (await b.db.update(prospects).set({ fullName, headline, designation, companyId }).where(eq(prospects.id, p.id)));
    (await b.db.update(messages).set({ senderName: fullName }).where(sql`${messages.prospectId} = ${p.id} and ${messages.direction} = 'inbound'`));
    changed++;
  }

  // Make sure anyone who has replied is tagged (status, sentiment, summary, next action, draft).
  const hasReply = (await b.db.select({ n: sql<number>`count(*)` }).from(messages).where(sql`${messages.prospectId} = ${p.id} and ${messages.direction} = 'inbound'`).limit(1))[0]?.n ?? 0;
  if (hasReply && !(await latestInsight(b, p.id, "intent"))) (await analyzeProspect(b, p.id));
}

console.log(`Tidied ${changed} prospect(s).`);
