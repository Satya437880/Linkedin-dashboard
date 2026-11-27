import { beforeAll, describe, expect, it } from "vitest";
import { isPaused, PAUSE_KEY } from "../src/shared/pause";
import type { IngestEvent } from "../src/shared/types";

const ev = (id: string): IngestEvent => ({
  source: "extension", eventType: "message.new", externalMessageId: id, externalThreadId: "t", inbox: "classic",
  direction: "inbound", text: "hi", sentAt: new Date().toISOString(),
  sender: { providerUserId: "p", fullName: "P", headline: null, photoUrl: null, linkedinUrl: null },
});

describe("isPaused", () => {
  it("is true only for an explicit true", () => {
    expect(isPaused(true)).toBe(true);
    for (const v of [false, undefined, null, "true", 1]) expect(isPaused(v)).toBe(false);
  });
});

describe("background honours the pause switch", () => {
  const store: Record<string, unknown> = {};
  const badges: string[] = [];
  let handler: (msg: unknown, sender: unknown, reply: (r: unknown) => void) => unknown;

  beforeAll(async () => {
    (globalThis as Record<string, unknown>).chrome = {
      storage: {
        local: {
          get: async (key: string) => (key in store ? { [key]: store[key] } : {}),
          set: async (o: Record<string, unknown>) => { Object.assign(store, JSON.parse(JSON.stringify(o))); },
        },
        onChanged: { addListener: () => undefined },
      },
      runtime: { onMessage: { addListener: (h: typeof handler) => { handler = h; } }, onInstalled: { addListener: () => undefined }, onStartup: { addListener: () => undefined } },
      alarms: { create: () => undefined, onAlarm: { addListener: () => undefined } },
      action: { setBadgeText: async ({ text }: { text: string }) => { badges.push(text); }, setBadgeBackgroundColor: async () => undefined },
    };
    await import("../src/background/background");
  });

  const send = (msg: unknown) => new Promise<Record<string, unknown>>((resolve) => { handler(msg, {}, (r) => resolve(r as Record<string, unknown>)); });
  const queued = async () => ((await send({ type: "status" })).queued as number);

  it("stores events while active", async () => {
    await send({ type: "events", events: [ev("a")] });
    expect(await queued()).toBe(1);
  });

  it("drops new events while paused, and reports it", async () => {
    await chrome.storage.local.set({ [PAUSE_KEY]: true });
    const r = await send({ type: "events", events: [ev("b"), ev("c")] });
    expect(r.paused).toBe(true);
    expect(await queued()).toBe(1); // unchanged: b and c were not stored
    expect((await send({ type: "status" })).paused).toBe(true);
  });

  it("keeps events that were already waiting, so pausing loses nothing", async () => {
    expect(await queued()).toBe(1);
  });

  it("captures again after resuming", async () => {
    await chrome.storage.local.set({ [PAUSE_KEY]: false });
    await send({ type: "events", events: [ev("d")] });
    expect(await queued()).toBe(2);
    expect((await send({ type: "status" })).paused).toBe(false);
  });
});
