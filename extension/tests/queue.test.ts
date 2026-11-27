import { describe, expect, it } from "vitest";
import { EventQueue, type KV } from "../src/queue/queue";
import type { IngestEvent } from "../src/shared/types";

const memKv = (): KV => {
  const data: Record<string, unknown> = {};
  return { get: async <T>(k: string) => data[k] as T | undefined, set: async (k, v) => { data[k] = JSON.parse(JSON.stringify(v)); } };
};
const ev = (id: string): IngestEvent => ({
  source: "extension", eventType: "message.new", externalMessageId: id, externalThreadId: "t", inbox: "classic",
  direction: "inbound", text: "hi", sentAt: new Date().toISOString(),
  sender: { providerUserId: "p", fullName: "P", headline: null, photoUrl: null, linkedinUrl: null },
});
const cfg = { appUrl: "http://localhost:3000", token: "tok" };
const resp = (status: number) => new Response("{}", { status });
const idOf = (init: RequestInit) => JSON.parse(String(init.body)).externalMessageId as string;

describe("EventQueue", () => {
  it("keeps events while the app is offline and sends them later", async () => {
    const kv = memKv();
    const q = new EventQueue(kv, async () => { throw new Error("ECONNREFUSED"); });
    await q.enqueue([ev("a"), ev("b")]);
    expect(await q.flush(cfg)).toBe(0);
    expect((await q.status()).queued).toBe(2);

    // a new queue over the same storage simulates the service worker restarting once the app is back
    const calls: string[] = [];
    const q2 = new EventQueue(kv, async (_u, init) => { calls.push(idOf(init)); return resp(200); });
    expect(await q2.flush(cfg)).toBe(2);
    expect(calls).toEqual(["a", "b"]);
    const s = await q2.status();
    expect(s.queued).toBe(0);
    expect(s.sent).toBe(2);
    expect(s.lastError).toBeNull();
  });

  it("sends the ingest token header to /api/ingest", async () => {
    const q = new EventQueue(memKv(), async (url, init) => {
      expect(url).toBe("http://localhost:3000/api/ingest");
      expect((init.headers as Record<string, string>)["x-ingest-token"]).toBe("tok");
      return resp(200);
    });
    await q.enqueue([ev("a")]);
    expect(await q.flush(cfg)).toBe(1);
  });

  it("does not queue duplicates", async () => {
    const q = new EventQueue(memKv(), async () => resp(200));
    await q.enqueue([ev("a")]);
    await q.enqueue([ev("a")]);
    expect((await q.status()).queued).toBe(1);
  });

  it("keeps events on 401 and 500", async () => {
    for (const status of [401, 500]) {
      const q = new EventQueue(memKv(), async () => resp(status));
      await q.enqueue([ev("a")]);
      expect(await q.flush(cfg)).toBe(0);
      expect((await q.status()).queued).toBe(1);
    }
  });

  it("sets aside an invalid event (400) without blocking the rest", async () => {
    const q = new EventQueue(memKv(), async (_u, init) => resp(idOf(init) === "bad" ? 400 : 200));
    await q.enqueue([ev("bad"), ev("good")]);
    expect(await q.flush(cfg)).toBe(1);
    const s = await q.status();
    expect(s.queued).toBe(0);
    expect(s.deadLetters).toBe(1);
  });

  it("refuses to send without a token and keeps the queue", async () => {
    const q = new EventQueue(memKv(), async () => resp(200));
    await q.enqueue([ev("a")]);
    expect(await q.flush({ ...cfg, token: "" })).toBe(0);
    expect((await q.status()).queued).toBe(1);
  });
});

describe("queue under concurrent use", () => {
  const slowKv = () => {
    const store: Record<string, unknown> = {};
    const tick = () => new Promise((r) => setTimeout(r, 1));
    return {
      async get<T>(k: string) { await tick(); return structuredClone(store[k]) as T | undefined; },
      async set(k: string, v: unknown) { await tick(); store[k] = structuredClone(v); },
    };
  };
  const msg = (id: string) => ({ externalMessageId: id }) as never;
  const cfg = { appUrl: "http://app", token: "t" } as never;
  const idOf = (i: RequestInit) => JSON.parse(String(i.body)).externalMessageId as string;

  it("does not lose a message that arrives while another is being sent", async () => {
    const sent: string[] = [];
    let q: EventQueue;
    q = new EventQueue(slowKv(), async (_u, i) => {
      sent.push(idOf(i));
      if (sent.length === 1) await q.enqueue([msg("b")]);
      return new Response("{}", { status: 200 });
    });
    await q.enqueue([msg("a")]);
    await q.flush(cfg);
    expect(sent).toEqual(["a", "b"]);
  });

  it("does not lose messages enqueued at the same moment", async () => {
    const q = new EventQueue(slowKv());
    await Promise.all([q.enqueue([msg("a")]), q.enqueue([msg("b")]), q.enqueue([msg("c")])]);
    expect((await q.status()).queued).toBe(3);
  });
});
