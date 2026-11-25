// Visual + accessibility audit: loads every screen at six widths in real Chrome, checks for horizontal
// overflow, runs axe (WCAG 2 A/AA) and saves screenshots. Usage: node scripts/ui-audit.mjs <outDir>
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const out = process.argv[2] ?? "./ui-audit";
fs.mkdirSync(out, { recursive: true });

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const payload = `${Date.now() + 1e7}.audit`;
const cookie = `${payload}.${crypto.createHmac("sha256", env.SESSION_SECRET).update(payload).digest("base64url")}`;

const BASE = "http://127.0.0.1:3000";
const WIDTHS = [320, 375, 768, 1024, 1440, 1920];
const PAGES = [
  ["login", "/login", false],
  ["dashboard", "/dashboard?range=all", true],
  ["prospects", "/prospects", true],
  ["prospect", "/prospects/1", true],
  ["prospect-audit", "/prospects/1?tab=audit", true],
  ["settings", "/settings", true],
  ["paste", "/paste", true],
  ["import", "/import", true],
];

const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
const axeIssues = new Map();

for (const w of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addCookies([{ name: "mpss_session", value: cookie, domain: "127.0.0.1", path: "/" }]);
  const page = await ctx.newPage();
  for (const [name, url, authed] of PAGES) {
    if (!authed) await ctx.clearCookies();
    else await ctx.addCookies([{ name: "mpss_session", value: cookie, domain: "127.0.0.1", path: "/" }]);
    const resp = await page.goto(BASE + url, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => {
      const de = document.documentElement;
      const over = [];
      const vw = de.clientWidth;
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right > vw + 1 && !el.closest("[data-allow-scroll], .overflow-x-auto, nav")) over.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 3).join(".")}`);
      }
      return { scrollW: de.scrollWidth, clientW: vw, over: [...new Set(over)].slice(0, 5) };
    });
    const overflow = m.scrollW > m.clientW + 1;
    results.push({ page: name, width: w, status: resp?.status(), overflow, scrollW: m.scrollW, clientW: m.clientW, culprits: m.over });
    await page.screenshot({ path: path.join(out, `${name}-${w}.png`), fullPage: false });
    if (w === 1440 || w === 375) {
      const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      for (const v of axe.violations) {
        const key = `${v.id}`;
        const e = axeIssues.get(key) ?? { id: v.id, impact: v.impact, help: v.help, pages: new Set(), nodes: [] };
        e.pages.add(`${name}@${w}`);
        for (const n of v.nodes.slice(0, 2)) e.nodes.push(`${name}: ${n.target.join(" ")} :: ${(n.failureSummary ?? "").split("\n")[1] ?? ""}`.slice(0, 220));
        axeIssues.set(key, e);
      }
    }
  }
  await ctx.close();
}
await browser.close();

const bad = results.filter((r) => r.overflow || r.status !== 200);
console.log(`checked ${results.length} screen/width combinations`);
console.log(bad.length ? "PROBLEMS:" : "no horizontal overflow, all pages 200");
for (const b of bad) console.log(" ", b.page, b.width, `status ${b.status}`, b.overflow ? `overflow ${b.scrollW}>${b.clientW}` : "", b.culprits.join(" | "));
console.log(`axe: ${axeIssues.size} distinct rule(s) violated`);
for (const e of axeIssues.values()) {
  console.log(` - [${e.impact}] ${e.id}: ${e.help} (${[...e.pages].join(", ")})`);
  for (const n of e.nodes.slice(0, 3)) console.log(`     ${n}`);
}
fs.writeFileSync(path.join(out, "results.json"), JSON.stringify({ results, axe: [...axeIssues.values()].map((e) => ({ ...e, pages: [...e.pages] })) }, null, 1));
