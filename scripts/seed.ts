/* Demo mode: loads two sample prospects through the real ingestEvent() path. Safe to run repeatedly. */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { analyzeProspect, draftFollowUpForProspect } from "../src/server/ai/analyze";
import { getBundle } from "../src/server/db/client";
import { activities, alerts, jobs, prospects } from "../src/server/db/schema";
import { ingestEvent } from "../src/server/ingest/ingestEvent";

const b = getBundle();
const OWNER = "Maple MPSS Team";

// Retire the early manual test record instead of deleting (prospects are never deleted).
b.db.update(prospects).set({ archivedAt: new Date() }).where(and(eq(prospects.providerUserId, "jane-doe"), isNull(prospects.archivedAt))).run();

// 15 Nov 2026 is EST (UTC-5).
const john = {
  providerUserId: "demo-john-smith",
  fullName: "John Smith",
  headline: "Procurement Manager at ABC Ltd",
  linkedinUrl: "https://www.linkedin.com/in/demo-john-smith",
};
const michael = {
  providerUserId: "demo-michael-lee",
  fullName: "Michael Lee",
  headline: "Plant Head at XYZ Corp",
  linkedinUrl: "https://www.linkedin.com/in/demo-michael-lee",
};

const events = [
  {
    id: "demo-john-1", thread: "demo-thread-john", sender: john, direction: "outbound" as const,
    sentAt: "2026-11-15T16:20:00Z",
    text: "Hi John, I noticed your company is expanding production capacity. We help OEMs source reliable CNC machining partners in Canada. Would you be open to a quick chat?",
  },
  {
    id: "demo-john-2", thread: "demo-thread-john", sender: john, direction: "inbound" as const,
    sentAt: "2026-11-15T20:40:00Z",
    text: "Can you share more details about your machining capabilities?",
  },
  {
    // Sample content written for the demo: outreach with no reply yet, so the 7-day follow-up is due.
    id: "demo-michael-1", thread: "demo-thread-michael", sender: michael, direction: "outbound" as const,
    sentAt: "2026-11-16T14:30:00Z",
    text: "Hi Michael, I came across XYZ Corp and your plant expansion. We connect manufacturers with vetted fabrication partners. Is sourcing on your radar this year?",
  },
];

let createdJohn = false;
for (const e of events) {
  const r = ingestEvent(b, {
    source: "manual",
    eventType: "message.new",
    externalMessageId: e.id,
    externalThreadId: e.thread,
    inbox: "classic",
    direction: e.direction,
    text: e.text,
    sentAt: e.sentAt,
    sender: e.sender,
    threadUrl: `https://www.linkedin.com/messaging/thread/${e.thread}/`,
  });
  if (r.status === "processed" && e.sender === john && e.direction === "inbound") createdJohn = true;
}

const get = (pid: string) => b.db.select().from(prospects).where(eq(prospects.providerUserId, pid)).get()!;
const j = get(john.providerUserId);
const m = get(michael.providerUserId);
b.db.update(prospects).set({ owner: OWNER }).where(inArray(prospects.id, [j.id, m.id])).run();

if (createdJohn) analyzeProspect(b, j.id);

// The AI jobs were run inline above; mark the queued copies done so they are not repeated.
b.db.update(jobs).set({ status: "done" }).where(and(eq(jobs.status, "pending"), inArray(jobs.type, ["classify_intent", "summarize_conversation", "next_best_action", "draft_reply"]))).run();

// Michael: first message 16 Nov 9:30 AM, no reply, so follow-up 1 (day 7) fell due on 23 Nov.
const due = new Date("2026-11-23T14:30:00Z");
if (!m.nextFollowUpAt) {
  b.db.update(prospects).set({ nextFollowUpAt: due }).where(eq(prospects.id, m.id)).run();
  draftFollowUpForProspect(b, m.id, 1);
  b.db.insert(alerts).values({ prospectId: m.id, type: "follow_up_due", dedupeKey: `follow_up_due:${m.id}:2026-11-24` }).onConflictDoNothing().run();
  b.db.insert(activities).values({ prospectId: m.id, actor: "system", action: "Follow-Up 1 Due", details: { dueAt: due.toISOString() }, dedupeKey: `followup-due:${m.id}:1`, occurredAt: due }).onConflictDoNothing().run();
}

console.log("Demo data ready: John Smith and Michael Lee.");
