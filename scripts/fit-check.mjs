// Does the prospects table fit the screen without sideways scrolling, and is the LinkedIn column visible?
import { chromium } from "@playwright/test";
import crypto from "node:crypto";
import fs from "node:fs";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const payload = `${Date.now() + 1e7}.fit`;
const cookie = `${payload}.${crypto.createHmac("sha256", env.SESSION_SECRET).update(payload).digest("base64url")}`;
const browser = await chromium.launch({ channel: "chrome", headless: true });
for (const w of [1024, 1280, 1366, 1440, 1536, 1920]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
  await ctx.addCookies([{ name: "mpss_session", value: cookie, domain: "127.0.0.1", path: "/" }]);
  const page = await ctx.newPage();
  await page.goto("http://127.0.0.1:3000/prospects", { waitUntil: "networkidle" });
  const r = await page.evaluate(() => {
    const box = document.querySelector('[aria-label="Prospects table"]');
    const heads = [...document.querySelectorAll("thead th")].filter((h) => h.offsetParent).map((h) => h.textContent.trim());
    return { scroll: box ? box.scrollWidth : 0, client: box ? box.clientWidth : 0, heads };
  });
  console.log(w, r.scroll <= r.client + 1 ? "FITS" : `SCROLLS ${r.scroll}>${r.client}`, "| columns:", r.heads.length, r.heads.includes("LinkedIn") ? "(LinkedIn shown)" : "(LinkedIn MISSING)");
  await page.screenshot({ path: process.argv[2] + `/fit-prospects-${w}.png` });
  await ctx.close();
}
await browser.close();
