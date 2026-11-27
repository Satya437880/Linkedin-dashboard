// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { pageSnapshot, skeleton } from "../src/shared/skeleton";

describe("page skeleton", () => {
  const doc = new DOMParser().parseFromString(
    '<body><div class="msg-list" data-x="1"><a href="https://www.linkedin.com/in/jane-roe-123?trk=1">Jane Roe</a><p class="body">Please send pricing for 500 parts</p><script>secret()</script></div></body>',
    "text/html",
  );
  it("keeps tags and classes", () => {
    const s = JSON.stringify(skeleton(doc.body));
    expect(s).toContain("msg-list");
    expect(s).toContain('"t":"p"');
  });
  it("never includes message text or names", () => {
    const s = JSON.stringify(pageSnapshot(doc, "https://www.linkedin.com/sales/inbox/2-abcdefghijklmnop=="));
    expect(s).not.toMatch(/Jane|Roe|pricing|parts|secret/);
    expect(s).not.toContain("jane-roe-123");
    expect(s).not.toContain("abcdefghijklmnop");
  });
});
