import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseJson } from "../src/parsers";

const load = (f: string) => JSON.parse(readFileSync(new URL(`../fixtures/${f}`, import.meta.url), "utf8"));

describe("classic thread parser", () => {
  const events = parseJson(load("classic-thread.json"));
  it("finds both messages", () => expect(events).toHaveLength(2));
  it("marks my message outbound and attributes it to the prospect thread", () => {
    const out = events.find((e) => e.direction === "outbound")!;
    expect(out.text).toContain("CNC machining");
    expect(out.sender.fullName).toBe("Jane Roe");
    expect(out.sender.providerUserId).toBe("ACoAAPRO002");
    expect(out.externalThreadId).toBe("2-THREAD111==");
    expect(out.inbox).toBe("classic");
  });
  it("marks the prospect message inbound with profile data", () => {
    const inn = events.find((e) => e.direction === "inbound")!;
    expect(inn.text).toBe("Can you send a quotation for 500 brackets?");
    expect(inn.sender.headline).toBe("Procurement Manager at Sample Co");
    expect(inn.sender.photoUrl).toBe("https://media.example.com/large.jpg");
    expect(inn.sentAt).toBe(new Date(1763238000000).toISOString());
  });
  it("uses stable message ids", () => {
    expect(events.map((e) => e.externalMessageId)).toEqual([
      "urn:li:msg_message:(urn:li:fsd_profile:ACoAAME001,2-MSG1==)",
      "urn:li:msg_message:(urn:li:fsd_profile:ACoAAME001,2-MSG2==)",
    ]);
  });
  it("ignores unrelated JSON", () => expect(parseJson({ data: { foo: [1, 2, { bar: "x" }] } })).toEqual([]));
});

describe("Sales Navigator thread parser", () => {
  const events = parseJson(load("salesnav-thread.json"));
  it("finds both messages with the prospect as sender", () => {
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.inbox === "sales_navigator" && e.sender.fullName === "Sam Lead")).toBe(true);
    expect(events[0].sender.headline).toBe("Plant Manager at Demo Works");
  });
  it("sets direction from the viewer", () => {
    expect(events[0].direction).toBe("outbound");
    expect(events[1].direction).toBe("inbound");
  });
});
