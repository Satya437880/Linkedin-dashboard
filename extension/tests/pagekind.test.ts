import { describe, expect, it } from "vitest";
import { pageKind, pillStatus } from "../src/shared/pagekind";

describe("pageKind", () => {
  it("recognises LinkedIn page types", () => {
    expect(pageKind("/messaging/thread/2-ABC==/")).toBe("classic-thread");
    expect(pageKind("/messaging/")).toBe("classic-list");
    expect(pageKind("/messaging")).toBe("classic-list");
    expect(pageKind("/sales/inbox/2-YjEy==")).toBe("salesnav");
    expect(pageKind("/feed/")).toBe("other");
  });
});

describe("pillStatus tells you what is happening", () => {
  it("chat pages", () => {
    expect(pillStatus("classic-thread", null)).toBe("reading this chat...");
    expect(pillStatus("classic-thread", 7)).toBe("7 messages read from this chat");
    expect(pillStatus("classic-thread", 0)).toBe("no messages found on this page");
  });
  it("pages it cannot read", () => {
    expect(pillStatus("salesnav", null)).toMatch(/Sales Navigator chats cannot be read/);
    expect(pillStatus("classic-list", null)).toMatch(/open a chat/);
    expect(pillStatus("other", null)).toMatch(/not a messaging page/);
  });
});
