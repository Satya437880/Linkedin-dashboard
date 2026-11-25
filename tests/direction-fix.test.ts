import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { openMemoryDb } from "../src/server/db/testDb";
import { activities, jobs, messages, prospects } from "../src/server/db/schema";
import { ingestEvent } from "../src/server/ingest/ingestEvent";

const ev = (direction: "inbound" | "outbound", over: Record<string, unknown> = {}) => ({
  source: "extension", eventType: "message.new", externalMessageId: "dom:t1:abc", externalThreadId: "t1", inbox: "classic",
  direction, text: "No thanks", sentAt: "2026-11-23T16:14:00Z",
  sender: { providerUserId: "duane", fullName: "Duane Jerore", headline: "President and CEO" }, ...over,
});

describe("correcting a message the extension got backwards", () => {
  it("moves it from ours to the client's and updates the prospect", async () => {
    const b = await openMemoryDb();
    expect((await ingestEvent(b, ev("outbound"))).status).toBe("processed");
    let p = (await b.db.select().from(prospects).limit(1))[0];
    expect(p.lastInboundAt).toBeNull();
    expect(p.lastOutboundAt).not.toBeNull();

    const r = (await ingestEvent(b, ev("inbound")));
    expect(r.status).toBe("corrected");
    const m = (await b.db.select().from(messages).limit(1))[0];
    expect(m.direction).toBe("inbound");
    expect(m.senderName).toBe("Duane Jerore");
    p = (await b.db.select().from(prospects).limit(1))[0];
    expect(p.lastInboundAt).not.toBeNull();
    expect(p.lastOutboundAt).toBeNull();
    expect((await b.db.select().from(activities).where(eq(activities.action, "Message direction corrected")))).toHaveLength(1);
    expect((await b.db.select().from(jobs).where(eq(jobs.type, "classify_intent"))).length).toBeGreaterThan(0);
  });

  it("is a no-op when the same direction arrives again, and when it is repeated", async () => {
    const b = await openMemoryDb();
    (await ingestEvent(b, ev("outbound")));
    expect((await ingestEvent(b, ev("outbound"))).status).toBe("duplicate");
    (await ingestEvent(b, ev("inbound")));
    expect((await ingestEvent(b, ev("inbound"))).status).toBe("duplicate");
    expect((await b.db.select().from(messages))).toHaveLength(1);
    expect((await b.db.select().from(activities).where(eq(activities.action, "Message direction corrected")))).toHaveLength(1);
  });

  it("keeps a category you set by hand", async () => {
    const b = await openMemoryDb();
    (await ingestEvent(b, ev("outbound")));
    (await b.db.update(prospects).set({ category: "hot", categorySource: "manual" }));
    (await ingestEvent(b, ev("inbound")));
    expect((await b.db.select().from(jobs).where(eq(jobs.type, "classify_intent")))).toHaveLength(0);
    expect((await b.db.select().from(prospects).limit(1))[0].category).toBe("hot");
  });

  it("only the extension can correct a stored message", async () => {
    const b = await openMemoryDb();
    (await ingestEvent(b, ev("outbound")));
    expect((await ingestEvent(b, ev("inbound", { source: "manual" }))).status).toBe("duplicate");
    expect((await b.db.select().from(messages).limit(1))[0].direction).toBe("outbound");
  });
});
