import { eq, sql } from "drizzle-orm";
import type { DbBundle } from "../db/client";
import { activities, companies, prospects } from "../db/schema";
import { enqueueJob } from "./ingestEvent";

export function parseCsv(text: string, delim = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

const find = (head: string[], ...names: string[]) => head.findIndex((h) => names.some((n) => h.includes(n)));

export function slugFromUrl(url: string, name: string): string {
  const m = url.match(/\/in\/([^/?#]+)/i);
  return (m ? m[1] : name).toLowerCase().trim();
}

export async function importContactsCsv(base: DbBundle, text: string): Promise<{ created: number; skipped: number }> {
  const rows = parseCsv(text.replace(/^﻿/, ""));
  if (rows.length < 2) return { created: 0, skipped: 0 };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const iName = find(head, "name"), iUrl = find(head, "linkedin", "url"), iCo = find(head, "company", "organization"), iDes = find(head, "designation", "title", "position");
  if (iName < 0) throw new Error("CSV needs a name column");
  let created = 0, skipped = 0;
  await base.db.transaction(async (tx) => {
    const b: DbBundle = { db: tx as unknown as DbBundle["db"] };
    for (const r of rows.slice(1)) {
      const name = r[iName]?.trim();
      if (!name) continue;
      const url = iUrl >= 0 ? r[iUrl]?.trim() ?? "" : "";
      const pid = slugFromUrl(url, name);
      if ((await b.db.select().from(prospects).where(eq(prospects.providerUserId, pid)).limit(1)).length) { skipped++; continue; }
      const coName = iCo >= 0 ? r[iCo]?.trim() : "";
      let companyId: number | null = null;
      if (coName) {
        const ex = (await b.db.select().from(companies).where(sql`lower(${companies.name}) = lower(${coName})`).limit(1))[0];
        companyId = ex ? ex.id : (await b.db.insert(companies).values({ name: coName }).returning({ id: companies.id }))[0].id;
        if (!ex) await enqueueJob(b, "enrich_company", { companyId });
      }
      const p = (await b.db.insert(prospects).values({ providerUserId: pid, fullName: name, linkedinUrl: url || null, designation: iDes >= 0 ? r[iDes]?.trim() || null : null, companyId }).returning({ id: prospects.id }))[0];
      await b.db.insert(activities).values({ prospectId: p.id, actor: "system", action: "Imported from CSV", dedupeKey: `prospect:${p.id}` });
      created++;
    }
  });
  return { created, skipped };
}
