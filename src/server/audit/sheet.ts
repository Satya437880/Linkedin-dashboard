import dns from "node:dns/promises";
import net from "node:net";
import { eq } from "drizzle-orm";
import type { DbBundle } from "../db/client";
import { prospects, settings } from "../db/schema";
import { parseCsv } from "../ingest/csvImport";
import { applyAudit, linkedinSlug, normName } from "./apply";
import { ALL_FIELDS, FIELD_LABEL, LIST_FIELDS, fieldForLabel, toPoints, type Extracted, type FieldKey } from "./extract";

export class SheetError extends Error {
  constructor(public code: "url" | "blocked" | "private" | "fetch" | "empty" | "columns", message: string) {
    super(message);
  }
}

// ---------------------------------------------------------------- URLs

export type ParsedSheetUrl = { csvUrl: string; kind: "google" | "csv" };

/** Turns a pasted link into a CSV download link. Google Sheets share links become their export URL. */
export function parseSheetUrl(input: string): ParsedSheetUrl {
  let u: URL;
  try { u = new URL(input.trim()); } catch { throw new SheetError("url", "That is not a valid link. Paste the full address, starting with https://"); }
  if (u.protocol !== "https:") throw new SheetError("url", "Only https:// links are supported.");
  if (u.hostname === "docs.google.com") {
    const pub = /^\/spreadsheets\/d\/e\/([^/]+)\/pub/.exec(u.pathname);
    if (pub) {
      const gid = u.searchParams.get("gid");
      return { kind: "google", csvUrl: `https://docs.google.com/spreadsheets/d/e/${pub[1]}/pub?output=csv${gid ? `&gid=${encodeURIComponent(gid)}` : ""}` };
    }
    const m = /^\/spreadsheets\/d\/([A-Za-z0-9_-]+)/.exec(u.pathname);
    if (!m) throw new SheetError("url", "This does not look like a Google Sheets link.");
    const gid = u.searchParams.get("gid") ?? /gid=(\d+)/.exec(u.hash)?.[1];
    return { kind: "google", csvUrl: `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv${gid ? `&gid=${encodeURIComponent(gid)}` : ""}` };
  }
  return { kind: "csv", csvUrl: u.toString() };
}

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b2] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b2 === 254) || (a === 172 && b2 >= 16 && b2 <= 31) || (a === 192 && b2 === 168) || (a === 100 && b2 >= 64 && b2 <= 127) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::") return true;
    if (v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb")) return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    return mapped ? isPrivateIp(mapped[1]) : false;
  }
  return true;
}

/** Blocks links to this computer or private networks, so a pasted URL cannot be used to probe local services. */
export async function assertSafeUrl(raw: string, lookup: (h: string) => Promise<string[]> = async (h) => (await dns.lookup(h, { all: true })).map((a) => a.address)): Promise<void> {
  const u = new URL(raw);
  if (u.protocol !== "https:") throw new SheetError("blocked", "Only https:// links are supported.");
  if (u.username || u.password) throw new SheetError("blocked", "Links with a username or password are not supported.");
  if (u.port && u.port !== "443") throw new SheetError("blocked", "That port is not allowed.");
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost")) throw new SheetError("blocked", "Links to this computer are not allowed.");
  const addrs = net.isIP(host) ? [host] : await lookup(host).catch(() => { throw new SheetError("fetch", "Could not reach that address."); });
  if (addrs.length === 0 || addrs.some(isPrivateIp)) throw new SheetError("blocked", "Links to private networks are not allowed.");
}

const MAX_BYTES = 5_000_000;

/** Downloads the sheet as text. Follows redirects by hand so every hop is checked. */
export async function fetchSheetText(csvUrl: string, opts: { fetchFn?: typeof fetch; lookup?: Parameters<typeof assertSafeUrl>[1] } = {}): Promise<string> {
  const f = opts.fetchFn ?? fetch;
  let url = csvUrl;
  for (let hop = 0; hop < 6; hop++) {
    await assertSafeUrl(url, opts.lookup);
    let res: Response;
    try {
      res = await f(url, { redirect: "manual", signal: AbortSignal.timeout(20_000), headers: { accept: "text/csv,text/plain;q=0.9,*/*;q=0.5" } });
    } catch {
      throw new SheetError("fetch", "Could not download the sheet. Check your internet connection and the link.");
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new SheetError("fetch", "The link redirected without a destination.");
      url = new URL(loc, url).toString();
      if (/accounts\.google\.com/.test(url)) throw new SheetError("private", "This sheet is private. In Google Sheets choose Share, then General access: Anyone with the link, role Viewer.");
      continue;
    }
    if (res.status === 401 || res.status === 403) throw new SheetError("private", "This sheet is private. In Google Sheets choose Share, then General access: Anyone with the link, role Viewer.");
    if (res.status === 404) throw new SheetError("fetch", "Sheet not found. Check the link.");
    if (!res.ok) throw new SheetError("fetch", `The sheet could not be downloaded (error ${res.status}).`);
    const type = res.headers.get("content-type") ?? "";
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) throw new SheetError("fetch", "The sheet is larger than 5 MB.");
    const text = new TextDecoder("utf-8").decode(buf).replace(/^﻿/, "");
    if (/text\/html/i.test(type) || /^\s*<(!doctype|html)/i.test(text)) throw new SheetError("private", "This sheet is private or is not a sheet link. Share it as Anyone with the link (Viewer), or publish it to the web as CSV.");
    return text;
  }
  throw new SheetError("fetch", "Too many redirects.");
}

// ---------------------------------------------------------------- columns and rows

