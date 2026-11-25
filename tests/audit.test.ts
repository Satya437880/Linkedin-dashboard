import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { applyAudit, getAudit, sameName } from "../src/server/audit/apply";
import { extractFromText, extractWithModel, mergeExtracted } from "../src/server/audit/extract";
import { assertSafeUrl, fetchSheetText, isPrivateIp, mapHeaders, parseSheetUrl, syncSheet } from "../src/server/audit/sheet";
import { openDb } from "../src/server/db/client";
import { activities, companies, prospects } from "../src/server/db/schema";
import { ingestEvent } from "../src/server/ingest/ingestEvent";

const EXAMPLE = `Person:
Matt Bertino

LinkedIn:
https://linkedin.com/in/matt-bertino-1

Designation:
Director of US Operations

Company:
ABC Company

Company Overview:
Leading logistics solutions provider.

Audit Findings:
Homepage CTA is unclear.
Mobile menu is difficult to use.
Typography is inconsistent.

Recommendations:
Improve CTA visibility.
Optimize mobile navigation.
Standardize typography.`;

function seed() {
  const b = openDb(":memory:");
  const r = ingestEvent(b, {
    source: "manual", eventType: "message.new", externalMessageId: "m1", externalThreadId: "t1", inbox: "classic", direction: "outbound",
    text: "hi", sentAt: new Date(), sender: { providerUserId: "matt-bertino-1", fullName: "Matt Bertino", headline: null },
  });
  if (r.status !== "processed") throw new Error("seed failed");
  return { b, id: r.prospectId };
}

describe("extractFromText", () => {
  it("reads the labelled example", () => {
    const e = extractFromText(EXAMPLE);
    expect(e.person).toBe("Matt Bertino");
    expect(e.linkedin).toBe("https://linkedin.com/in/matt-bertino-1");
    expect(e.designation).toBe("Director of US Operations");
    expect(e.company).toBe("ABC Company");
    expect(e.overview).toEqual(["Leading logistics solutions provider."]);
    expect(e.findings).toEqual(["Homepage CTA is unclear.", "Mobile menu is difficult to use.", "Typography is inconsistent."]);
    expect(e.recommendations).toHaveLength(3);
  });
  it("handles inline values, markdown headings and bullets", () => {
    const e = extractFromText("## Pain Points\n- Slow quotes\n- Offshore delays\n\n**Industry**: Aerospace\nRequirements: 5-axis machining; AS9100");
    expect(e.painPoints).toEqual(["Slow quotes", "Offshore delays"]);
    expect(e.industry).toBe("Aerospace");
    expect(e.requirements).toEqual(["5-axis machining", "AS9100"]);
  });
  it("finds details in unlabelled text", () => {
    const e = extractFromText("Jane Roe\nProcurement Manager at Sample Co\nhttps://www.linkedin.com/in/jane-roe-9?trk=x\nSite: n/a\nEmail jane@sample.com or +1 416 555 0199\nhttps://sample.com");
    expect(e.person).toBe("Jane Roe");
    expect(e.designation).toBe("Procurement Manager");
    expect(e.company).toBe("Sample Co");
    expect(e.linkedin).toContain("linkedin.com/in/jane-roe-9");
    expect(e.website).toBe("https://sample.com");
    expect(e.contact).toContain("jane@sample.com");
    expect(e.contact).toContain("+1 416 555 0199");
  });
  it("keeps text that fits no field in Notes so nothing is lost", () => {
    const e = extractFromText("Met at the trade show, wants a call next week.\nDesignation: Plant Manager");
    expect(e.designation).toBe("Plant Manager");
    expect(e.notes).toContain("trade show");
  });
  it("returns an empty result for empty text", () => {
    expect(Object.keys(extractFromText("   "))).toHaveLength(0);
  });
});

