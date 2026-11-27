// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { parseClassicDom } from "../src/parsers/dom";
import { decideDirection, detectOwnName, sameNameLoose } from "../src/shared/names";

describe("sameNameLoose", () => {
  it("ignores pronouns, credentials and punctuation", () => {
    expect(sameNameLoose("Sam Carter (He/Him)", "Sam Carter")).toBe(true);
    expect(sameNameLoose("Josh Versteeg", "Josh Versteeg PENG")).toBe(true);
    expect(sameNameLoose("Margaret Lai, CPA, CA", "Margaret Lai")).toBe(true);
    expect(sameNameLoose("HARDIK VASOYA (E.I.T)", "Hardik Vasoya")).toBe(true);
  });
  it("does not confuse different people", () => {
    expect(sameNameLoose("Alex Morgan Lee", "Sam Carter")).toBe(false);
    expect(sameNameLoose("", "Sam Carter")).toBe(false);
  });
});

describe("decideDirection", () => {
  const partner = "Sam Carter";
  const own = "Alex Morgan Lee";
  it("labels the partner's messages inbound even with pronouns on the page", () => {
    expect(decideDirection("Sam Carter (He/Him)", partner, own)).toBe("inbound");
    expect(decideDirection("Sam Carter (He/Him)", partner, null)).toBe("inbound");
  });
  it("labels my messages outbound when my name is known", () => {
    expect(decideDirection("Alex Morgan Lee (He/Him)", partner, own)).toBe("outbound");
  });
  it("treats anyone who is not me as the partner when my name is known", () => {
    expect(decideDirection("S. Carter", partner, own)).toBe("inbound");
  });
  it("without my name, a name that does not match the partner is mine", () => {
    expect(decideDirection("Alex Morgan Lee", partner, null)).toBe("outbound");
  });
});

const PAGE = (names: [string, string, string][], me = "Photo of Alex Morgan Lee") => `
<html><body>
<img class="global-nav__me-photo" alt="${me}">
<h2 class="msg-entity-lockup__entity-title">Sam Carter
   Status is offline</h2>
<ul>
  <li class="msg-s-message-list__event"><time class="msg-s-message-list__time-heading">Today</time></li>
  ${names.map(([who, time, text]) => `<li class="msg-s-message-list__event">
    <div class="msg-s-message-group"><span class="msg-s-message-group__name">${who}</span><time class="msg-s-message-group__timestamp">${time}</time></div>
    <div class="msg-s-event-listitem__body">${text}</div></li>`).join("")}
</ul></body></html>`;

describe("parseClassicDom direction (regression: every message used to be saved as ours)", () => {
  const url = "https://www.linkedin.com/messaging/thread/2-ABC==/";
  const now = new Date(2026, 10, 24);
  const parse = (html: string, own?: string) => parseClassicDom(new DOMParser().parseFromString(html, "text/html"), url, now, own);

  it("detects my name from the navigation photo", () => {
    const doc = new DOMParser().parseFromString(PAGE([]), "text/html");
    expect(detectOwnName(doc)).toBe("Alex Morgan Lee");
  });

  it("splits a conversation into ours and theirs", () => {
    const events = parse(PAGE([
      ["Alex Morgan Lee (He/Him)", "9:00 AM", "Hi Sam, we help OEMs source machining partners."],
      ["Sam Carter (He/Him)", "4:14 PM", "No thanks"],
    ]));
    expect(events.map((e) => [e.direction, e.text])).toEqual([
      ["outbound", "Hi Sam, we help OEMs source machining partners."],
      ["inbound", "No thanks"],
    ]);
  });

  it("uses the name from options when the page does not show mine", () => {
    const html = PAGE([["Al Lee", "9:00 AM", "Hello"], ["Sam Carter", "10:00 AM", "Hi"]], "");
    expect(parse(html).map((e) => e.direction)).toEqual(["outbound", "inbound"]); // fallback: not the partner => mine
    expect(parse(html, "Al Lee").map((e) => e.direction)).toEqual(["outbound", "inbound"]);
  });

  it("the client's reply is never filed as ours", () => {
    const events = parse(PAGE([["Sam Carter", "4:14 PM", "No thanks"]]));
    expect(events[0].direction).toBe("inbound");
  });
});
