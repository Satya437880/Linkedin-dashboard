// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://www.linkedin.com/messaging/thread/2-ABC==/"}
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PAGE = `
<img class="global-nav__me-photo" alt="Photo of Alex Morgan Lee">
<h2 class="msg-entity-lockup__entity-title">Sam Carter</h2>
<ul>
  <li class="msg-s-message-list__event"><time class="msg-s-message-list__time-heading">Today</time></li>
  <li class="msg-s-message-list__event">
    <div class="msg-s-message-group"><span class="msg-s-message-group__name">Alex Morgan Lee</span><time class="msg-s-message-group__timestamp">9:00 AM</time></div>
    <div class="msg-s-event-listitem__body">Hi Sam, we help OEMs source machining partners.</div></li>
  <li class="msg-s-message-list__event">
    <div class="msg-s-message-group"><span class="msg-s-message-group__name">Sam Carter</span><time class="msg-s-message-group__timestamp">4:14 PM</time></div>
    <div class="msg-s-event-listitem__body">No thanks</div></li>
</ul>`;

type Sent = { type: string; events?: { direction: string; text: string }[] };

function installChrome(store: Record<string, unknown>) {
  const sent: Sent[] = [];
  (globalThis as Record<string, unknown>).chrome = {
    runtime: {
      id: "test-extension",
      getURL: (p: string) => `chrome-extension://x/${p}`,
      sendMessage: async (m: Sent) => { sent.push(m); return { ok: true }; },
      onMessage: { addListener: () => undefined },
    },
    storage: {
      local: {
        get: async (k: string | string[]) => {
          const keys = Array.isArray(k) ? k : [k];
          return Object.fromEntries(keys.filter((x) => x in store).map((x) => [x, store[x]]));
        },
        set: async (o: Record<string, unknown>) => { Object.assign(store, o); },
      },
      onChanged: { addListener: () => undefined },
    },
  };
  return sent;
}

describe("content script on a chat page", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.resetModules(); document.body.innerHTML = PAGE; });
  afterEach(() => { vi.useRealTimers(); });

  it("reads the chat and sends both sides to the background", async () => {
    const sent = installChrome({});
    await import("../src/content/content");
    await vi.advanceTimersByTimeAsync(12_000);
    const events = sent.filter((m) => m.type === "events").flatMap((m) => m.events ?? []);
    expect(events.map((e) => [e.direction, e.text])).toEqual([
      ["outbound", "Hi Sam, we help OEMs source machining partners."],
      ["inbound", "No thanks"],
    ]);
  });

  it("sends each message only once while the chat stays open", async () => {
    const sent = installChrome({});
    await import("../src/content/content");
    await vi.advanceTimersByTimeAsync(40_000);
    const events = sent.filter((m) => m.type === "events").flatMap((m) => m.events ?? []);
    expect(events).toHaveLength(2);
  });

  it("picks up a reply that arrives while the chat is open", async () => {
    const sent = installChrome({});
    await import("../src/content/content");
    await vi.advanceTimersByTimeAsync(12_000);
    document.querySelector("ul")!.insertAdjacentHTML("beforeend", `
      <li class="msg-s-message-list__event">
        <div class="msg-s-message-group"><span class="msg-s-message-group__name">Sam Carter</span><time class="msg-s-message-group__timestamp">4:30 PM</time></div>
        <div class="msg-s-event-listitem__body">Actually, send the brochure.</div></li>`);
    await vi.advanceTimersByTimeAsync(10_000);
    const events = sent.filter((m) => m.type === "events").flatMap((m) => m.events ?? []);
    expect(events.map((e) => e.text)).toContain("Actually, send the brochure.");
  });

  it("sends nothing while paused", async () => {
    const sent = installChrome({ paused: true });
    await import("../src/content/content");
    await vi.advanceTimersByTimeAsync(20_000);
    expect(sent.filter((m) => m.type === "events")).toHaveLength(0);
  });

  it("captures again once resumed", async () => {
    const store: Record<string, unknown> = { paused: true };
    const listeners: ((c: Record<string, { newValue?: unknown }>, a: string) => void)[] = [];
    const sent = installChrome(store);
    (chrome.storage.onChanged as unknown as { addListener: (l: (typeof listeners)[0]) => void }).addListener = (l) => listeners.push(l);
    await import("../src/content/content");
    await vi.advanceTimersByTimeAsync(5_000);
    store.paused = false;
    listeners.forEach((l) => l({ paused: { newValue: false } }, "local"));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sent.some((m) => m.type === "events" && (m.events?.length ?? 0) > 0)).toBe(true);
  });

  it("still reads the whole chat when LinkedIn's data held only the latest message", async () => {
    const sent = installChrome({});
    await import("../src/content/content");
    await vi.advanceTimersByTimeAsync(2_000); // the script has noticed the chat; LinkedIn data arrives next
    const at = new Date();
    at.setHours(16, 14, 27, 0);
    const person = (id: string, first: string, last: string) =>
      ({ hostIdentityUrn: "urn:li:fsd_profile:" + id, participantType: { member: { firstName: { text: first }, lastName: { text: last } } } });
    const json = {
      entityUrn: "urn:li:msg_conversation:(urn:li:fsd_profile:SELF,2-ABC==)",
      conversationParticipants: [person("SELF", "Alex", "Lee"), person("SAM", "Sam", "Carter")],
      messages: { elements: [{ entityUrn: "urn:li:msg_message:(urn:li:fsd_profile:SELF,2-M1)", body: { text: "No thanks" }, deliveredAt: at.getTime(), sender: { hostIdentityUrn: "urn:li:fsd_profile:SAM" } }] },
    };
    window.dispatchEvent(new MessageEvent("message", { source: window, data: { __mpss_capture__: true, url: "/voyager/x", json } }));
    await vi.advanceTimersByTimeAsync(20_000);
    const texts = sent.filter((m) => m.type === "events").flatMap((m) => m.events ?? []).map((e) => e.text);
    expect(texts.sort()).toEqual(["Hi Sam, we help OEMs source machining partners.", "No thanks"]);
  });
});
