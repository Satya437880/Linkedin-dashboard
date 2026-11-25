// End-to-end check of the sidebar pages "Import from Sheet" and "Paste Audit Details" against an ISOLATED
// server (port 3100, a copy of the database). Usage: node scripts/e2e-audit.mjs <screenshotDir>
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import Database from "better-sqlite3";
import crypto from "node:crypto";
import fs from "node:fs";

const out = process.argv[2];
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const payload = `${Date.now() + 1e7}.e2e`;
const cookie = `${payload}.${crypto.createHmac("sha256", env.SESSION_SECRET).update(payload).digest("base64url")}`;
const db = new Database("./data/e2e.db", { readonly: true });
const matt = db.prepare("select id from prospects where full_name = 'Matt Bertino'").get().id;
const BASE = "http://127.0.0.1:3100";

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`); };
const seen = async (loc, ms = 20000) => loc.first().waitFor({ state: "visible", timeout: ms }).then(() => true, () => false);

const EXAMPLE = `Person:
Matt Bertino

LinkedIn:
https://linkedin.com/in/matt-bertino-demo

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

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies([{ name: "mpss_session", value: cookie, domain: "127.0.0.1", path: "/" }]);
const page = await ctx.newPage();
const analyze = () => page.getByRole("button", { name: "Analyze & Populate" }).click();

// ---------------- sidebar
await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
const nav = (await page.locator('aside nav[aria-label="Main"] a').allInnerTexts()).map((t) => t.trim());
check("sidebar order: Dashboard, Prospects, Import from Sheet, Paste Audit Details, Paste to add, CSV import, Settings",
  JSON.stringify(nav) === JSON.stringify(["Dashboard", "Prospects", "Import from Sheet", "Paste Audit Details", "Paste to add", "CSV import", "Settings"]), nav.join(" | "));

// ---------------- the Audit tab no longer holds the cards, only a pointer
await page.goto(`${BASE}/prospects/${matt}?tab=audit`, { waitUntil: "networkidle" });
check("Audit tab has no embedded cards any more", (await page.locator("#audit-text").count()) === 0 && (await page.locator("#sheet-url").count()) === 0);
const pointer = await page.locator("main").getByRole("link", { name: "Paste Audit Details" }).first().getAttribute("href");
check("Audit tab links to the paste page for this person", pointer === `/paste-audit?prospect=${matt}`, pointer);

// ---------------- Paste Audit Details page
await page.locator("main").getByRole("link", { name: "Paste Audit Details" }).first().click();
await page.waitForURL(/paste-audit/);
check("page title shown", await seen(page.getByRole("heading", { name: "Paste Audit Details", level: 1 })));
check("sidebar highlights the current page", (await page.locator('aside a[aria-current="page"]').innerText()).trim() === "Paste Audit Details");
check("person is preselected from the link", (await page.locator("#audit-prospect option:checked").innerText()).trim() === "Matt Bertino");
check("textarea has the requested placeholder", ((await page.locator("#audit-text").getAttribute("placeholder")) ?? "").startsWith("Paste Prospect Details, Audit Details, LinkedIn Research"));
await page.screenshot({ path: `${out}/paste-audit-1440.png` });

await page.locator("#audit-text").fill(EXAMPLE);
await analyze();
check("chosen prospect: fields are populated", await seen(page.getByText(/Populated \d+ fields? for Matt Bertino/), 15000), (await page.locator('[role="status"]').first().innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 110));
check("result links to the audit page", await seen(page.getByRole("link", { name: /View Matt Bertino.s audit details/ }), 5000));
await page.screenshot({ path: `${out}/paste-audit-done-1440.png` });
await page.getByRole("link", { name: /View Matt Bertino.s audit details/ }).click();
await page.waitForURL(/tab=audit/);
const body = await page.locator("main").innerText();
check("Details show the company and overview", body.includes("ABC Company") && body.includes("Leading logistics solutions provider."));
check("Details show 3 findings and the recommendations", ["Homepage CTA is unclear.", "Mobile menu is difficult to use.", "Typography is inconsistent.", "Improve CTA visibility.", "Standardize typography."].every((t) => body.includes(t)));
check("the locked activity log recorded it", body.includes("Audit details pasted"));
await page.screenshot({ path: `${out}/audit-tab-after-1440.png`, fullPage: true });

// auto-detect from the text (no prospect chosen)
await page.goto(`${BASE}/paste-audit`, { waitUntil: "networkidle" });
check("without a link the selector starts on Detect", (await page.locator("#audit-prospect option:checked").innerText()).includes("Detect"));
await page.locator("#audit-text").fill("Person: Matt Bertino\nPain Points:\nSlow quotes\nOffshore delays");
await analyze();
check("auto-detect finds the person from the text", await seen(page.getByText(/Populated 1 field for Matt Bertino/), 15000));

await page.locator("#audit-text").fill("Person: Somebody Nobody\nDesignation: Buyer");
await analyze();
check("auto-detect with an unknown person explains what to do", await seen(page.getByText(/Could not tell which prospect/), 15000));

