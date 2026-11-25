import { describe, expect, it } from "vitest";
import { cleanHeadline, cleanName } from "../src/lib/clean";

const dirty = "Duane Jerore\n            \n        \n   \n    Status is offline\n         \n    President and CEO";

describe("clean scraped LinkedIn text", () => {
  it("keeps only the name", () => expect(cleanName(dirty)).toBe("Duane Jerore"));
  it("drops presence text from a headline", () => {
    expect(cleanHeadline("Status is offline\n   \n  President and CEO")).toBe("President and CEO");
    expect(cleanHeadline("Status is online\nPlant Manager at Acme")).toBe("Plant Manager at Acme");
  });
  it("recovers the headline from the name element when the headline is missing", () => {
    expect(cleanHeadline(null, dirty)).toBe("President and CEO");
  });
  it("leaves clean values alone", () => {
    expect(cleanName("Jane Roe")).toBe("Jane Roe");
    expect(cleanHeadline("Procurement Manager at Sample Co")).toBe("Procurement Manager at Sample Co");
    expect(cleanHeadline(null, "Jane Roe")).toBeNull();
  });
});
