import { parseClassicDom, parseJson } from "../parsers";
import { walk } from "../parsers/types";
import { EMPTY_DIAG, recordDiag, recordSkipped, type Diag } from "../shared/diag";
import { pageKind, pillStatus } from "../shared/pagekind";
import { isPaused, PAUSE_KEY } from "../shared/pause";
import { pageSnapshot } from "../shared/skeleton";
import type { IngestEvent } from "../shared/types";

const TAG = "__mpss_capture__";
const PENDING = "pendingThreads";

/** False once the extension was reloaded or removed: this old copy of the script must go quiet. */
const alive = () => !!chrome.runtime?.id;

function every(ms: number, fn: () => void | Promise<void>) {
  const t = setInterval(() => {
    if (!alive()) return clearInterval(t);
    Promise.resolve().then(fn).catch(() => undefined);
  }, ms);
}

function send(events: IngestEvent[]) {
  if (events.length === 0 || !alive()) return;
  try {
    chrome.runtime.sendMessage({ type: "events", events }).catch(() => undefined);
  } catch { /* extension context invalidated */ }
}

async function updatePending(add: string[], remove: string[]) {
  if (!alive()) return;
  try {
    const cur = ((await chrome.storage.local.get(PENDING))[PENDING] as string[] | undefined) ?? [];
    const next = [...new Set([...cur, ...add])].filter((t) => !remove.includes(t));
    await chrome.storage.local.set({ [PENDING]: next });
  } catch { /* extension context invalidated or storage unavailable */ }
}

// Serialised read-modify-write so concurrent responses do not overwrite each other.
let diagChain: Promise<unknown> = Promise.resolve();
function diag(update: (d: Diag) => Diag) {
  if (!alive()) return;
  diagChain = diagChain.then(async () => {
    if (!alive()) return;
    const cur = { ...EMPTY_DIAG, ...(((await chrome.storage.local.get("diag")).diag as Diag | undefined) ?? {}) };
    await chrome.storage.local.set({ diag: update(cur) });
  }).catch(() => undefined);
}
diag((d) => ({ ...d, pages: d.pages + 1 }));

// Temporary stop. Kept in sync with the popup switch; the background also enforces it.
let paused = false;
chrome.storage.local.get(PAUSE_KEY).then((r) => { paused = isPaused(r[PAUSE_KEY]); }).catch(() => undefined);
chrome.storage.onChanged.addListener((ch, area) => { if (area === "local" && ch[PAUSE_KEY]) paused = isPaused(ch[PAUSE_KEY].newValue); });

// A chat is read two ways: from LinkedIn's own data and from the visible page. Either one can hold only part of
// the chat, so both run. Their ids differ, so messages are matched on chat, minute and text.
const readBy = { json: new Set<string>(), dom: new Set<string>() };
function notYetRead(events: IngestEvent[], source: "json" | "dom"): IngestEvent[] {
  const other = readBy[source === "json" ? "dom" : "json"];
  return events.filter((e) => {
    const key = `${decodeURIComponent(e.externalThreadId)}|${e.sentAt.slice(0, 16)}|${e.text?.trim()}`;
    if (other.has(key)) return false;
    readBy[source].add(key);
    return true;
  });
}

window.addEventListener("message", (e) => {
  if (!alive() || paused) return;
  try {
    handleMessage(e);
  } catch (err) {
    // Never let a parsing problem surface as an uncaught error on LinkedIn's page.
    console.debug("[MPSS capture] ignored an error:", err);
  }
});

function handleMessage(e: MessageEvent) {
  if (e.source !== window || !e.data || e.data[TAG] !== true) return;
  if (e.data.skipped) {
    diag((d) => recordSkipped(d, String(e.data.url ?? ""), String(e.data.ct ?? "")));
    return;
  }
  const json = e.data.json;
  const events = parseJson(json);
  diag((d) => recordDiag(d, String(e.data.url ?? ""), json, events.length > 0, e.data.sse === true));
  if (events.length) {
    send(notYetRead(events, "json"));
    void updatePending([], events.map((x) => x.externalThreadId));
  }
  // Conversations with unread messages: remember them so the inbox list can flag them.
  const unread: string[] = [];
  walk(json, (o) => {
    if (typeof o.entityUrn === "string" && o.entityUrn.includes("msg_conversation") && typeof o.unreadCount === "number" && o.unreadCount > 0) {
      const id = /,(2-[^)]+)\)/.exec(o.entityUrn)?.[1];
      if (id) unread.push(id);
    }
  });
  if (unread.length) void updatePending(unread, []);
}

