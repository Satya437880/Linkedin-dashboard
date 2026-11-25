import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { openDb } from "../src/server/db/client";
import { activities, jobs, messages, prospects } from "../src/server/db/schema";
import { ingestEvent } from "../src/server/ingest/ingestEvent";

const ev = (direction: "inbound" | "outbound", over: Record<string, unknown> = {}) => ({
  source: "extension", eventType: "message.new", externalMessageId: "dom:t1:abc", externalThreadId: "t1", inbox: "classic",
  direction, text: "No thanks", sentAt: "2026-11-23T16:14:00Z",
  sender: { providerUserId: "duane", fullName: "Duane Jerore", headline: "President and CEO" }, ...over,
});

describe("correcting a message the extension got backwards", () => {
  it("moves it from ours to the client's and updates the prospect", () => {
    const b = openDb(":memory:");
    expect(ingestEvent(b, ev("outbound")).status).toBe("processed");
    let p = b.db.select().from(prospects).get()!;
    expect(p.lastInboundAt).toBeNull();
    expect(p.lastOutboundAt).not.toBeNull();

    const r = ingestEvent(b, ev("inbound"));
    expect(r.status).toBe("corrected");
    const m = b.db.select().from(messages).get()!;
    expect(m.direction).toBe("inbound");
    expect(m.senderName).toBe("Duane Jerore");
    p = b.db.select().from(prospects).get()!;
    expect(p.lastInboundAt).not.toBeNull();
    expect(p.lastOutboundAt).toBeNull();
    expect(b.db.select().from(activities).where(eq(activities.action, "Message direction corrected")).all()).toHaveLength(1);
    expect(b.db.select().from(jobs).where(eq(jobs.type, "classify_intent")).all().length).toBeGreaterThan(0);
  });

  it("is a no-op when the same direction arrives again, and when it is repeated", () => {
    const b = openDb(":memory:");
    ingestEvent(b, ev("outbound"));
    expect(ingestEvent(b, ev("outbound")).status).toBe("duplicate");
    ingestEvent(b, ev("inbound"));
    expect(ingestEvent(b, ev("inbound")).status).toBe("duplicate");
    expect(b.db.select().from(messages).all()).toHaveLength(1);
    expect(b.db.select().from(activities).where(eq(activities.action, "Message direction corrected")).all()).toHaveLength(1);
  });

  it("keeps a category you set by hand", () => {
    const b = openDb(":memory:");
    ingestEvent(b, ev("outbound"));
    b.db.update(prospects).set({ category: "hot", categorySource: "manual" }).run();
    ingestEvent(b, ev("inbound"));
    expect(b.db.select().from(jobs).where(eq(jobs.type, "classify_intent")).all()).toHaveLength(0);
    expect(b.db.select().from(prospects).get()!.category).toBe("hot");
  });

  it("only the extension can correct a stored message", () => {
    const b = openDb(":memory:");
    ingestEvent(b, ev("outbound"));
    expect(ingestEvent(b, ev("inbound", { source: "manual" })).status).toBe("duplicate");
    expect(b.db.select().from(messages).get()!.direction).toBe("outbound");
  });
});
