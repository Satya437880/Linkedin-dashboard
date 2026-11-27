/**
 * Diagnostics: counts what the page hook sees and keeps a few MASKED samples so the parser can be fixed
 * without sharing real messages. Masking keeps JSON keys and URN type words, and hides every other string.
 */

const KEEP_WORD = /^(li|[a-z_]{3,})$/;

export function maskString(s: string): string {
  if (s.startsWith("urn:")) {
    return s.split(/([:(),])/).map((seg) => (KEEP_WORD.test(seg) || /^[:(),]$/.test(seg) ? seg : seg.replace(/[A-Za-z0-9]/g, "x"))).join("");
  }
  return s.slice(0, 40).replace(/[A-Za-z0-9]/g, "x");
}

export function maskJson(v: unknown, depth = 0): unknown {
  if (depth > 30) return null;
  if (typeof v === "string") return maskString(v);
  if (Array.isArray(v)) return v.slice(0, 8).map((x) => maskJson(x, depth + 1));
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = maskJson(x, depth + 1);
    return out;
  }
  return v; // numbers, booleans, null stay (timestamps help)
}

export interface Diag {
  pages: number;
  domTried: number;
  domFound: number;
  seen: number;
  recognised: number;
  live: number;
  urls: string[];
  others: string[];
  samples: { path: string; at: string; recognised: boolean; json: unknown }[];
}

export const EMPTY_DIAG: Diag = { pages: 0, domTried: 0, domFound: 0, seen: 0, recognised: 0, live: 0, urls: [], others: [], samples: [] };

const MESSAGEY = /msg_|messag|conversation|participant/i;

/** Requests the hook ignored (not message-like JSON). Path and content type only, no query strings. */
export function recordSkipped(d: Diag, url: string, ct: string): Diag {
  const path = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0].replace(/\d{4,}/g, "N");
  const entry = `${path} [${ct.split(";")[0] || "no type"}]`;
  if ((d.others ?? []).includes(entry)) return d;
  return { ...d, others: [...(d.others ?? []), entry].slice(-40) };
}

export function recordDiag(d: Diag, url: string, json: unknown, recognised: boolean, live = false): Diag {
  const next: Diag = { ...d, live: (d.live ?? 0) + (live ? 1 : 0), seen: d.seen + 1, recognised: d.recognised + (recognised ? 1 : 0), samples: d.samples };
  const q = /[?&]queryId=([^&]+)/.exec(url)?.[1];
  const shortUrl = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0].replace(/\d{4,}/g, "N") + (q ? "?queryId=" + q.replace(/\.[A-Za-z0-9_-]+$/, "") : "");
  next.urls = [...new Set([...(d.urls ?? []), shortUrl])].slice(-25);
  let text = "";
  try { text = JSON.stringify(json); } catch { /* ignore */ }
  if (text && MESSAGEY.test(text) && text.length < 400_000) {
    const path = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0].replace(/\d{4,}/g, "N");
    next.samples = [...d.samples, { path, at: new Date().toISOString(), recognised, json: maskJson(json) }].slice(-6);
  }
  return next;
}
