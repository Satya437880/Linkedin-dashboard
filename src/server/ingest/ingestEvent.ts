import { and, eq, max, sql } from "drizzle-orm";
import type { DbBundle } from "../db/client";
import { activities, alerts, companies, conversations, jobs, messages, prospects, rawEvents } from "../db/schema";
import { cleanHeadline, cleanName } from "../../lib/clean";
import { markSheetDuplicates } from "./dedupe";
import { ingestEventSchema, type IngestEvent } from "./schema";

export type IngestResult =
  | { status: "duplicate" }
  | { status: "corrected"; prospectId: number; messageId: number }
  | { status: "stored_only"; reason: string }
  | { status: "processed"; prospectId: number; messageId: number; createdProspect: boolean };

/** "Plant Manager at Acme Corp" -> { designation, companyName }. Returns nulls when no clear split. */
export function parseHeadline(headline?: string | null): { designation: string | null; companyName: string | null } {
  if (!headline) return { designation: null, companyName: null };
  const m = headline.match(/^(.*?)\s+(?:at\s+|@\s*)(.+)$/i);
  if (!m) return { designation: headline.trim() || null, companyName: null };
  // Headlines often carry more after the company ("... @ Shred-Tech | Product Design"); keep only the name.
  const companyName = m[2].split(/\s*[|•·;]\s*|\s+[-–—]\s+/)[0].trim();
  return { designation: m[1].trim() || null, companyName: companyName || null };
}

async function companyIdFor(b: DbBundle, name: string): Promise<number> {
  const existing = first(await b.db.select().from(companies).where(sql`lower(${companies.name}) = lower(${name})`).limit(1));
  if (existing) return existing.id;
  const id = (await b.db.insert(companies).values({ name }).returning({ id: companies.id }))[0].id;
  await enqueueJob(b, "enrich_company", { companyId: id });
  return id;
}

/** Fills a missing headline, designation or company from a later capture. Never overwrites what is already there. */
export async function fillDetails(b: DbBundle, p: typeof prospects.$inferSelect, headline: string | null) {
  // LinkedIn sometimes yields just the person's name where the headline should be.
  if (!headline || p.fullName.toLowerCase().split(/\s+/).includes(headline.toLowerCase()) || headline.toLowerCase() === p.fullName.toLowerCase()) return null;
  const parsed = parseHeadline(headline);
  const set: Partial<typeof prospects.$inferInsert> = {};
  if (!p.headline) set.headline = headline;
  if (!p.designation && parsed.designation) set.designation = parsed.designation;
  if (!p.companyId && parsed.companyName) set.companyId = await companyIdFor(b, parsed.companyName);
  if (Object.keys(set).length === 0) return null;
  await b.db.update(prospects).set(set).where(eq(prospects.id, p.id));
  return set;
}

export async function enqueueJob(b: DbBundle, type: string, payload: unknown, runAfter = new Date()) {
  await b.db.insert(jobs).values({ type, payload, runAfter });
}

const first = <T,>(rows: T[]): T | undefined => rows[0];

