// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const html = readFileSync(resolve(process.cwd(), "static/popup.html"), "utf8");
const body = /<body>([\s\S]*)<\/body>/.exec(html)![1].replace(/<script[^>]*><\/script>/g, "");

type Listener = (changes: Record<string, { newValue?: unknown }>, area: string) => void;

function setup(opts: { statusDelayMs?: number; statusIgnoresPause?: boolean } = {}) {
  document.body.innerHTML = body;
  const store: Record<string, unknown> = {};
  const listeners: Listener[] = [];
  (globalThis as Record<string, unknown>).chrome = {
    storage: {
      local: {
        get: async (key: string) => (key in store ? { [key]: store[key] } : {}),
        set: async (o: Record<string, unknown>) => {
          const changes: Record<string, { newValue?: unknown }> = {};
          for (const [k, v] of Object.entries(o)) { store[k] = v; changes[k] = { newValue: v }; }
          listeners.forEach((l) => l(changes, "local"));
        },
      },
      onChanged: { addListener: (l: Listener) => listeners.push(l) },
    },
    runtime: {
      // The background answers slowly, and reports what the pause value was when the request STARTED.
      sendMessage: (m: { type: string }) => {
        const pausedThen = opts.statusIgnoresPause ? undefined : store.paused === true;
        return new Promise((r) => setTimeout(() => r({ read: 3, sent: 3, queued: 0, lastError: null, appUrl: "http://localhost:3000", paused: pausedThen, type: m.type }), opts.statusDelayMs ?? 0));
      },
    },
  };
}

const text = (id: string) => document.getElementById(id)!.textContent;
const flush = async (ms = 0) => { await vi.advanceTimersByTimeAsync(ms); };

describe("popup Pause / Resume switch", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.resetModules(); });
  afterEach(() => { vi.useRealTimers(); });

  it("shows Active at first and switches to Paused on click", async () => {
    setup();
    await import("../src/popup/popup");
    await flush(50);
    expect(text("state")).toBe("Capture active");
    expect(text("toggle")).toBe("Pause");
    document.getElementById("toggle")!.click();
    await flush(50);
    expect(text("state")).toBe("Capture paused");
    expect(text("toggle")).toBe("Resume");
  });

  it("stays Paused when a slow status refresh that started before the click finishes after it", async () => {
    setup({ statusDelayMs: 1500 });
    await import("../src/popup/popup");
    await flush(10); // first refresh is now in flight and will report paused = false
    document.getElementById("toggle")!.click();
    await flush(50);
    expect(text("toggle")).toBe("Resume");
    await flush(2000); // the stale refresh completes
    expect(text("state")).toBe("Capture paused");
    expect(text("toggle")).toBe("Resume");
  });

  it("stays correct when the background is an old version that does not report the pause", async () => {
    setup({ statusIgnoresPause: true });
    await import("../src/popup/popup");
    await flush(50);
    document.getElementById("toggle")!.click();
    await flush(50);
    await flush(5000); // several refresh cycles
    expect(text("state")).toBe("Capture paused");
  });

  it("resumes and keeps showing Active", async () => {
    setup();
    await import("../src/popup/popup");
    await flush(50);
    document.getElementById("toggle")!.click();
    await flush(50);
    document.getElementById("toggle")!.click();
    await flush(5000);
    expect(text("state")).toBe("Capture active");
    expect(text("toggle")).toBe("Pause");
  });

  it("reopening the popup shows the saved state", async () => {
    setup();
    (chrome.storage.local as unknown as { set: (o: object) => Promise<void> }).set({ paused: true });
    await import("../src/popup/popup");
    await flush(50);
    expect(text("state")).toBe("Capture paused");
  });

  it("two quick clicks end in a consistent state", async () => {
    setup();
    await import("../src/popup/popup");
    await flush(50);
    const t = document.getElementById("toggle")!;
    t.click(); t.click();
    await flush(200);
    const stored = (await chrome.storage.local.get("paused")) as { paused?: boolean };
    expect(text("state")).toBe(stored.paused ? "Capture paused" : "Capture active");
  });
});
