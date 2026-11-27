import { describe, expect, it } from "vitest";
import { SseSplitter } from "../src/shared/sse";

describe("SseSplitter", () => {
  it("extracts data lines across chunk boundaries", () => {
    const s = new SseSplitter();
    expect(s.push('event: x\ndata: {"a":1}\n')).toEqual([]);
    expect(s.push('\ndata: {"b":2}\n\n')).toEqual(['{"a":1}', '{"b":2}']);
  });
  it("handles CRLF and joins multi-line data", () => {
    const s = new SseSplitter();
    expect(s.push("data: one\r\ndata: two\r\n\r\n")).toEqual(["one\ntwo"]);
  });
  it("ignores comments and heartbeats", () => {
    const s = new SseSplitter();
    expect(s.push(": ping\n\n")).toEqual([]);
  });
});