// Fallback: if a thread is open and no JSON was parsed for it, read the visible page text.
/** Saves a masked structure snapshot of this page (see shared/skeleton.ts) for the popup to download. */
function takeSnapshot() {
  if (!alive() || paused) return;
  try {
    const kind = location.pathname.startsWith("/sales/") ? "salesnav" : "classic";
    const snap = pageSnapshot(document, location.href);
    chrome.storage.local.get("snapshots").then((r) => chrome.storage.local.set({ snapshots: { ...(r.snapshots ?? {}), [kind]: snap } })).catch(() => undefined);
  } catch { /* ignore */ }
}
setTimeout(takeSnapshot, 8000);

let lastPath = "";
every(1500, () => {
  if (location.pathname !== lastPath) {
    lastPath = location.pathname;
    setTimeout(takeSnapshot, 6000);
    lastRead = null;
    setTimeout(() => void scanOpenThread(), 3000); // first read soon after the chat opens
  }
});

// While a chat is open, read it again every few seconds. Messages that were still loading, or a reply that
// arrives while you are looking at the chat, are picked up without reopening. Only unseen messages are sent.
const sentIds = new Set<string>();
let lastRead: number | null = null;
async function scanOpenThread() {
  if (!alive() || paused || pageKind(location.pathname) !== "classic-thread") return;
  let ownName: string | undefined;
  try { ownName = ((await chrome.storage.local.get("config")).config as { ownName?: string } | undefined)?.ownName; } catch { /* storage unavailable */ }
  const found = parseClassicDom(document, location.href, undefined, ownName);
  lastRead = found.length;
  const unsent = found.filter((e) => !sentIds.has(e.externalMessageId));
  unsent.forEach((e) => sentIds.add(e.externalMessageId));
  const fresh = notYetRead(unsent, "dom");
  diag((d) => ({ ...d, domTried: d.domTried + 1, domFound: d.domFound + fresh.length }));
  send(fresh);
}
every(8000, () => scanOpenThread());

// Mark inbox-list threads that have new messages (a small orange dot). Presentation only.
every(3000, async () => {
  const pending = ((await chrome.storage.local.get(PENDING))[PENDING] as string[] | undefined) ?? [];
  for (const id of pending) {
    for (const a of Array.from(document.querySelectorAll<HTMLAnchorElement>(`a[href*="${id}"]`))) {
      if (a.dataset.mpssMarked) continue;
      a.dataset.mpssMarked = "1";
      a.style.borderLeft = "4px solid #F58220";
    }
  }
});


// The popup can ask this page for a masked structure snapshot (no text, no names) to help fix selectors.
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  // The popup's Check connection asks each LinkedIn tab whether the extension is running in it.
  if (msg?.type === "ping") {
    reply({ alive: true, paused, kind: pageKind(location.pathname), status: pillStatus(pageKind(location.pathname), lastRead) });
    return;
  }
  if (msg?.type === "snapshot") {
    try {
      reply(pageSnapshot(document, location.href));
    } catch (err) {
      reply({ error: String(err) });
    }
  }
});

// Small read-only status badge so it is obvious the extension is running on this page. Not interactive.
every(2500, async () => {
  if (!document.body) return;
  let el = document.getElementById("mpss-badge");
  if (!el) {
    el = document.createElement("div");
    el.id = "mpss-badge";
    el.style.cssText = "position:fixed;bottom:12px;right:12px;z-index:2147483647;background:#222;color:#fff;font:12px system-ui,sans-serif;padding:6px 10px;border-radius:14px;border-left:4px solid #6B2737;pointer-events:none;opacity:.9";
    document.body.appendChild(el);
  }
  const { stats, diag } = (await chrome.storage.local.get(["stats", "diag"])) as { stats?: { read: number; sent: number }; diag?: Diag };
  el.style.borderLeftColor = paused ? "#D3A69F" : "#6B2737";
  if (paused) { el.textContent = "MPSS capture PAUSED"; return; }
  el.textContent = `MPSS: ${pillStatus(pageKind(location.pathname), lastRead)} | saved ${stats?.read ?? 0} | sent ${stats?.sent ?? 0}`;
});
