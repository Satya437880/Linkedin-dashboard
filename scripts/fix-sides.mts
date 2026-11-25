/* Repairs messages the extension saved on the wrong side. Dry run by default; pass --apply to change data.
 *   npx tsx scripts/fix-sides.mts            (shows what would change)
 *   npx tsx scripts/fix-sides.mts --apply    (changes it, through the same correction path the extension uses)
 */
import { and, eq, like } from "drizzle-orm";
import { getBundle } from "../src/server/db/client";
import { conversations, messages, prospects } from "../src/server/db/schema";
import { ingestEvent } from "../src/server/ingest/ingestEvent";
import { whoWrote } from "../src/server/ingest/sides";

const apply = process.argv.includes("--apply");
const b = getBundle();

const rows = await b.db
  .select({ m: messages, p: prospects, thread: conversations.externalThreadId, inbox: conversations.inbox })
  .from(messages)
  .innerJoin(prospects, eq(messages.prospectId, prospects.id))
  .innerJoin(conversations, eq(messages.conversationId, conversations.id))
  .where(and(like(messages.externalMessageId, "dom:%"), eq(messages.direction, "outbound")));

let toClient = 0, staysOurs = 0, unsure = 0, done = 0;
const lines: string[] = [];
const unsureList: string[] = [];
for (const { m, p, thread, inbox } of rows) {
  const v = whoWrote(m.text, p.fullName);
  const short = m.text.replace(/\s+/g, " ").slice(0, 70);
  if (!v) { unsure++; unsureList.push(`${p.fullName.slice(0, 20).padEnd(20)} | ${short}`); continue; }
  if (v.side === "ours") { staysOurs++; continue; }
  toClient++;
  lines.push(`${p.fullName.slice(0, 20).padEnd(20)} | ${v.why.padEnd(28)} | ${short}`);
  if (apply) {
    // Same path the extension uses, so the audit log, reply times and analysis jobs are handled for us.
    const r = (await ingestEvent(b, {
      source: "extension", eventType: "message.new", externalMessageId: m.externalMessageId, externalThreadId: thread,
      inbox: inbox === "sales_navigator" ? "sales_navigator" : "classic", direction: "inbound", text: m.text, sentAt: m.sentAt,
      sender: { providerUserId: p.providerUserId, fullName: p.fullName, headline: p.headline },
    }));
    if (r.status === "corrected") done++;
  }
}

console.log(`Messages saved as ours by the page reader: ${rows.length}`);
console.log(`  stay as ours (clearly ours):     ${staysOurs}`);
console.log(`  move to Client message:          ${toClient}${apply ? ` (done: ${done})` : ""}`);
console.log(`  not sure, left alone:            ${unsure}`);
console.log("\n--- moving to Client message ---\n" + lines.join("\n"));
console.log("\n--- not sure (left as ours) ---\n" + unsureList.join("\n"));
console.log(apply ? "\nApplied." : "\nDry run only. Nothing was changed.");
