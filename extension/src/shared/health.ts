import { pillStatus, type PageKind } from "./pagekind";

export type Check = { ok: boolean; text: string; fix?: string };

export interface HealthInput {
  token: string;
  appUrl: string;
  /** HTTP status from the dashboard, or null when it could not be reached. */
  appStatus: number | null;
  paused: boolean;
  /** One entry per open LinkedIn tab: null when the extension is not running in that tab. */
  tabs: ({ alive: true; kind: PageKind; status?: string } | null)[];
  queued: number;
  lastSentAt: string | null;
  lastError: string | null;
}

/** Turns raw facts into a short list of checks, each with the exact fix when it fails. */
export function buildHealth(i: HealthInput): Check[] {
  const out: Check[] = [];
  out.push(i.token
    ? { ok: true, text: "Token saved" }
    : { ok: false, text: "No token saved", fix: "Open Options, paste the token from the dashboard Settings page, then Save." });

  if (i.appStatus === null) out.push({ ok: false, text: `Dashboard not reachable at ${i.appUrl}`, fix: "Start the dashboard: run npm run dev in the app folder." });
  else if (i.appStatus === 401) out.push({ ok: false, text: "Dashboard rejected the token", fix: "The token in Options is wrong. Copy it again from the dashboard Settings page." });
  else if (i.appStatus === 400 || (i.appStatus >= 200 && i.appStatus < 300)) out.push({ ok: true, text: "Dashboard reachable and token accepted" });
  else out.push({ ok: false, text: `Dashboard answered with error ${i.appStatus}`, fix: "Check the terminal running the dashboard for an error." });

  out.push(i.paused
    ? { ok: false, text: "Capture is paused", fix: "Click Resume at the top of this popup." }
    : { ok: true, text: "Capture is on" });

  if (i.tabs.length === 0) {
    out.push({ ok: false, text: "No LinkedIn tab is open in this browser", fix: "Open linkedin.com/messaging in this same Chrome profile." });
  } else {
    const dead = i.tabs.filter((t) => t === null).length;
    const live = i.tabs.filter((t) => t !== null);
    if (dead) out.push({ ok: false, text: `${dead} LinkedIn tab${dead > 1 ? "s are" : " is"} not connected to the extension`, fix: "Reload that tab (F5). A tab that was open before the extension was updated needs a reload." });
    for (const t of live) {
      if (!t) continue;
      const text = t.status ?? pillStatus(t.kind, null);
      out.push({ ok: t.kind === "classic-thread" || t.kind === "classic-list", text: `A LinkedIn tab is connected: ${text}` });
    }
  }

  if (i.queued > 0) out.push({ ok: false, text: `${i.queued} message${i.queued > 1 ? "s" : ""} waiting to be sent`, fix: i.lastError ?? "They will send as soon as the dashboard is reachable." });
  out.push(i.lastSentAt
    ? { ok: true, text: `Last message sent ${new Date(i.lastSentAt).toLocaleString()}` }
    : { ok: false, text: "Nothing has been sent yet", fix: "Open a conversation and wait about 10 seconds." });
  return out;
}
