import { and, asc, count, desc, eq } from "drizzle-orm";
import type { DbBundle } from "../db/client";
import { activities, aiInsights, companies, messages, prospects } from "../db/schema";
import { leadScore } from "../scoring/leadScore";
import { checkDraft, DEFAULT_BANNED } from "./draftCheck";
import { classifyByRules, nextActionByRules, type Intent, type NextAction } from "./rules";

export const DEFAULT_SETTINGS = {
  ownerName: "Maple MPSS Team",
  signature: "Best regards,\nMaple MPSS Team",
  fixedParagraph: "Maple MPSS is a Canadian manufacturing sourcing company connecting OEMs with vetted machining and fabrication partners.",
  bannedWords: DEFAULT_BANNED,
};

type Kind = "intent" | "summary" | "next_action" | "suggested_reply" | "follow_up_draft";

const firstName = (full: string) => full.split(/\s+/)[0] ?? full;
const tz = () => process.env.APP_TIMEZONE ?? "America/Toronto";
const fmtDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeZone: tz() }).format(d);

async function save(b: DbBundle, prospectId: number, kind: Kind, output: unknown, engine: string, inputMessageId?: number) {
  await b.db.insert(aiInsights).values({ prospectId, kind, output, engine, promptVersion: "rules-v1", inputMessageId: inputMessageId ?? null });
}

export async function latestInsight<T = unknown>(b: DbBundle, prospectId: number, kind: Kind) {
  const r = (await b.db.select().from(aiInsights).where(and(eq(aiInsights.prospectId, prospectId), eq(aiInsights.kind, kind))).orderBy(desc(aiInsights.id)).limit(1))[0];
  return r ? { output: r.output as T, engine: r.engine, createdAt: r.createdAt } : null;
}

async function lastInbound(b: DbBundle, prospectId: number) {
  return (await b.db.select().from(messages).where(and(eq(messages.prospectId, prospectId), eq(messages.direction, "inbound"))).orderBy(desc(messages.sentAt)).limit(1))[0];
}

export async function classifyProspect(b: DbBundle, prospectId: number) {
  const p = (await b.db.select().from(prospects).where(eq(prospects.id, prospectId)).limit(1))[0];
  const msg = await lastInbound(b, prospectId);
  if (!p || !msg) return;
  const intent = classifyByRules(msg.text, msg.sentAt);
  const inboundCount =
    (await b.db.select({ n: count() }).from(messages).where(and(eq(messages.prospectId, prospectId), eq(messages.direction, "inbound"))))[0]?.n ?? 0;
  const category = intent?.category ?? "unclassified";
  await b.db
    .update(prospects)
    .set({
      category,
      categorySource: "rules",
      sentiment: intent?.sentiment ?? "neutral",
      leadScore: leadScore({ category, designation: p.designation, lastInboundAt: p.lastInboundAt, inboundCount }),
      ...(intent?.category === "not_now" && intent.follow_up_date ? { nextFollowUpAt: new Date(intent.follow_up_date) } : {}),
      ...(intent?.stop_contact ? { doNotContact: true, nextFollowUpAt: null } : {}),
    })
    .where(eq(prospects.id, prospectId));
  const stored: Intent | { category: "unclassified"; confidence: number; sentiment: "neutral"; reason: string; evidence_quote: string; follow_up_date: null; stop_contact: false } =
    intent ?? { category: "unclassified", confidence: 0, sentiment: "neutral", reason: "No keyword matched.", evidence_quote: "", follow_up_date: null, stop_contact: false };
  await save(b, prospectId, "intent", stored, "rules", msg.id);
  if (intent?.stop_contact) {
    await b.db
      .insert(activities)
      .values({ prospectId, actor: "system", action: "Stop Contact Requested", details: { evidence: intent.evidence_quote }, dedupeKey: `stop:${msg.id}` })
      .onConflictDoNothing();
  }
}