describe("applyAudit", () => {
  it("populates the prospect, company and audit record, and logs it once", () => {
    const { b, id } = seed();
    const res = applyAudit(b, id, extractFromText(EXAMPLE), { source: "paste", actor: "user", rawText: EXAMPLE });
    expect(res.labels).toEqual(expect.arrayContaining(["Designation", "Company", "Company overview", "Audit findings", "Recommendations"]));
    const p = b.db.select().from(prospects).where(eq(prospects.id, id)).get()!;
    expect(p.designation).toBe("Director of US Operations");
    const c = b.db.select().from(companies).where(eq(companies.id, p.companyId!)).get()!;
    expect(c.name).toBe("ABC Company");
    expect((c.aiOverview as { bullets: string[] }).bullets[0]).toBe("Leading logistics solutions provider.");
    expect(getAudit(b, id)!.findings).toHaveLength(3);
    const log = b.db.select().from(activities).where(eq(activities.action, "Audit details pasted")).all();
    expect(log).toHaveLength(1);
  });
  it("is idempotent: applying the same data again changes nothing and logs nothing", () => {
    const { b, id } = seed();
    applyAudit(b, id, extractFromText(EXAMPLE), { source: "paste", actor: "user" });
    const again = applyAudit(b, id, extractFromText(EXAMPLE), { source: "paste", actor: "user" });
    expect(again.changed).toEqual([]);
    expect(b.db.select().from(activities).where(eq(activities.action, "Audit details pasted")).all()).toHaveLength(1);
  });
  it("only replaces the sections that were provided", () => {
    const { b, id } = seed();
    applyAudit(b, id, extractFromText(EXAMPLE), { source: "paste", actor: "user" });
    applyAudit(b, id, extractFromText("Pain Points:\nSlow quotes"), { source: "paste", actor: "user" });
    const a = getAudit(b, id)!;
    expect(a.painPoints).toEqual(["Slow quotes"]);
    expect(a.findings).toHaveLength(3);
  });
});

describe("sameName", () => {
  it("matches reordered names and ignores credentials", () => {
    expect(sameName("Matt Bertino", "Bertino Matt")).toBe(true);
    expect(sameName("Pat Augurusa, P.Eng.", "Pat Augurusa")).toBe(true);
    expect(sameName("Matt Bertino", "Jane Roe")).toBe(false);
  });
});

describe("sheet links", () => {
  it("converts a Google share link to a CSV export link, keeping the tab", () => {
    expect(parseSheetUrl("https://docs.google.com/spreadsheets/d/ABC_123-x/edit?gid=1064594377#gid=1064594377").csvUrl)
      .toBe("https://docs.google.com/spreadsheets/d/ABC_123-x/export?format=csv&gid=1064594377");
    expect(parseSheetUrl("https://docs.google.com/spreadsheets/d/ABC_123-x/edit").csvUrl).toBe("https://docs.google.com/spreadsheets/d/ABC_123-x/export?format=csv");
    expect(parseSheetUrl("https://docs.google.com/spreadsheets/d/e/2PACX-abc/pubhtml").csvUrl).toContain("/pub?output=csv");
  });
  it("accepts a direct https CSV link and rejects other links", () => {
    expect(parseSheetUrl("https://example.com/data.csv").kind).toBe("csv");
    expect(() => parseSheetUrl("http://example.com/data.csv")).toThrow(/https/);
    expect(() => parseSheetUrl("not a link")).toThrow(/valid link/);
    expect(() => parseSheetUrl("https://docs.google.com/document/d/abc/edit")).toThrow(/Google Sheets/);
  });
  it("blocks private addresses", async () => {
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("192.168.1.5")).toBe(true);
    expect(isPrivateIp("169.254.169.254")).toBe(true);
    expect(isPrivateIp("::1")).toBe(true);
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    await expect(assertSafeUrl("https://localhost/x")).rejects.toThrow(/this computer/);
    await expect(assertSafeUrl("https://10.0.0.4/x")).rejects.toThrow(/private/);
    await expect(assertSafeUrl("https://example.com/x", async () => ["10.1.1.1"])).rejects.toThrow(/private/);
    await expect(assertSafeUrl("https://example.com:8443/x", async () => ["93.184.216.34"])).rejects.toThrow(/port/);
    await expect(assertSafeUrl("https://example.com/x", async () => ["93.184.216.34"])).resolves.toBeUndefined();
  });
  it("explains a private sheet (login page or HTML)", async () => {
    const lookup = async () => ["142.250.80.46"];
    const html = async () => new Response("<!DOCTYPE html><html>sign in</html>", { status: 200, headers: { "content-type": "text/html" } });
    await expect(fetchSheetText("https://docs.google.com/spreadsheets/d/x/export?format=csv", { fetchFn: html as never, lookup })).rejects.toThrow(/private/);
    const redirectToLogin = async () => new Response(null, { status: 302, headers: { location: "https://accounts.google.com/ServiceLogin" } });
    await expect(fetchSheetText("https://docs.google.com/spreadsheets/d/x/export?format=csv", { fetchFn: redirectToLogin as never, lookup })).rejects.toThrow(/private/);
  });
  it("re-checks every redirect hop", async () => {
    const lookup = async (h: string) => (h === "evil.example" ? ["10.0.0.9"] : ["142.250.80.46"]);
    const hop = async () => new Response(null, { status: 302, headers: { location: "https://evil.example/data" } });
    await expect(fetchSheetText("https://docs.google.com/spreadsheets/d/x/export?format=csv", { fetchFn: hop as never, lookup })).rejects.toThrow(/private/);
  });
});

