import { EMPTY_DIAG, type Diag } from "../shared/diag";
import { buildHealth, type Check } from "../shared/health";
import { isPaused, PAUSE_KEY } from "../shared/pause";
import type { PageKind } from "../shared/pagekind";

const $ = (id: string) => document.getElementById(id)!;

async function getDiag(): Promise<Diag> {
  const { diag } = (await chrome.storage.local.get("diag")) as { diag?: Diag };
  return { ...EMPTY_DIAG, ...(diag ?? {}) };
}

function renderSwitch(paused: boolean) {
  $("switch").className = paused ? "switch off" : "switch";
  $("state").textContent = paused ? "Capture paused" : "Capture active";
  $("statehint").textContent = paused ? "New messages are not being read" : "Reading LinkedIn replies";
  const t = $("toggle");
  t.textContent = paused ? "Resume" : "Pause";
  t.setAttribute("aria-checked", String(!paused));
}

async function render() {
  const s = await chrome.runtime.sendMessage({ type: "status" });
  $("read").textContent = String(s.read);
  const sent = $("sent");
  const done = s.queued === 0 && !s.lastError;
  sent.textContent = done ? "Done" : "Waiting";
  sent.className = done ? "done" : "wait";
  $("queue").textContent = `${s.queued} waiting`;
  const host = String(s.appUrl).replace(/^https?:\/\//, "").replace(/\/$/, "");
  $("posted").textContent = `Posted to ${host}/api/ingest`;
  $("error").textContent = s.lastError ?? "";
  const d = await getDiag();
  $("d-pages").textContent = String(d.pages);
  $("d-seen").textContent = String(d.seen);
  $("d-rec").textContent = String(d.recognised);
  $("d-dom").textContent = `${d.domTried} (${d.domFound})`;
}

// The saved value is the single source of truth for the switch.
async function syncSwitch() {
  renderSwitch(isPaused((await chrome.storage.local.get(PAUSE_KEY))[PAUSE_KEY]));
}

let toggling = false;
$("toggle").addEventListener("click", async () => {
  if (toggling) return; // ignore double clicks while saving
  toggling = true;
  ($("toggle") as HTMLButtonElement).disabled = true;
  try {
    const cur = isPaused((await chrome.storage.local.get(PAUSE_KEY))[PAUSE_KEY]);
    await chrome.storage.local.set({ [PAUSE_KEY]: !cur });
    await syncSwitch();
  } finally {
    ($("toggle") as HTMLButtonElement).disabled = false;
    toggling = false;
  }
});
chrome.storage.onChanged.addListener((changes, area) => { if (area === "local" && changes[PAUSE_KEY]) void syncSwitch(); });

function paintHealth(checks: Check[]) {
  const ul = $("health");
  ul.textContent = "";
  for (const c of checks) {
    const li = document.createElement("li");
    li.className = c.ok ? "ok" : "bad";
    const mk = document.createElement("span");
    mk.className = "mk";
    mk.textContent = c.ok ? "OK" : "FIX";
    const body = document.createElement("span");
    body.textContent = c.text;
    if (c.fix) { const f = document.createElement("span"); f.className = "fix"; f.textContent = c.fix; body.appendChild(f); }
    li.append(mk, body);
    ul.appendChild(li);
  }
}

async function checkConnection() {
  $("check").textContent = "Checking...";
  const stored = (await chrome.storage.local.get(["config", "stats"])) as { config?: { appUrl?: string; token?: string }; stats?: { lastSentAt: string | null; lastError: string | null } };
  const appUrl = (stored.config?.appUrl ?? "http://localhost:3000").replace(/\/$/, "");
  const token = stored.config?.token ?? "";
  let appStatus: number | null = null;
  try {
    const r = await fetch(`${appUrl}/api/ingest`, { method: "POST", headers: { "content-type": "application/json", "x-ingest-token": token }, body: "{}", signal: AbortSignal.timeout(4000) });
    appStatus = r.status;
  } catch { appStatus = null; }
  const tabs = await chrome.tabs.query({ url: "https://www.linkedin.com/*" });
  const answers = await Promise.all(tabs.slice(0, 6).map(async (t) => {
    try { const a = await chrome.tabs.sendMessage(t.id!, { type: "ping" }); return a?.alive ? ({ alive: true as const, kind: a.kind as PageKind, status: a.status as string | undefined }) : null; } catch { return null; }
  }));
  const s = await chrome.runtime.sendMessage({ type: "status" }).catch(() => ({ queued: 0 }));
  paintHealth(buildHealth({ token, appUrl, appStatus, paused: isPaused((await chrome.storage.local.get(PAUSE_KEY))[PAUSE_KEY]), tabs: answers, queued: s?.queued ?? 0, lastSentAt: stored.stats?.lastSentAt ?? null, lastError: stored.stats?.lastError ?? null }));
  $("check").textContent = "Check connection";
}
$("check").addEventListener("click", () => { void checkConnection(); });

$("retry").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "flush" });
  await render();
});

// Masked sample for fixing the parser: JSON keys and counts only, message text and names are hidden.
$("dl").addEventListener("click", async () => {
  const d = await getDiag();
  const blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "mpss-diagnostic.json";
  a.click();
});

void syncSwitch();
void render().catch(() => undefined);
setInterval(() => { void render().catch(() => undefined); void syncSwitch(); }, 2000);

// Masked structure of the LinkedIn pages (tags and class names only), saved automatically by the content script.
$("snap").addEventListener("click", async () => {
  const { snapshots } = (await chrome.storage.local.get("snapshots")) as { snapshots?: Record<string, unknown> };
  const data = snapshots && Object.keys(snapshots).length ? snapshots : { error: "No snapshot yet. Open a conversation on LinkedIn and wait 10 seconds, then try again." };
  $("error").textContent = "error" in data ? String((data as { error: string }).error) : "";
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "mpss-page-structure.json";
  a.click();
});
