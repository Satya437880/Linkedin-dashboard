import { asc, isNull } from "drizzle-orm";
import { PasteAuditCard } from "@/components/PasteAuditCard";
import { Shell } from "@/components/Shell";
import { PageHeader } from "@/components/ui";
import { requireSession } from "@/server/auth/auth";
import { getDb } from "@/server/db/client";
import { prospects } from "@/server/db/schema";

export const dynamic = "force-dynamic";

const EXAMPLE = `Person: Matt Bertino
LinkedIn: https://www.linkedin.com/in/...
Designation: Director of US Operations
Company: ABC Company
Company Overview: Leading logistics solutions provider.
Audit Findings:
Homepage CTA is unclear.
Mobile menu is difficult to use.
Recommendations:
Improve CTA visibility.
Optimize mobile navigation.`;

export default async function PasteAuditPage({ searchParams }: { searchParams: Promise<{ prospect?: string }> }) {
  const s = await requireSession();
  const { prospect } = await searchParams;
  const list = await getDb().select({ id: prospects.id, name: prospects.fullName }).from(prospects).where(isNull(prospects.archivedAt)).orderBy(asc(prospects.fullName));
  const initial = list.find((p) => p.id === Number(prospect))?.id ?? null;

  return (
    <Shell>
      <PageHeader title="Paste Audit Details" description="Paste research or notes and the prospect's page is filled in for you." />
      <div className="grid grid-cols-4 gap-4 md:grid-cols-8 md:gap-6 lg:grid-cols-12">
        <div className="col-span-4 min-w-0 md:col-span-8 lg:col-span-7">
          <PasteAuditCard csrf={s.csrf} prospects={list} initialId={initial} />
        </div>
        <aside className="card col-span-4 h-fit p-4 md:col-span-8 md:p-6 lg:col-span-5">
          <h2 className="type-h4">What it picks up</h2>
          <ul className="type-body mt-3 list-disc space-y-1 pl-5">
            <li>Person, LinkedIn link, designation, company, website, industry</li>
            <li>Company overview and contact information</li>
            <li>Audit findings, recommendations, issues, pain points, requirements</li>
            <li>Notes. Anything that fits nowhere else is kept here.</li>
          </ul>
          <h3 className="type-caption mt-5 font-semibold text-slate-brand">Example</h3>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-xl bg-cream p-4 font-mono text-xs leading-relaxed">{EXAMPLE}</pre>
        </aside>
      </div>
    </Shell>
  );
}