/** The single entry point for every capture path (extension, paste form, CSV). Idempotent. */
export async function ingestEvent(base: DbBundle, input: unknown): Promise<IngestResult> {
  const ev: IngestEvent = ingestEventSchema.parse(input);

  return base.db.transaction(async (tx): Promise<IngestResult> => {
    const b: DbBundle = { db: tx as unknown as DbBundle["db"] };
    const { db } = b;
    // The extension can get a message's direction wrong on one visit and right on a later one. When the same
    // message arrives again with a different direction, correct it instead of ignoring it as a duplicate.
    if (ev.source === "extension" && ev.eventType === "message.new") {
      const prior = first(await db.select().from(messages).where(eq(messages.externalMessageId, ev.externalMessageId)).limit(1));
      if (prior && prior.direction !== ev.direction) return correctDirection(b, prior.id, ev);
    }
    const inserted = await db
      .insert(rawEvents)
      .values({ source: ev.source, externalMessageId: ev.externalMessageId, eventType: ev.eventType, payload: ev.raw ?? ev })
      .onConflictDoNothing()
      .returning({ id: rawEvents.id });
    if (inserted.length === 0) {
      // Reopening a conversation re-sends known messages; use them to fill in details missed the first time.
      const known = first(await db.select().from(prospects).where(eq(prospects.providerUserId, ev.sender.providerUserId)).limit(1));
      if (known) await fillDetails(b, known, cleanHeadline(ev.sender.headline, ev.sender.fullName));
      return { status: "duplicate" };
    }

    if (ev.eventType !== "message.new") {
      return { status: "stored_only", reason: `${ev.eventType} is processed in a later phase` };
    }

    const now = new Date();
    // Scraped names/headlines can carry hidden page text such as "Status is offline"; keep only the real values.
    const fullName = cleanName(ev.sender.fullName) || ev.sender.fullName.trim();
    const headline = cleanHeadline(ev.sender.headline, ev.sender.fullName);
    const { designation, companyName } = parseHeadline(headline);

    // 1. prospect (and company when new)
    let prospect = first(await db.select().from(prospects).where(eq(prospects.providerUserId, ev.sender.providerUserId)).limit(1));
    let createdProspect = false;
    if (!prospect) {
      const companyId = companyName ? await companyIdFor(b, companyName) : null;
      prospect = (await db
        .insert(prospects)
        .values({
          providerUserId: ev.sender.providerUserId,
          fullName,
          owner: process.env.OWNER_NAME ?? "Maple MPSS Team",
          photoUrl: ev.sender.photoUrl ?? null,
          linkedinUrl: ev.sender.linkedinUrl ?? null,
          headline,
          designation,
          companyId,
        })
        .returning())[0];
      createdProspect = true;
      await db
        .insert(activities)
        .values({ prospectId: prospect.id, actor: "system", action: companyId ? "Prospect and company created" : "Prospect created", details: { source: ev.source }, dedupeKey: `prospect:${prospect.id}`, occurredAt: now });
    }

    if (!createdProspect) await fillDetails(b, prospect, headline);

    // 2. conversation
    let conv = first(await db.select().from(conversations).where(eq(conversations.externalThreadId, ev.externalThreadId)).limit(1));
    if (!conv) {
      conv = (await db
        .insert(conversations)
        .values({ prospectId: prospect.id, externalThreadId: ev.externalThreadId, inbox: ev.inbox, threadUrl: ev.threadUrl ?? null })
        .returning())[0];
    } else if (!conv.threadUrl && ev.threadUrl) {
      await db.update(conversations).set({ threadUrl: ev.threadUrl }).where(eq(conversations.id, conv.id));
    }

    // 3. message (unique on external id)
    const msg = first(await db
      .insert(messages)
      .values({
        conversationId: conv.id,
        prospectId: prospect.id,
        externalMessageId: ev.externalMessageId,
        direction: ev.direction,
        text: ev.text,
        sentAt: ev.sentAt,
        senderName: ev.direction === "inbound" ? fullName : "Me",
      })
      .onConflictDoNothing()
      .returning({ id: messages.id }));
    if (!msg) return { status: "duplicate" };

    // 4. activity + timestamps
    const inbound = ev.direction === "inbound";
    await db
      .insert(activities)
      .values({
        prospectId: prospect.id,
        actor: "system",
        action: inbound ? "Prospect Replied" : prospect.lastInboundAt ? "Reply Sent" : "Message Sent",
        details: { messageId: msg.id, inbox: ev.inbox },
        dedupeKey: `msg:${ev.externalMessageId}`,
        occurredAt: ev.sentAt,
      });

    const newer = (cur: Date | null) => (!cur || ev.sentAt > cur ? ev.sentAt : cur);
    await db
      .update(prospects)
      .set({
        lastActivityAt: newer(prospect.lastActivityAt),
        ...(inbound
          ? { lastInboundAt: newer(prospect.lastInboundAt), nextFollowUpAt: null }
          : { lastOutboundAt: newer(prospect.lastOutboundAt) }),
      })
      .where(eq(prospects.id, prospect.id));

    // 5. inbound: alert + AI jobs (processed from Phase 2 onward)
    if (inbound) {
      await db
        .insert(alerts)
        .values({ prospectId: prospect.id, type: "new_reply", dedupeKey: `new_reply:${ev.externalMessageId}` })
        .onConflictDoNothing();
      for (const type of ["classify_intent", "summarize_conversation", "next_best_action", "draft_reply"]) {
        await enqueueJob(b, type, { prospectId: prospect.id, messageId: msg.id });
      }
    }

    if (ev.source === "extension") await markSheetDuplicates(b, prospect.id);
    return { status: "processed", prospectId: prospect.id, messageId: msg.id, createdProspect };
  });
}

export async function lastCaptureAt(b: DbBundle): Promise<Date | null> {
  const r = first(await b.db.select({ t: max(rawEvents.receivedAt) }).from(rawEvents));
  return r?.t ? new Date(r.t) : null;
}


/** Fixes the direction of a stored message, recomputes the prospect's reply times, and logs it. */
async function correctDirection(b: DbBundle, messageId: number, ev: IngestEvent): Promise<IngestResult> {
  const { db } = b;
  const m = (await db.select().from(messages).where(eq(messages.id, messageId)).limit(1))[0];
  const p = (await db.select().from(prospects).where(eq(prospects.id, m.prospectId)).limit(1))[0];
  const inbound = ev.direction === "inbound";
  await db.update(messages).set({ direction: ev.direction, senderName: inbound ? p.fullName : "Me" }).where(eq(messages.id, messageId));

  const latest = async (dir: "inbound" | "outbound") =>
    first(await db.select({ t: max(messages.sentAt) }).from(messages).where(and(eq(messages.prospectId, p.id), eq(messages.direction, dir))))?.t ?? null;
  const lastIn = await latest("inbound");
  const lastOut = await latest("outbound");
  await db
    .update(prospects)
    .set({ lastInboundAt: lastIn ? new Date(lastIn) : null, lastOutboundAt: lastOut ? new Date(lastOut) : null })
    .where(eq(prospects.id, p.id));

  await db
    .insert(activities)
    .values({
      prospectId: p.id,
      actor: "system",
      action: "Message direction corrected",
      details: { messageId, from: m.direction, to: ev.direction },
      dedupeKey: `fix:${ev.externalMessageId}:${ev.direction}`,
    })
    .onConflictDoNothing();

  // A message that turned out to be the client's needs analysing. A category you set by hand is left alone.
  if (inbound) {
    const types = p.categorySource === "manual"
      ? ["summarize_conversation", "next_best_action", "draft_reply"]
      : ["classify_intent", "summarize_conversation", "next_best_action", "draft_reply"];
    for (const type of types) await enqueueJob(b, type, { prospectId: p.id, messageId });
  }
  await markSheetDuplicates(b, p.id);
  return { status: "corrected", prospectId: p.id, messageId };
}
