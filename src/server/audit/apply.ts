import { eq, sql } from "drizzle-orm";
import type { DbBundle } from "../db/client";
import { activities, companies, prospectAudit, prospects } from "../db/schema";
import { enqueueJob } from "../ingest/ingestEvent";
import { FIELD_LABEL, type Extracted, type FieldKey } from "./extract";

export const normName = (s: string) => s.toLowerCase().split(",")[0].replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();

/** Loose match: same words in any order, or one name fully contained in the other ("Matt Bertino" and "Bertino Matt"). */
export function sameName(a: string, b: string): boolean {
  const x = normName(a), y = normName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const xt = x.split(" "), yt = y.split(" ");
  return xt.every((t) => yt.includes(t)) || yt.every((t) => xt.includes(t));
}

/** The profile id LinkedIn puts after /in/, without query strings. */
export function linkedinSlug(url: string | null | undefined): string | null {
  const m = /\/in\/([^/?#\s]+)/i.exec(url ?? "");
  return m ? m[1].toLowerCase() : null;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const nonEmpty = (v: unknown) => (Array.isArray(v) ? v.length > 0 : !!v);

export type ApplyResult = { changed: FieldKey[]; labels: string[]; counts: Partial<Record<FieldKey, number>> };

/**
 * Writes extracted details to the prospect, its company and its audit record. Idempotent: values that are
 * already stored are not rewritten, and only real changes reach the locked activity log.
 */
export async function applyAudit(
  base: DbBundle,
  prospectId: number,
  data: Extracted,
  opts: { source: "sheet" | "paste"; actor: "system" | "user"; rawText?: string },
): Promise<ApplyResult> {
  const changed: FieldKey[] = [];
  const counts: ApplyResult["counts"] = {};

  await base.db.transaction(async (tx) => {
    const b: DbBundle = { db: tx as unknown as DbBundle["db"] };
    const p = (await b.db.select().from(prospects).where(eq(prospects.id, prospectId)).limit(1))[0];
    if (!p) throw new Error("Prospect not found");

    // --- prospect fields ---
    const pUpdate: Partial<typeof prospects.$inferInsert> = {};
    if (data.designation && data.designation !== p.designation) { pUpdate.designation = data.designation; changed.push("designation"); }
    if (data.linkedin && !p.linkedinUrl) { pUpdate.linkedinUrl = data.linkedin.split("?")[0]; changed.push("linkedin"); }
    if (data.industry && data.industry !== p.industry) { pUpdate.industry = data.industry; changed.push("industry"); }
    if (data.location && data.location !== p.location) { pUpdate.location = data.location; changed.push("location"); }

    // --- company ---
    let companyId = p.companyId;
    if (data.company) {
      const ex = (await b.db.select().from(companies).where(sql`lower(${companies.name}) = lower(${data.company})`).limit(1))[0];
      const id = ex ? ex.id : (await b.db.insert(companies).values({ name: data.company }).returning({ id: companies.id }))[0].id;
      if (!ex) await enqueueJob(b, "enrich_company", { companyId: id });
      if (id !== p.companyId) { pUpdate.companyId = id; companyId = id; changed.push("company"); }
    }
    if (companyId && (data.website || data.address || nonEmpty(data.overview) || data.industry)) {
      const c = (await b.db.select().from(companies).where(eq(companies.id, companyId)).limit(1))[0];
      const cUpdate: Partial<typeof companies.$inferInsert> = {};
      if (data.website && data.website !== c.website) { cUpdate.website = data.website; changed.push("website"); }
      if (data.industry && data.industry !== c.industry) cUpdate.industry = data.industry;
      if (data.address && data.address !== c.headquarters) { cUpdate.headquarters = data.address; changed.push("address"); }
      if (nonEmpty(data.overview)) {
        const prev = (c.aiOverview as { bullets?: string[] } | null)?.bullets ?? [];
        if (!same(prev, data.overview)) {
          cUpdate.aiOverview = { bullets: data.overview, summary: data.overview![0] ?? null, sources: [opts.source], manual: true };
          cUpdate.enrichedAt = new Date();
          changed.push("overview");
        }
      }
      if (Object.keys(cUpdate).length) await b.db.update(companies).set(cUpdate).where(eq(companies.id, companyId));
    }
    if (Object.keys(pUpdate).length) await b.db.update(prospects).set(pUpdate).where(eq(prospects.id, prospectId));

    // --- audit record ---
    const cur = (await b.db.select().from(prospectAudit).where(eq(prospectAudit.prospectId, prospectId)).limit(1))[0];
    const aUpdate: Partial<typeof prospectAudit.$inferInsert> = {};
    const setText = (k: "contact" | "notes", col: "contactInfo" | "notes") => {
      const v = data[k];
      if (v && v !== (cur?.[col] ?? null)) { aUpdate[col] = v; changed.push(k); }
    };
    setText("contact", "contactInfo");
    setText("notes", "notes");
    const setList = (k: "findings" | "recommendations" | "issues" | "painPoints" | "requirements") => {
      const v = data[k];
      if (nonEmpty(v) && !same(v, cur?.[k] ?? null)) { aUpdate[k] = v as string[]; changed.push(k); }
    };
    (["findings", "recommendations", "issues", "painPoints", "requirements"] as const).forEach(setList);
    if (Object.keys(aUpdate).length) {
      aUpdate.source = opts.source;
      aUpdate.updatedAt = new Date();
      if (opts.rawText) aUpdate.rawText = opts.rawText.slice(0, 50_000);
      if (cur) await b.db.update(prospectAudit).set(aUpdate).where(eq(prospectAudit.id, cur.id));
      else await b.db.insert(prospectAudit).values({ prospectId, ...aUpdate });
    }

    for (const k of changed) {
      const v = data[k];
      if (Array.isArray(v)) counts[k] = v.length;
    }
    if (changed.length) {
      await b.db.insert(activities).values({
        prospectId,
        actor: opts.actor,
        action: opts.source === "sheet" ? "Audit details synced from sheet" : "Audit details pasted",
        details: { fields: changed.map((k) => FIELD_LABEL[k]) },
      });
    }
  });

  return { changed, labels: changed.map((k) => FIELD_LABEL[k]), counts };
}

export async function getAudit(b: DbBundle, prospectId: number) {
  return (await b.db.select().from(prospectAudit).where(eq(prospectAudit.prospectId, prospectId)).limit(1))[0] ?? null;
}

/** Finds which prospect pasted text is about: by LinkedIn profile first, then by an unambiguous name. */
export async function findProspectFor(b: DbBundle, data: { person?: string | null; linkedin?: string | null }): Promise<{ id: number; fullName: string } | { ambiguous: string[] } | null> {
  const all = (await b.db.select().from(prospects)).filter((p) => !p.archivedAt);
  const slug = linkedinSlug(data.linkedin);
  if (slug) {
    const hit = all.find((p) => p.providerUserId.toLowerCase() === slug || linkedinSlug(p.linkedinUrl) === slug);
    if (hit) return { id: hit.id, fullName: hit.fullName };
  }
  if (data.person) {
    const exact = all.filter((p) => normName(p.fullName) === normName(data.person!));
    const hits = exact.length ? exact : all.filter((p) => sameName(p.fullName, data.person!));
    if (hits.length === 1) return { id: hits[0].id, fullName: hits[0].fullName };
    if (hits.length > 1) return { ambiguous: hits.slice(0, 5).map((p) => p.fullName) };
  }
  return null;
}

/**
 * Adds a prospect from pasted research when nobody in the dashboard matches. Reuses an existing record when the
 * same LinkedIn profile is already there. Returns the prospect either way.
 */
export async function createProspectFrom(b: DbBundle, data: Extracted): Promise<{ id: number; fullName: string; created: boolean }> {
  const name = (data.person ?? "").trim();
  if (!name) throw new Error("No name to create a prospect from");
  const slug = linkedinSlug(data.linkedin);
  const providerUserId = slug ?? `audit:${normName(name).replace(/\s+/g, "-")}`;
  const existing = (await b.db.select().from(prospects).where(eq(prospects.providerUserId, providerUserId)).limit(1))[0];
  if (existing) return { id: existing.id, fullName: existing.fullName, created: false };

  const row = (await b.db
    .insert(prospects)
    .values({
      providerUserId,
      fullName: name,
      linkedinUrl: data.linkedin ? data.linkedin.split("?")[0] : null,
      designation: data.designation ?? null,
      location: data.location ?? null,
      industry: data.industry ?? null,
      owner: process.env.OWNER_NAME ?? "Maple MPSS Team",
    })
    .returning({ id: prospects.id }))[0];
  await b.db.insert(activities).values({ prospectId: row.id, actor: "user", action: "Prospect created from pasted details", details: { source: "paste" }, dedupeKey: `prospect:${row.id}` });
  return { id: row.id, fullName: name, created: true };
}
