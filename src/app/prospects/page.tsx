import Link from "next/link";
import { and, desc, eq, ilike, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { Shell } from "@/components/Shell";
import { IconExternal, IconSearch } from "@/components/Icons";
import { FlowPill, SentimentPill, StatusPill, statusOf, workflowStatus } from "@/components/Pills";
import { EmptyState, PageHeader } from "@/components/ui";
import { isConnectNote } from "@/lib/clean";
import { relTime } from "@/lib/format";
import { getDb } from "@/server/db/client";
import { companies, messages, prospects } from "@/server/db/schema";

export const dynamic = "force-dynamic";
const PAGE = 25;

const FILTERS = [
  { key: "all", label: "All" },
  { key: "hot", label: "Hot lead" },
  { key: "warm", label: "Positive" },
  { key: "follow_up", label: "Follow up" },
  { key: "not_now", label: "Not at this time" },
  { key: "cold", label: "Cold" },
  { key: "negative", label: "Negative" },
] as const;

type Row = { p: typeof prospects.$inferSelect; company: string | null };
const matches = (key: string, r: Row) => key === "all" || statusOf(r.p) === key;

export default async function ProspectsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; status?: string }> }) {
  const { q = "", page = "1", status = "all" } = await searchParams;
  const active = FILTERS.some((f) => f.key === status) ? status : "all";
  const p = Math.max(1, Number(page) || 1);
  const term = `%${q}%`;
  const db = getDb();
  const all: Row[] = await db
    .select({ p: prospects, company: companies.name })
    .from(prospects)
    .leftJoin(companies, eq(prospects.companyId, companies.id))
    .where(and(isNull(prospects.archivedAt), isNotNull(prospects.lastInboundAt), q ? or(ilike(prospects.fullName, term), ilike(prospects.designation, term), ilike(companies.name, term), ilike(prospects.industry, term)) : undefined))
    .orderBy(desc(sql`coalesce(${prospects.lastInboundAt}, ${prospects.lastActivityAt}, ${prospects.createdAt})`));

  const counts = Object.fromEntries(FILTERS.map((f) => [f.key, all.filter((r) => matches(f.key, r)).length]));
  const filtered = all.filter((r) => matches(active, r));
  const start = (p - 1) * PAGE;
  const rows = filtered.slice(start, start + PAGE);

  // Latest message each way, per row.
  const ids = rows.map(({ p: r }) => r.id);
  const latest = new Map<string, string>();
  if (ids.length) {
    const recent = await db
      .select({ prospectId: messages.prospectId, direction: messages.direction, text: messages.text })
      .from(messages)
      .where(and(inArray(messages.prospectId, ids), isNull(messages.duplicateOf)))
      .orderBy(desc(messages.sentAt));
    for (const m of recent) {
      if (isConnectNote(m.text)) continue;
      const k = `${m.prospectId}:${m.direction}`;
      if (!latest.has(k)) latest.set(k, m.text);
    }
  }
  const extra = new Map(ids.map((id) => [id, { reply: latest.get(`${id}:inbound`) ?? null, ours: latest.get(`${id}:outbound`) ?? null }] as const));

  const href = (s: string, pg = 1) =>
    `/prospects?${new URLSearchParams({ ...(q ? { q } : {}), ...(s !== "all" ? { status: s } : {}), ...(pg > 1 ? { page: String(pg) } : {}) })}`;
  const th = "whitespace-nowrap px-1.5 py-3 text-left text-sm font-semibold text-slate-brand";
  const td = "h-16 px-1.5 py-3 align-top text-sm"; // h-16 fits two lines, so every row is the same height
  const hasPrev = p > 1;
  const hasNext = filtered.length > p * PAGE;

  return (
    <Shell wide>
      <PageHeader title="Prospects" description={`${all.length} ${all.length === 1 ? "person" : "people"}${q ? ` matching "${q}"` : ""}`} />

      {/* Search + filters */}
      <section aria-label="Search and filters" className="mb-6 flex flex-col gap-4">
        <form role="search" className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <label htmlFor="q" className="sr-only">Search prospects by name, company, designation or industry</label>
            <IconSearch className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-brand" />
            <input id="q" name="q" defaultValue={q} placeholder="Search prospects" className="input pl-12" />
          </div>
          {active !== "all" && <input type="hidden" name="status" value={active} />}
          <button className="btn btn-primary sm:w-auto">Search</button>
          {(q || active !== "all") && <Link href="/prospects" className="btn btn-secondary">Reset</Link>}
        </form>
        <nav aria-label="Filter by category" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
          {FILTERS.map((f) => (
            <Link key={f.key} href={href(f.key)} aria-current={active === f.key ? "page" : undefined} className="chip">
              {f.label} <span className="chip-count">{counts[f.key]}</span>
            </Link>
          ))}
        </nav>
      </section>

      {rows.length === 0 ? (
        <div className="card">
          <EmptyState
            title={all.length === 0 ? "No replies yet" : "No prospects match"}
            body={all.length === 0 ? "Open a LinkedIn conversation with the extension on, paste a reply, or import your CSV sheet." : "Try a different filter or clear the search."}
            action={all.length === 0
              ? <Link href="/paste" className="btn btn-primary">Paste a reply</Link>
              : <Link href="/prospects" className="btn btn-secondary">Reset filters</Link>}
          />
        </div>
      ) : (
        <>
          {/* Desktop: full table */}
          <div className="card hidden overflow-hidden xl:block">
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Prospects table">
              <table className="w-full table-auto border-collapse">
                <caption className="sr-only">Prospects</caption>
                <thead className="border-b border-line bg-cream/60">
                  <tr>
                    <th scope="col" className={th}>Sl no</th>
                    <th scope="col" className={th}>Client name</th>
                    <th scope="col" className={th}>LinkedIn</th>
                    <th scope="col" className={th}>Maple MPSS</th>
                    <th scope="col" className={th}>Client message</th>
                    <th scope="col" className={th}>Category</th>
                    <th scope="col" className={th}>Company</th>
                    <th scope="col" className={th}>Designation</th>
                    <th scope="col" className={th}>Status</th>
                    <th scope="col" className={th}>Last reply</th>
                    <th scope="col" className={th}>Sentiment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map(({ p: r, company }, i) => {
                    const x = extra.get(r.id)!;
                    return (
                      <tr key={r.id} className="hover:bg-cream/50">
                        <td className={`${td} tabular-nums text-slate-brand`}>{start + i + 1}</td>
                        <td className={td}><Link href={`/prospects/${r.id}`} title={r.fullName} className="block max-w-[6.75rem] truncate 2xl:max-w-[14rem] font-semibold text-wine underline-offset-2 hover:underline">{r.fullName}</Link></td>
                        <td className={td}>
                          {r.linkedinUrl ? <a href={r.linkedinUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-wine underline-offset-2 hover:underline">Profile<IconExternal className="h-4 w-4" /><span className="sr-only"> (opens LinkedIn)</span></a> : "-"}
                        </td>
                        <td className={`${td} max-w-[12rem]`}>
                          {x.ours ? <span className="line-clamp-2" title={x.ours}>{x.ours}</span> : <span className="text-slate-brand">Not captured</span>}
                        </td>
                        <td className={`${td} max-w-[12rem]`}>
                          {x.reply ? <span className="line-clamp-2" title={x.reply}>{x.reply}</span> : <span className="text-slate-brand">No reply yet</span>}
                        </td>
                        <td className={td}><StatusPill status={r.category} /></td>
                        <td className={`${td} max-w-[10rem]`}><span className="line-clamp-2" title={company ?? undefined}>{company ?? "-"}</span></td>
                        <td className={`${td} max-w-[12rem]`}><span className="line-clamp-2" title={r.designation ?? undefined}>{r.designation ?? "-"}</span></td>
                        <td className={td}><FlowPill flow={workflowStatus(r)} /></td>
                        <td className={`${td} whitespace-nowrap`}>{relTime(r.lastInboundAt)}</td>
                        <td className={td}>{r.sentiment ? <SentimentPill sentiment={r.sentiment} /> : "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Phone and tablet: one card per person */}
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:hidden">
            {rows.map(({ p: r, company }, i) => {
              const x = extra.get(r.id)!;
              return (
                <li key={r.id} className="card flex flex-col gap-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="type-caption text-slate-brand">#{start + i + 1}</p>
                      <Link href={`/prospects/${r.id}`} className="type-body block break-words font-semibold text-wine underline-offset-2 hover:underline">{r.fullName}</Link>
                    </div>
                    <StatusPill status={r.category} />
                  </div>
                  <p className="type-caption text-slate-brand">{[r.designation, company].filter(Boolean).join(" at ") || "No role or company yet"}</p>
                  <div className="type-caption flex flex-col gap-2">
                    <p className="line-clamp-3"><span className="font-semibold text-slate-brand">Maple MPSS: </span>{x.ours ?? <span className="text-slate-brand">Not captured</span>}</p>
                    <p className="line-clamp-3"><span className="font-semibold text-slate-brand">{r.fullName.split(" ")[0]}: </span>{x.reply ?? <span className="text-slate-brand">No reply yet</span>}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <FlowPill flow={workflowStatus(r)} />
                    {r.sentiment && <SentimentPill sentiment={r.sentiment} />}
                    <span className="type-caption ml-auto text-slate-brand">{relTime(r.lastInboundAt)}</span>
                  </div>
                  {r.linkedinUrl && (
                    <a href={r.linkedinUrl} target="_blank" rel="noreferrer" className="type-caption inline-flex items-center gap-1 font-medium text-wine underline-offset-2 hover:underline">
                      LinkedIn profile <IconExternal className="h-4 w-4" /><span className="sr-only">(opens LinkedIn)</span>
                    </a>
                  )}
                </li>
              );
            })}
          </ul>

          <nav aria-label="Pagination" className="mt-6 flex items-center justify-between gap-4">
            <p className="type-caption text-slate-brand">Showing {start + 1}-{Math.min(start + PAGE, filtered.length)} of {filtered.length}</p>
            <div className="flex gap-3">
              {hasPrev ? <Link href={href(active, p - 1)} className="btn btn-secondary btn-sm">Previous</Link> : <span className="btn btn-secondary btn-sm" aria-disabled="true">Previous</span>}
              {hasNext ? <Link href={href(active, p + 1)} className="btn btn-secondary btn-sm">Next</Link> : <span className="btn btn-secondary btn-sm" aria-disabled="true">Next</span>}
            </div>
          </nav>
        </>
      )}
    </Shell>
  );
}
