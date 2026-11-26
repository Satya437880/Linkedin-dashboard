import { Shell } from "@/components/Shell";
import { SheetCard, type SheetView } from "@/components/SheetCard";
import { PageHeader } from "@/components/ui";
import { FIELD_LABEL, SYNONYMS, type FieldKey } from "@/server/audit/extract";
import { getConnection } from "@/server/audit/sheet";
import { requireSession } from "@/server/auth/auth";
import { getBundle } from "@/server/db/client";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const SHOWN: FieldKey[] = ["person", "linkedin", "designation", "company", "overview", "website", "industry", "contact", "findings", "recommendations", "issues", "painPoints", "requirements", "notes"];

export default async function ImportSheetPage() {
  const s = await requireSession();
  const conn = await getConnection(getBundle());
  const view: SheetView | null = conn
    ? {
        url: conn.url,
        connectedText: fmtDateTime(new Date(conn.connectedAt)),
        lastSyncText: conn.lastSyncAt ? fmtDateTime(new Date(conn.lastSyncAt)) : null,
        total: conn.total,
        matched: conn.matched,
        updated: conn.updated,
        unmatched: conn.unmatched,
        columns: conn.columns.map((c) => ({ label: FIELD_LABEL[c.field], header: c.header })),
        unmappedHeaders: conn.unmappedHeaders,
        thisPersonFound: null,
      }
    : null;

  return (
    <Shell>
      <PageHeader title="Auto Import" description="Connect a sheet once, then refresh it any time. Matching prospects are updated automatically." />
      <div className="grid grid-cols-4 gap-4 md:grid-cols-8 md:gap-6 lg:grid-cols-12">
        <div className="col-span-4 min-w-0 md:col-span-8 lg:col-span-7">
          <SheetCard csrf={s.csrf} conn={view} />
        </div>
        <aside className="card col-span-4 h-fit p-4 md:col-span-8 md:p-6 lg:col-span-5">
          <h2 className="type-h4">Column headers it understands</h2>
          <p className="type-caption mt-1 text-slate-brand">Put these in the first row. Spelling and capital letters do not matter.</p>
          <dl className="mt-4 divide-y divide-line">
            {SHOWN.map((k) => (
              <div key={k} className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-3 py-2.5">
                <dt className="type-caption font-semibold">{FIELD_LABEL[k]}</dt>
                <dd className="type-caption text-slate-brand">{SYNONYMS[k].slice(0, 3).join(", ")}</dd>
              </div>
            ))}
          </dl>
          <p className="type-caption mt-4 text-slate-brand">Each row is matched to a prospect by LinkedIn link first, then by name. Rows that match nobody are listed after a sync and nothing is created for them.</p>
        </aside>
      </div>
    </Shell>
  );
}
