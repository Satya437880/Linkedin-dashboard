// Loads the BUILT background.js exactly as Chrome would (a classic script with a stubbed chrome API) and checks it
// accepts an event and posts it to the dashboard. Run after `npm run build`.
import fs from "node:fs";
import vm from "node:vm";

const code = fs.readFileSync("dist/background.js", "utf8");
const store = { config: { appUrl: "http://localhost:3000", token: "TESTTOKEN" } };
const posts = [];
let onMessage;
const chrome = {
  runtime: { onMessage: { addListener: (h) => { onMessage = h; } }, onInstalled: { addListener: () => {} }, onStartup: { addListener: () => {} } },
  storage: {
    local: {
      get: async (k) => (k in store ? { [k]: store[k] } : {}),
      set: async (o) => { Object.assign(store, JSON.parse(JSON.stringify(o))); },
    },
    onChanged: { addListener: () => {} },
  },
  alarms: { create: () => {}, onAlarm: { addListener: () => {} } },
  action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
};
const ctx = vm.createContext({
  chrome, console, setTimeout, clearTimeout, AbortSignal, URL, JSON, Promise, Date, Response,
  fetch: async (url, init) => { posts.push({ url, token: init.headers["x-ingest-token"], body: JSON.parse(init.body) }); return new Response("{}", { status: 200 }); },
});
try { vm.runInContext(code, ctx); } catch (e) { console.log("FAIL: background.js threw at load:", e.message); process.exit(1); }
if (typeof onMessage !== "function") { console.log("FAIL: background.js did not register a message listener"); process.exit(1); }

const ev = { source: "extension", eventType: "message.new", externalMessageId: "dom:x:1", externalThreadId: "t", inbox: "classic", direction: "inbound", text: "No thanks", sentAt: new Date().toISOString(), sender: { providerUserId: "p", fullName: "P", headline: null, photoUrl: null, linkedinUrl: null } };
const reply = await new Promise((resolve) => { onMessage({ type: "events", events: [ev] }, {}, resolve); });
await new Promise((r) => setTimeout(r, 200));
console.log("reply to the page:", JSON.stringify(reply));
console.log("posts sent to the dashboard:", posts.length, posts[0] ? `-> ${posts[0].url} (token ${posts[0].token})` : "");
const status = await new Promise((resolve) => { onMessage({ type: "status" }, {}, resolve); });
console.log("status:", JSON.stringify({ queued: status.queued, sent: status.sent, read: status.read, lastError: status.lastError, paused: status.paused }));
process.exit(posts.length === 1 ? 0 : 1);