export type ColumnMap = Partial<Record<FieldKey, number>>;

export function parseTable(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const delim = (first.match(/\t/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? "\t" : ",";
  return parseCsv(text, delim);
}

export function mapHeaders(headers: string[]): { map: ColumnMap; mapped: { field: FieldKey; header: string }[]; unmapped: string[] } {
  const map: ColumnMap = {};
  const mapped: { field: FieldKey; header: string }[] = [];
  const unmapped: string[] = [];
  headers.forEach((h, i) => {
    const k = fieldForLabel(h);
    if (k && map[k] === undefined) { map[k] = i; mapped.push({ field: k, header: h.trim() }); }
    else if (h.trim()) unmapped.push(h.trim());
  });
  return { map, mapped, unmapped };
}

export function rowToExtracted(row: string[], map: ColumnMap): Extracted {
  const out: Extracted = {};
  for (const k of ALL_FIELDS) {
    const idx = map[k];
    if (idx === undefined) continue;
    const cell = (row[idx] ?? "").trim();
    if (!cell) continue;
    if ((LIST_FIELDS as readonly string[]).includes(k)) (out as Record<string, unknown>)[k] = toPoints(cell);
    else (out as Record<string, unknown>)[k] = k === "notes" || k === "contact" ? cell : cell.replace(/\s+/g, " ");
  }
  // a LinkedIn link in the URL column is the profile, not the company website
  if (out.website && /linkedin\.com/i.test(out.website)) { out.linkedin ??= out.website; delete out.website; }
  if (out.linkedin) out.linkedin = out.linkedin.split("?")[0];
  return out;
}

// ---------------------------------------------------------------- connection + sync

export type SheetConnection = {
  url: string;
  csvUrl: string;
  connectedAt: string;
  lastSyncAt: string | null;
  total: number;
  matched: number;
  updated: number;
  unmatched: string[];
  columns: { field: FieldKey; header: string }[];
  unmappedHeaders: string[];
  matchedIds: number[];
};

const KEY = "sheet_connection";

export async function getConnection(b: DbBundle): Promise<SheetConnection | null> {
  const r = (await b.db.select().from(settings).where(eq(settings.key, KEY)).limit(1))[0];
  return (r?.value as SheetConnection | undefined) ?? null;
}
export async function saveConnection(b: DbBundle, c: SheetConnection) {
  await b.db.insert(settings).values({ key: KEY, value: c }).onConflictDoUpdate({ target: settings.key, set: { value: c } });
}
export async function deleteConnection(b: DbBundle) {
  await b.db.delete(settings).where(eq(settings.key, KEY));
}

/** Reads the sheet, maps its columns and writes every matching prospect. Safe to run repeatedly. */
export async function syncSheet(b: DbBundle, url: string, opts: { fetchFn?: typeof fetch; lookup?: Parameters<typeof assertSafeUrl>[1]; connectedAt?: string } = {}): Promise<SheetConnection> {
  const parsed = parseSheetUrl(url);
  const text = await fetchSheetText(parsed.csvUrl, opts);
  const table = parseTable(text).filter((r) => r.some((c) => c.trim()));
  if (table.length < 2) throw new SheetError("empty", "The sheet has no data rows. It needs a header row and at least one row of data.");
  const { map, mapped, unmapped } = mapHeaders(table[0]);
  const hasId = map.person !== undefined || map.linkedin !== undefined;
  const dataCols = mapped.filter((m) => m.field !== "person" && m.field !== "linkedin").length;
  if (!hasId || dataCols === 0) {
    throw new SheetError("columns", "No usable columns found. The first row needs a Name or LinkedIn column and at least one of: Designation, Company, Company Overview, Audit Findings, Recommendations, Notes, Website, Industry.");
  }

  const all = (await b.db.select().from(prospects)).filter((p) => !p.archivedAt);
  const bySlug = new Map<string, number>();
  const byName = new Map<string, number[]>();
  for (const p of all) {
    bySlug.set(p.providerUserId.toLowerCase(), p.id);
    const s = linkedinSlug(p.linkedinUrl);
    if (s) bySlug.set(s, p.id);
    const n = normName(p.fullName);
    if (n) byName.set(n, [...(byName.get(n) ?? []), p.id]);
  }

  let matched = 0, updated = 0;
  const unmatched: string[] = [];
  const matchedIds: number[] = [];
  for (const row of table.slice(1)) {
    const data = rowToExtracted(row, map);
    const slug = linkedinSlug(data.linkedin);
    let id = slug ? bySlug.get(slug) : undefined;
    if (id === undefined && data.person) {
      const ids = byName.get(normName(data.person));
      if (ids?.length === 1) id = ids[0];
    }
    if (id === undefined) { if (data.person || data.linkedin) unmatched.push(data.person ?? data.linkedin!); continue; }
    matched++;
    matchedIds.push(id);
    const { person: _p, ...rest } = data;
    void _p;
    if ((await applyAudit(b, id, rest, { source: "sheet", actor: "system" })).changed.length) updated++;
  }

  const conn: SheetConnection = {
    url: url.trim(),
    csvUrl: parsed.csvUrl,
    connectedAt: opts.connectedAt ?? new Date().toISOString(),
    lastSyncAt: new Date().toISOString(),
    total: table.length - 1,
    matched,
    updated,
    unmatched: unmatched.slice(0, 10),
    columns: mapped,
    unmappedHeaders: unmapped.slice(0, 12),
    matchedIds,
  };
  await saveConnection(b, conn);
  return conn;
}

export const fieldName = (f: FieldKey) => FIELD_LABEL[f];
