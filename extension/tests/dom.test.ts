// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { applyTime, parseClassicDom, parseDateHeading } from "../src/parsers/dom";

describe("DOM fallback", () => {
  const html = readFileSync(resolve(process.cwd(), "fixtures/classic-thread.html"), "utf8");
  const doc = new DOMParser().parseFromString(html, "text/html");
  const events = parseClassicDom(doc, "https://www.linkedin.com/messaging/thread/2-DOMTHREAD==/", new Date(2026, 10, 24));

  it("reads both visible messages", () => expect(events).toHaveLength(2));
  it("sets direction by sender name and local time", () => {
    expect(events[0].direction).toBe("outbound");
    expect(events[1].direction).toBe("inbound");
    expect(new Date(events[1].sentAt).getHours()).toBe(15);
    expect(new Date(events[1].sentAt).getMinutes()).toBe(40);
  });
  it("derives the provider id from the profile link", () => expect(events[0].sender.providerUserId).toBe("jane-roe-123"));
  it("returns nothing outside a thread URL", () => expect(parseClassicDom(doc, "https://www.linkedin.com/feed/")).toEqual([]));
  it("parses date headings and times", () => {
    const now = new Date(2026, 10, 24);
    expect(parseDateHeading("Today", now)?.getDate()).toBe(24);
    expect(parseDateHeading("Yesterday", now)?.getDate()).toBe(23);
    expect(parseDateHeading("Nov 15", now)?.getDate()).toBe(15);
    expect(applyTime(new Date(2026, 10, 15), "12:05 AM")?.getHours()).toBe(0);
  });
});

describe("DOM fallback cleaning", () => {
  it("drops hidden presence text from names and headlines", () => {
    const html = '<h2 class="msg-entity-lockup__entity-title">Sam Carter\n   \n  Status is offline\n   President and CEO</h2><ul><li class="msg-s-message-list__event"><time class="msg-s-message-list__time-heading">Today</time></li><li class="msg-s-message-list__event"><div class="msg-s-message-group"><span class="msg-s-message-group__name">Sam Carter\nStatus is offline</span><time class="msg-s-message-group__timestamp">3:40 PM</time></div><div class="msg-s-event-listitem__body">Please send pricing.</div></li></ul>';
    const doc = new DOMParser().parseFromString(html, "text/html");
    const e = parseClassicDom(doc, "https://www.linkedin.com/messaging/thread/2-X==/", new Date(2026, 10, 24));
    expect(e[0].sender.fullName).toBe("Sam Carter");
    expect(e[0].sender.headline).toBe("President and CEO");
    expect(e[0].direction).toBe("inbound");
  });
});

describe("DOM fallback with the date heading inside the first message", () => {
  const item = (inner: string) => `<li class="msg-s-message-list__event">${inner}</li>`;
  const html =
    '<h2 class="msg-entity-lockup__entity-title">Jane Roe</h2><ul>' +
    item('<time class="msg-s-message-list__time-heading">Today</time><div class="msg-s-message-group"><span class="msg-s-message-group__name">Jane Roe</span><time class="msg-s-message-group__timestamp">3:40 PM</time></div><div class="msg-s-event-listitem__body">Please send pricing.</div>') +
    item('<div class="msg-s-event-listitem__body">And lead time.</div>') +
    "</ul>";
  const doc = new DOMParser().parseFromString(html, "text/html");
  const events = parseClassicDom(doc, "https://www.linkedin.com/messaging/thread/2-X==/", new Date(2026, 10, 24));

  it("does not read the date heading as the message time", () => {
    expect(events.map((e) => e.text)).toEqual(["Please send pricing.", "And lead time."]);
    expect(new Date(events[0].sentAt).getHours()).toBe(15);
  });
});

describe("DOM fallback never drops a visible message", () => {
  const read = (items: string[], now = new Date(2026, 10, 24)) => {
    const html = '<h2 class="msg-entity-lockup__entity-title">Jane Roe</h2><ul>' + items.map((i) => `<li class="msg-s-message-list__event">${i}</li>`).join("") + "</ul>";
    return parseClassicDom(new DOMParser().parseFromString(html, "text/html"), "https://www.linkedin.com/messaging/thread/2-X==/", now, "Me User");
  };
  const body = (t: string) => `<div class="msg-s-event-listitem__body">${t}</div>`;
  const head = (d: string) => `<time class="msg-s-message-list__time-heading">${d}</time>`;
  const group = (who: string, at: string) => `<div class="msg-s-message-group"><span class="msg-s-message-group__name">${who}</span><time class="msg-s-message-group__timestamp">${at}</time></div>`;

  it("keeps messages above the first date label, dated from that label", () => {
    const e = read([group("Jane Roe", "9:00 AM") + body("first"), head("Nov 15") + group("Jane Roe", "10:00 AM") + body("second")]);
    expect(e.map((x) => x.text)).toEqual(["first", "second"]);
    expect(new Date(e[0].sentAt).getDate()).toBe(15);
  });
  it("keeps messages with no date, name or time", () => {
    expect(read([body("bare")]).map((x) => x.text)).toEqual(["bare"]);
  });
  it("keeps the id of an undated message the same on a later day", () => {
    expect(read([body("bare")])[0].externalMessageId).toBe(read([body("bare")], new Date(2026, 10, 30))[0].externalMessageId);
  });
  it("keeps repeated texts and several texts in one block", () => {
    const e = read([head("Today") + group("Jane Roe", "9:00 AM") + body("ok"), body("ok"), body("one") + body("two")]);
    expect(e.map((x) => x.text)).toEqual(["ok", "ok", "one", "two"]);
    expect(new Set(e.map((x) => x.externalMessageId)).size).toBe(4);
  });
  it("notes a message that has an attachment and no text", () => {
    const e = read([head("Today") + group("Jane Roe", "9:00 AM") + '<div class="msg-s-event-listitem__attachment-item"></div>']);
    expect(e.map((x) => x.text)).toEqual(["[attachment]"]);
  });
});
