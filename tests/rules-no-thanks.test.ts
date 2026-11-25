import { describe, expect, it } from "vitest";
import { classifyByRules } from "../src/server/ai/rules";

describe("polite refusals are Not at this time", () => {
  it.each(["No thanks", "No, thanks", "No thank you. Not at this time", "We're good for now, thanks", "We are ok for now thank you"])("%s", (t) => {
    expect(classifyByRules(t)?.category).toBe("not_now");
  });
  it("still treats a real refusal to be contacted as negative", () => {
    expect(classifyByRules("Please stop messaging me")?.category).toBe("negative");
  });
});
