"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { verifyCsrf } from "@/server/auth/auth";
import { getBundle } from "@/server/db/client";
import { activities, companies, prospects } from "@/server/db/schema";

const clean = (v: FormDataEntryValue | null, max = 500) => String(v ?? "").trim().slice(0, max) || null;

/** Manual research details. Every save is written to the append-only audit log. */
export async function saveDetails(form: FormData) {
  await verifyCsrf(form);
  const id = Number(form.get("prospectId"));
  const b = getBundle();
  const p = (await b.db.select().from(prospects).where(eq(prospects.id, id)).limit(1))[0];
  if (!p) throw new Error("Prospect not found");

  const location = clean(form.get("location"));
  const website = clean(form.get("website"));
  const address = clean(form.get("address"), 300);
  const bullets = String(form.get("overview") ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 12);

  const changed: string[] = [];
  if (location !== p.location) {
    await b.db.update(prospects).set({ location }).where(eq(prospects.id, id));
    changed.push("location");
  }
  if (p.companyId) {
    const c = (await b.db.select().from(companies).where(eq(companies.id, p.companyId)).limit(1))[0];
    const prev = (c.aiOverview as { bullets?: string[] } | null)?.bullets ?? [];
    const overviewChanged = JSON.stringify(prev) !== JSON.stringify(bullets);
    if (website !== c.website) changed.push("website");
    if (address !== c.headquarters) changed.push("company address");
    if (overviewChanged) changed.push("company overview");
    if (changed.some((x) => x !== "location")) {
      await b.db
        .update(companies)
        .set({
          website,
          headquarters: address,
          ...(overviewChanged ? { aiOverview: { bullets, summary: bullets[0] ?? null, sources: [], manual: true }, enrichedAt: new Date() } : {}),
        })
        .where(eq(companies.id, c.id));
    }
  }
  if (changed.length) {
    await b.db.insert(activities).values({ prospectId: id, actor: "user", action: "Details updated", details: { fields: changed } });
  }
  revalidatePath(`/prospects/${id}`);
}