await page.locator("#audit-text").fill(EXAMPLE);
await analyze();
check("pasting the same text again is a no-op", await seen(page.getByText(/Nothing new for Matt Bertino/), 15000));

// a chosen prospect that differs from the text needs confirmation
await page.locator("#audit-prospect").selectOption({ label: "John Smith" });
await page.locator("#audit-text").fill("Person: Matt Bertino\nDesignation: Wrong Person Title");
await analyze();
check("different person than the chosen one triggers a confirmation", await seen(page.getByRole("button", { name: /Apply to John Smith anyway/ }), 15000));
const john = db.prepare("select id from prospects where full_name = 'John Smith'").get().id;
await page.goto(`${BASE}/prospects/${john}?tab=audit`, { waitUntil: "networkidle" });
check("...and nothing was written to John Smith", !(await page.locator("main").innerText()).includes("Wrong Person Title"));

// ---------------- Import from Sheet page
await page.getByRole("link", { name: "Import from Sheet" }).first().click();
await page.waitForURL(/import-sheet/);
check("sheet page title shown", await seen(page.getByRole("heading", { name: "Import from Sheet", level: 1 })));
check("sidebar highlights the current page", (await page.locator('aside a[aria-current="page"]').innerText()).trim() === "Import from Sheet");
if (await page.getByRole("button", { name: "Delete link" }).isVisible()) {
  await page.getByRole("button", { name: "Delete link" }).click();
  await page.getByRole("button", { name: "Yes, delete" }).click();
  await page.getByText(/Sheet link deleted/).waitFor();
  await page.reload({ waitUntil: "networkidle" });
}
check("column headers help is shown", await seen(page.getByText("Column headers it understands"), 3000));
await page.screenshot({ path: `${out}/import-sheet-1440.png` });

const url = page.locator("#sheet-url");
await url.fill("not a link");
await page.getByRole("button", { name: "Connect", exact: true }).click();
check("invalid link shows an error", await seen(page.getByText(/not a valid link/i), 10000));
check("the link stays in the box after an error", (await url.inputValue()) === "not a link");

await url.fill("https://docs.google.com/spreadsheets/d/ThisSheetDoesNotExist123456789/edit?gid=0");
await page.getByRole("button", { name: "Connect", exact: true }).click();
check("unreachable or private Google sheet shows a clear error", await seen(page.getByText(/private|not found|could not be downloaded|Could not download/i), 40000));

await url.fill("https://raw.githubusercontent.com/datasciencedojo/datasets/master/titanic.csv");
await page.getByRole("button", { name: "Connect", exact: true }).click();
check("a sheet with no matching columns explains what is needed", await seen(page.getByText(/No usable columns/), 40000));

await url.fill("http://localhost:3000/x.csv");
await page.getByRole("button", { name: "Connect", exact: true }).click();
check("non-https and local links are refused", await seen(page.getByText(/Only https/), 10000));

await url.fill("https://docs.google.com/spreadsheets/d/SavedLinkTest123/edit?gid=7");
await page.getByRole("button", { name: "Save link" }).click();
await page.getByText("Link saved, not synced yet").waitFor({ timeout: 10000 });
await page.reload({ waitUntil: "networkidle" });
check("saved link shows Refresh, Edit and Delete", (await page.getByRole("button", { name: "Refresh data" }).isVisible()) && (await page.getByRole("button", { name: "Edit link" }).isVisible()) && (await page.getByRole("button", { name: "Delete link" }).isVisible()));
await page.screenshot({ path: `${out}/import-sheet-saved-1440.png` });
await page.getByRole("button", { name: "Edit link" }).click();
check("Edit link opens the input with the link filled in", (await page.locator("#sheet-url").inputValue()).includes("SavedLinkTest123"));
await page.getByRole("button", { name: "Cancel" }).click();
await page.getByRole("button", { name: "Delete link" }).click();
check("delete asks for confirmation", await seen(page.getByText("Delete this link?"), 3000));
await page.getByRole("button", { name: "Yes, delete" }).click();
await page.getByText(/Sheet link deleted/).waitFor({ timeout: 10000 });
await page.reload({ waitUntil: "networkidle" });
check("after delete the input is back and empty", (await page.locator("#sheet-url").isVisible()) && (await page.locator("#sheet-url").inputValue()) === "");

// ---------------- responsive + accessibility on both new pages
for (const path of ["/import-sheet", "/paste-audit", `/prospects/${matt}?tab=audit`]) {
  for (const w of [320, 375, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    const m = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
    check(`no horizontal overflow: ${path.split("?")[0]} at ${w}px`, m.s <= m.c + 1, `${m.s} vs ${m.c}`);
    if (w === 375 && path === "/paste-audit") await page.screenshot({ path: `${out}/paste-audit-375.png` });
    if (w === 375 && path === "/import-sheet") await page.screenshot({ path: `${out}/import-sheet-375.png` });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  check(`axe: no WCAG A/AA violations on ${path.split("?")[0]}`, axe.violations.length === 0, axe.violations.map((v) => `${v.id} (${v.nodes[0]?.target.join(" ")})`).join("; "));
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