export async function summarizeProspect(b: DbBundle, prospectId: number) {
  const p = (await b.db.select().from(prospects).where(eq(prospects.id, prospectId)).limit(1))[0];
  const msgs = await b.db.select().from(messages).where(eq(messages.prospectId, prospectId)).orderBy(asc(messages.sentAt));
  const last = await lastInbound(b, prospectId);
  if (!p || !last) return;
  const co = p.companyId ? (await b.db.select().from(companies).where(eq(companies.id, p.companyId)).limit(1))[0] : null;
  const snippet = last.text.length > 160 ? `${last.text.slice(0, 160)}...` : last.text;
  const text = `${p.fullName}${p.designation ? `, ${p.designation}` : ""}${co ? ` at ${co.name}` : ""}, replied on ${fmtDate(last.sentAt)}: "${snippet}" The thread has ${msgs.length} message${msgs.length === 1 ? "" : "s"}.`;
  await save(b, prospectId, "summary", { text }, "rules", last.id);
}

export async function nextActionForProspect(b: DbBundle, prospectId: number) {
  const msg = await lastInbound(b, prospectId);
  if (!msg) return;
  const intent = (await latestInsight<Intent>(b, prospectId, "intent"))?.output ?? null;
  const usable = intent && intent.confidence > 0 ? intent : null;
  await save(b, prospectId, "next_action", nextActionByRules(usable, msg.text), "rules", msg.id);
}

const BODY: Record<NextAction["action"], string> = {
  send_capability_deck: "Thank you for your message. I have attached our capability deck, which covers our machining and fabrication network. Happy to go deeper on anything relevant to your parts.",
  schedule_meeting: "Thank you for your message. Would a short call this week work to discuss the project in more detail?",
  share_quotation: "Thank you for your message. Could you share drawings, material and expected quantities so we can prepare a quotation?",
  answer_question: "Thank you for your message. I will come back with a direct answer to your question shortly.",
  follow_up_in_days: "Thank you for letting me know. I will check back with you later.",
  no_action: "Thank you for your reply.",
};

export async function draftReplyForProspect(b: DbBundle, prospectId: number) {
  const p = (await b.db.select().from(prospects).where(eq(prospects.id, prospectId)).limit(1))[0];
  const msg = await lastInbound(b, prospectId);
  if (!p || !msg || p.doNotContact) return;
  const action = (await latestInsight<NextAction>(b, prospectId, "next_action"))?.output.action ?? "answer_question";
  const text = `Hi ${firstName(p.fullName)},\n\n${BODY[action]}\n\n${DEFAULT_SETTINGS.fixedParagraph}\n\n${DEFAULT_SETTINGS.signature}`;
  await save(b, prospectId, "suggested_reply", { text, check: checkDraft(text, DEFAULT_SETTINGS.bannedWords) }, "rules", msg.id);
}

export async function draftFollowUpForProspect(b: DbBundle, prospectId: number, n: 1 | 2 | 3) {
  const p = (await b.db.select().from(prospects).where(eq(prospects.id, prospectId)).limit(1))[0];
  if (!p || p.doNotContact) return;
  const openers = [
    "I wanted to follow up on my earlier note about your production needs.",
    "Following up again in case my last message got buried.",
    "This is my last follow-up for now. If timing is off, I will pause and check back later.",
  ];
  const text = `Hi ${firstName(p.fullName)},\n\n${openers[n - 1]}\n\n${DEFAULT_SETTINGS.fixedParagraph}\n\nWould a short call be useful?\n\n${DEFAULT_SETTINGS.signature}`;
  await save(b, prospectId, "follow_up_draft", { text, followUp: n, check: checkDraft(text, DEFAULT_SETTINGS.bannedWords) }, "rules");
}

export async function analyzeProspect(b: DbBundle, prospectId: number) {
  await classifyProspect(b, prospectId);
  await summarizeProspect(b, prospectId);
  await nextActionForProspect(b, prospectId);
  await draftReplyForProspect(b, prospectId);
}
