import { describe, expect, it } from "vitest";
import { firstNameOf, whoWrote } from "../src/server/ingest/sides";

const side = (text: string, name = "Duane Jerore") => whoWrote(text, name)?.side ?? null;

describe("firstNameOf", () => {
  it("skips credentials and decorations", () => {
    expect(firstNameOf("Ed Hunt, R.I.B. (Ont)")).toBe("ed");
    expect(firstNameOf("SWAMI NAIR")).toBe("swami");
  });
});

describe("whoWrote: our messages", () => {
  it("greets the client by name", () => expect(side("Hi Duane, we help OEMs source machining partners.")).toBe("ours"));
  it("opening line", () => expect(side("Greetings for the day! Thanks for connecting.")).toBe("ours"));
  it("sign-off", () => expect(side("Happy to share more details.\nBest regards,\nPrrithive Thakkum Sridharan | Maple MPSS")).toBe("ours"));
  it("thanks the client by name", () => expect(side("Thanks Duane, understood. All the best.")).toBe("ours"));
  it("speaks to the client mid-sentence", () => expect(side("Thanks for sending that over, Duane. Good to see what you run here.")).toBe("ours"));
});

describe("whoWrote: client messages", () => {
  it("addresses us by name, in any of the spellings", () => {
    expect(side("Hi Prrithive, thanks for reaching out but we are covered.")).toBe("client");
    expect(side("Prithhive, we are currently happy with our suppliers today.")).toBe("client");
    expect(side("I'm happy to connect, Prrithive")).toBe("client");
  });
  it("copes with the name stuck to the next sentence", () => expect(side("PrrithiveThank you for reaching out. Great brochure.")).toBe("client"));
  it("answers our outreach", () => expect(side("Hey! Thanks for reaching out. I am looking forward to learning more about this.")).toBe("client"));
  it("short replies", () => {
    expect(side("No thanks")).toBe("client");
    expect(side("Thanks")).toBe("client");
    expect(side("647-621-6728")).toBe("client");
  });
  it("signed with their own name", () => expect(side("Hi, this is on my to do list. Please send the email address. Thanks Duane")).toBe("client"));
});

describe("whoWrote: does not guess", () => {
  it("leaves proposals and long unmarked text undecided", () => {
    expect(side("How about 9:00am?")).toBeNull();
    expect(side("Would Wednesday afternoon work for a call?")).toBeNull();
    expect(side("Are you able to review designs and provide a full calculations package with an engineer stamp?")).toBeNull();
  });
  it("returns null for empty text", () => expect(side("   ")).toBeNull());
});