describe("column mapping and sync", () => {
  it("maps common header names", () => {
    const m = mapHeaders(["Slno", "Name ", "Linkedin", "Designation", "Company Name", "Company Overview", "Audit Findings", "Recommendations", "Contact Info", "Pain Points", "Website", "Industry", "responce"]);
    expect(Object.keys(m.map).sort()).toEqual(["company", "contact", "designation", "findings", "industry", "linkedin", "overview", "painPoints", "person", "recommendations", "website"].sort());
    expect(m.unmapped).toEqual(["Slno", "responce"]);
  });

  const CSV = [
    "Name,Linkedin,Designation,Company,Company Overview,Audit Findings,Recommendations,Pain Points",
    '"Matt Bertino",https://www.linkedin.com/in/matt-bertino-1?lipi=x,Director of US Operations,ABC Company,"Leading logistics provider.","Homepage CTA is unclear.\nMobile menu is hard to use.","Improve CTA; Optimize mobile nav",Slow quotes',
    "Unknown Person,https://www.linkedin.com/in/nobody,Manager,Nowhere Inc,,,,",
  ].join("\n");
  const fetchCsv = async () => new Response(CSV, { status: 200, headers: { "content-type": "text/csv" } });
  const lookup = async () => ["142.250.80.46"];

  it("syncs matching rows, counts unmatched rows, and is repeatable", async () => {
    const { b, id } = seed();
    const url = "https://docs.google.com/spreadsheets/d/SHEET1/edit?gid=5";
    const c = await syncSheet(b, url, { fetchFn: fetchCsv as never, lookup });
    expect(c.total).toBe(2);
    expect(c.matched).toBe(1);
    expect(c.updated).toBe(1);
    expect(c.unmatched).toEqual(["Unknown Person"]);
    expect(c.matchedIds).toEqual([id]);
    expect(c.columns.map((x) => x.field)).toEqual(expect.arrayContaining(["person", "linkedin", "findings"]));
    const a = getAudit(b, id)!;
    expect(a.findings).toEqual(["Homepage CTA is unclear.", "Mobile menu is hard to use."]);
    expect(a.recommendations).toEqual(["Improve CTA", "Optimize mobile nav"]);
    expect(a.painPoints).toEqual(["Slow quotes"]);
    const p = b.db.select().from(prospects).where(eq(prospects.id, id)).get()!;
    expect(p.designation).toBe("Director of US Operations");

    const again = await syncSheet(b, url, { fetchFn: fetchCsv as never, lookup });
    expect(again.updated).toBe(0); // nothing changed, so nothing new in the audit log
    expect(b.db.select().from(activities).where(eq(activities.action, "Audit details synced from sheet")).all()).toHaveLength(1);
  });
  it("rejects a sheet without usable columns", async () => {
    const { b } = seed();
    const bad = async () => new Response("foo,bar\n1,2", { status: 200, headers: { "content-type": "text/csv" } });
    await expect(syncSheet(b, "https://example.com/a.csv", { fetchFn: bad as never, lookup })).rejects.toThrow(/No usable columns/);
  });
});

describe("local AI extraction (mocked)", () => {
  const reply = (obj: unknown) => async () => new Response(JSON.stringify({ message: { content: JSON.stringify(obj) } }), { status: 200 });
  const opts = { url: "http://localhost:11434", model: "m" };

  it("fills only fields the rules left empty", async () => {
    const have = extractFromText("Designation: Plant Manager");
    const r = await extractWithModel("x", have, { ...opts, fetchFn: reply({ designation: "SHOULD NOT REPLACE", industry: "Packaging", findings: ["Slow site"] }) as never });
    expect(r!.data.designation).toBeUndefined();
    expect(r!.data.industry).toBe("Packaging");
    expect(r!.data.findings).toEqual(["Slow site"]);
    expect(mergeExtracted(have, r!.data).designation).toBe("Plant Manager");
  });
  it("returns null when the model is unreachable or answers with the wrong shape", async () => {
    expect(await extractWithModel("x", {}, { ...opts, fetchFn: (async () => { throw new Error("down"); }) as never })).toBeNull();
    expect(await extractWithModel("x", {}, { ...opts, fetchFn: reply({ findings: "not an array" }) as never })).toBeNull();
  });
});
