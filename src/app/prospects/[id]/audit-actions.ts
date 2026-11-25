"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { applyAudit, findProspectFor, sameName } from "@/server/audit/apply";
import { extractFromText, extractWithModel, isEmptyExtract, mergeExtracted, ALL_FIELDS, type Extracted } from "@/server/audit/extract";
import { SheetError, deleteConnection, getConnection, parseSheetUrl, saveConnection, syncSheet } from "@/server/audit/sheet";
import { verifyCsrf } from "@/server/auth/auth";
import { getBundle } from "@/server/db/client";
import { prospects } from "@/server/db/schema";

export type SheetState = { ok?: boolean; error?: string; message?: string };

export async function sheetAction(_prev: SheetState, form: FormData): Promise<SheetState> {
  await verifyCsrf(form);
  const intent = String(form.get("intent") ?? "");
  const url = String(form.get("url") ?? "").trim();
  const b = getBundle();
  const done = (s: SheetState) => { revalidatePath("/", "layout"); return s; };

  try {
    if (intent === "delete") {
      deleteConnection(b);
      return done({ ok: true, message: "Sheet link deleted. Details already imported stay on the prospects." });
    }
    if (intent === "refresh") {
      const conn = getConnection(b);
      if (!conn) return { error: "No sheet is connected." };
      const c = await syncSheet(b, conn.url, { connectedAt: conn.connectedAt });
      return done({ ok: true, message: `Refreshed. ${c.matched} of ${c.total} rows matched a prospect, ${c.updated} updated.` });
    }
    if (!url) return { error: "Paste the sheet link first." };
    if (intent === "save") {
      const p = parseSheetUrl(url); // validates the link without reading it
      const prev = getConnection(b);
      saveConnection(b, {
        url, csvUrl: p.csvUrl, connectedAt: prev?.connectedAt ?? new Date().toISOString(), lastSyncAt: null,
        total: 0, matched: 0, updated: 0, unmatched: [], columns: [], unmappedHeaders: [], matchedIds: [],
      });
      return done({ ok: true, message: "Link saved. Press Connect or Refresh data to read it." });
    }
    // connect: validate access, read, map columns and populate in one step
    const c = await syncSheet(b, url);
    return done({ ok: true, message: `Connected. ${c.total} records found, ${c.matched} matched a prospect, ${c.updated} updated.` });
  } catch (e) {
    if (e instanceof SheetError) return { error: e.message };
    console.error("sheet action failed", e);
    return { error: "Something went wrong while reading the sheet. Try again." };
  }
}

export type PasteAuditState = {
  ok?: boolean;
  error?: string;
  message?: string;
  populated?: string[];
  engine?: string;
  mismatch?: { found: string; expected: string };
  target?: { id: number; name: string };
};

async function modelStatus() {
  const url = process.env.OLLAMA_URL ?? "http://localhost:11434";
  const model = process.env.OLLAMA_MODEL ?? "qwen2.5:7b-instruct";
  try {
    const r = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(1200), cache: "no-store" });
    const j = (await r.json()) as { models?: { name: string }[] };
    return (j.models ?? []).some((m) => m.name === model || m.name.startsWith(`${model}:`)) ? { url, model } : null;
  } catch {
    return null;
  }
}

export async function analyzeAction(_prev: PasteAuditState, form: FormData): Promise<PasteAuditState> {
  await verifyCsrf(form);
  const chosen = String(form.get("prospectId") ?? "auto");
  const text = String(form.get("text") ?? "").trim();
  const confirm = form.get("confirm") === "1";
  if (!text) return { error: "Paste some details first." };
  if (text.length > 50_000) return { error: "That text is longer than 50,000 characters. Paste a shorter section." };

  const b = getBundle();
  let data: Extracted = extractFromText(text);
  let engine = "rules";
  // The local model only fills fields the rules could not find, and only when it is installed.
  const filled = ALL_FIELDS.filter((k) => (Array.isArray(data[k]) ? (data[k] as string[]).length : !!data[k])).length;
  if (filled < 4) {
    const m = await modelStatus();
    if (m) {
      const ai = await extractWithModel(text, data, m);
      if (ai) { data = mergeExtracted(data, ai.data); engine = ai.engine; }
    }
  }
  if (isEmptyExtract(data)) return { error: "No details were found in this text. Add labels such as Designation:, Company: or Audit Findings:, or paste more of the research." };

  // Who is this about? A chosen prospect wins; otherwise detect from Person / LinkedIn in the text.
  let target: { id: number; fullName: string };
  if (chosen !== "auto") {
    const p = b.db.select().from(prospects).where(eq(prospects.id, Number(chosen))).get();
    if (!p) return { error: "That prospect was not found. Choose another." };
    target = { id: p.id, fullName: p.fullName };
    if (data.person && !sameName(data.person, p.fullName) && !confirm) {
      return { mismatch: { found: data.person, expected: p.fullName } };
    }
  } else {
    const found = findProspectFor(b, data);
    if (!found) return { error: "Could not tell which prospect this is. Include Person: or LinkedIn: in the text, or choose a prospect above." };
    if ("ambiguous" in found) return { error: `More than one prospect matches (${found.ambiguous.join(", ")}). Choose the right one above.` };
    target = found;
  }

  const { person: _person, ...rest } = data;
  void _person;
  const res = applyAudit(b, target.id, rest, { source: "paste", actor: "user", rawText: text });
  revalidatePath("/", "layout");
  const who = { id: target.id, name: target.fullName };
  if (res.changed.length === 0) return { ok: true, message: `Nothing new for ${target.fullName}. Everything in this text is already saved.`, populated: [], engine, target: who };
  return { ok: true, message: `Populated ${res.labels.length} ${res.labels.length === 1 ? "field" : "fields"} for ${target.fullName}.`, populated: res.labels, engine, target: who };
}
