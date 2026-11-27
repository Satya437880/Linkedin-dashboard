import { describe, expect, it } from "vitest";
import { buildHealth, type HealthInput } from "../src/shared/health";

const base: HealthInput = {
  token: "tok", appUrl: "http://localhost:3000", appStatus: 400, paused: false,
  tabs: [{ alive: true, kind: "classic-thread", status: "7 messages read from this chat" }], queued: 0, lastSentAt: "2026-11-24T12:00:00Z", lastError: null,
};
const fails = (i: Partial<HealthInput>) => buildHealth({ ...base, ...i }).filter((c) => !c.ok);

describe("connection health", () => {
  it("is all green when everything works", () => expect(fails({})).toEqual([]));

  it("a missing token says where to put it", () => {
    const f = fails({ token: "" });
    expect(f[0].text).toBe("No token saved");
    expect(f[0].fix).toMatch(/Options/);
  });
  it("an app that is off", () => expect(fails({ appStatus: null })[0].fix).toMatch(/npm run dev/));
  it("a wrong token", () => expect(fails({ appStatus: 401 })[0].text).toMatch(/rejected the token/));
  it("a stuck pause", () => expect(fails({ paused: true })[0].fix).toMatch(/Resume/));
  it("no LinkedIn tab", () => expect(fails({ tabs: [] })[0].text).toMatch(/No LinkedIn tab/));
  it("a tab the extension is not running in needs a reload", () => {
    const f = fails({ tabs: [null] });
    expect(f[0].text).toMatch(/not connected/);
    expect(f[0].fix).toMatch(/Reload that tab/);
  });
  it("a Sales Navigator tab is connected but not readable", () => {
    const f = fails({ tabs: [{ alive: true, kind: "salesnav", status: "Sales Navigator chats cannot be read yet" }] });
    expect(f[0].text).toMatch(/Sales Navigator chats cannot be read/);
  });
  it("waiting messages and nothing sent yet", () => {
    expect(fails({ queued: 3, lastError: "App not reachable. Will retry." })[0].text).toMatch(/3 messages waiting/);
    expect(fails({ lastSentAt: null })[0].text).toBe("Nothing has been sent yet");
  });
});
