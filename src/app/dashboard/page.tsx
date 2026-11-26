import Link from "next/link";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { Shell } from "@/components/Shell";
import { StatusPill, statusOf } from "@/components/Pills";
import { EmptyState, PageHeader } from "@/components/ui";
import { fmtDateTime, relTime, startOfDay } from "@/lib/format";
import { getDb } from "@/server/db/client";
import { messages, prospects } from "@/server/db/schema";

export const dynamic = "force-dynamic";

const RANGES = [
  { key: "7", label: "Last 7 days", days: 7 },
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "90", label: "Last 90 days", days: 90 },
  { key: "all", label: "All time", days: 0 },
] as const;

function Kpi({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="card col-span-2 flex min-w-0 flex-col p-4 md:p-6 lg:col-span-3">
      <p className="type-caption font-semibold text-slate-brand">{label}</p>
      <p className="type-h3 mt-2">{value}</p>
      {note && <p className="type-caption mt-1 text-slate-brand">{note}</p>}
    </div>
  );
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max ? Math.max(value ? 3 : 0, Math.round((value / max) * 100)) : 0;
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)_2rem] items-center gap-3 py-2 sm:grid-cols-[9rem_minmax(0,1fr)_2.5rem]">
      <span className="type-caption truncate text-ink">{label}</span>
      <div className="h-3 overflow-hidden rounded-full bg-cream" role="img" aria-label={`${label}: ${value}`}>
        <div className="h-3 rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="type-caption text-right font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function Panel({ title, sub, className = "", children }: { title: string; sub?: string; className?: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className={`card min-w-0 p-4 md:p-6 ${className}`}>
      <h2 className="type-h4">{title}</h2>
      {sub && <p className="type-caption mb-2 mt-0.5 text-slate-brand">{sub}</p>}
      <div className={sub ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const { range = "30", from, to } = await searchParams;
  const fromDay = startOfDay(from);
  const toDay = startOfDay(to);
  const custom = !!(fromDay || toDay);
  const r = RANGES.find((x) => x.key === range) ?? RANGES[1];
  const since = custom ? fromDay : r.days ? new Date(Date.now() - r.days * 86_400_000) : null;
  const until = custom && toDay ? new Date(toDay.getTime() + 86_400_000 - 1) : null; // end of the chosen day
  const label = custom ? `${from || "start"} to ${to || "today"}` : r.label;
  const db = getDb();

  const everyone = await db.select().from(prospects).where(isNull(prospects.archivedAt));
  // The dashboard shows only people who have replied; everyone is still counted for the response rate.
  const all = everyone.filter((p) => p.lastInboundAt);
  const inRange = (d: Date | null) => !!d && (!since || d >= since) && (!until || d <= until);

  const contacted = everyone.filter((p) => p.lastOutboundAt || p.lastInboundAt).length;
  const replied = all.filter((p) => inRange(p.lastInboundAt));
  const hot = replied.filter((p) => p.category === "hot");
  const meetings = all.filter((p) => p.stage === "meeting_scheduled").length;
  const opportunities = all.filter((p) => p.stage === "opportunity").length;
  const won = all.filter((p) => p.stage === "won").length;
  const everReplied = all.filter((p) => p.lastInboundAt).length;
  const rate = contacted ? Math.round((everReplied / contacted) * 100) : 0;
  const due = all.filter((p) => statusOf(p) === "follow_up" && !p.doNotContact);

  const cats = [
    { label: "Hot lead", key: "hot", color: "#6B2737" },
    { label: "Positive", key: "warm", color: "#D3A69F" },
    { label: "Cold", key: "cold", color: "#B9C0C2" },
    { label: "Not at this time", key: "not_now", color: "#687073" },
    { label: "Negative", key: "negative", color: "#111827" },
  ].map((c) => ({ ...c, n: replied.filter((p) => p.category === c.key).length }));
  const catMax = Math.max(1, ...cats.map((c) => c.n));

  const funnel = [
    { label: "Contacted", n: contacted },
    { label: "Replied", n: everReplied },
    { label: "Hot leads", n: all.filter((p) => p.category === "hot").length },
    { label: "Meetings", n: meetings },
    { label: "Opportunities", n: opportunities },
    { label: "Customers", n: won },
  ];
  const fMax = Math.max(1, ...funnel.map((f) => f.n));

  // Latest reply per person in the chosen range, grouped: Positive, Hot lead, Not at this time, Cold (then the rest).
  const ORDER = ["warm", "hot", "not_now", "cold", "negative", "unclassified"] as const;
  const PER_GROUP = 5;
  const ids = replied.map((p) => p.id);
  const latestByProspect = new Map<number, typeof messages.$inferSelect>();
  if (ids.length) {
    for (const m of await db.select().from(messages).where(and(eq(messages.direction, "inbound"), isNull(messages.duplicateOf), inArray(messages.prospectId, ids))).orderBy(desc(messages.sentAt))) {
      if (!latestByProspect.has(m.prospectId)) latestByProspect.set(m.prospectId, m);
    }
  }
  const groups = ORDER.map((cat) => {
    const people = replied
      .filter((p) => p.category === cat && latestByProspect.has(p.id))
      .sort((x, y) => latestByProspect.get(y.id)!.sentAt.getTime() - latestByProspect.get(x.id)!.sentAt.getTime());
    return { cat, people };
  }).filter((g) => g.people.length > 0);

  return (
    <Shell>
      <PageHeader title="Dashboard" description={<>Showing <strong className="font-semibold text-ink">{label}</strong></>} />

      {/* Date range: quick ranges on the first row, custom range on the second */}
      <section aria-label="Date range" className="card mb-6 flex flex-col gap-4 p-4 md:mb-8 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between lg:gap-x-6 lg:gap-y-4">
        <nav aria-label="Quick date range" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:overflow-visible lg:px-0 lg:pb-0">
          {RANGES.map((x) => (
            <Link key={x.key} href={`/dashboard?range=${x.key}`} aria-current={!custom && r.key === x.key ? "page" : undefined} className="chip">
              {x.label}
            </Link>
          ))}
        </nav>
        <form method="get" action="/dashboard" aria-label="Custom date range" className="flex flex-wrap items-end gap-3">
          <div className="field min-w-0 flex-1 basis-[8rem] gap-1 sm:flex-none sm:basis-auto">
            <label htmlFor="from" className="field-label">From</label>
            <input id="from" type="date" name="from" defaultValue={from ?? ""} max={to || undefined} className="input input-sm sm:w-40" />
          </div>
          <div className="field min-w-0 flex-1 basis-[8rem] gap-1 sm:flex-none sm:basis-auto">
            <label htmlFor="to" className="field-label">To</label>
            <input id="to" type="date" name="to" defaultValue={to ?? ""} min={from || undefined} className="input input-sm sm:w-40" />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary btn-sm">Apply range</button>
            <Link href="/dashboard" className="btn btn-secondary btn-sm">Reset</Link>
          </div>
        </form>
      </section>

      <div className="grid grid-cols-4 gap-4 md:grid-cols-8 md:gap-6 lg:grid-cols-12">
        <Kpi label="Prospects" value={all.length} note="People who have replied" />
        <Kpi label="Replies" value={replied.length} note={label} />
        <Kpi label="Response rate" value={`${rate}%`} note={`${everReplied} of ${contacted} people.`} />
        <Kpi label="Hot leads" value={hot.length} note={label} />
        <Kpi label="Follow-ups due" value={due.length} />
        <Kpi label="Meetings booked" value={meetings} note="Set by stage" />
        <Kpi label="Opportunities" value={opportunities} />
        <Kpi label="Closed deals" value={won} />

        <Panel title="Funnel" className="col-span-4 md:col-span-8 lg:col-span-6">
          {funnel.map((f) => <Bar key={f.label} label={f.label} value={f.n} max={fMax} color="#6B2737" />)}
          <p className="type-caption mt-3 text-slate-brand">Connections sent and accepted appear here once invitation capture is added.</p>
        </Panel>

        <Panel title="Replies by category" sub={label} className="col-span-4 md:col-span-8 lg:col-span-6">
          {cats.map((c) => <Bar key={c.key} label={c.label} value={c.n} max={catMax} color={c.color} />)}
        </Panel>

        <Panel title="Follow-ups due" className="col-span-4 md:col-span-8 lg:col-span-5">
          {due.length === 0 ? (
            <p className="type-body py-2 text-slate-brand">Nothing due right now.</p>
          ) : (
            <ul className="divide-y divide-line">
              {due.slice(0, 8).map((p) => (
                <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
                  <Link href={`/prospects/${p.id}`} className="type-body font-medium text-wine underline-offset-2 hover:underline">{p.fullName}</Link>
                  <span className="type-caption text-slate-brand">due {p.nextFollowUpAt ? fmtDateTime(p.nextFollowUpAt) : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Recent replies" sub={label} className="col-span-4 md:col-span-8 lg:col-span-7">
          {groups.length === 0 ? (
            <EmptyState title="No replies in this range" body="Try a wider date range, or open a LinkedIn conversation so the extension can capture it." />
          ) : (
            <div className="space-y-6">
              {groups.map((g) => (
                <div key={g.cat}>
                  <div className="mb-2 flex items-center gap-3">
                    <StatusPill status={g.cat} />
                    <span className="type-caption text-slate-brand">{g.people.length}</span>
                    {g.people.length > PER_GROUP && g.cat !== "unclassified" && (
                      <Link href={`/prospects?status=${g.cat}`} className="type-caption ml-auto font-medium text-wine underline-offset-2 hover:underline">See all {g.people.length}</Link>
                    )}
                  </div>
                  <ul className="divide-y divide-line">
                    {g.people.slice(0, PER_GROUP).map((p) => {
                      const m = latestByProspect.get(p.id)!;
                      return (
                        <li key={p.id} className="py-3">
                          <div className="flex items-baseline justify-between gap-3">
                            <Link href={`/prospects/${p.id}`} className="type-body min-w-0 truncate font-medium text-wine underline-offset-2 hover:underline">{p.fullName}</Link>
                            <span className="type-caption shrink-0 text-slate-brand">{relTime(m.sentAt)}</span>
                          </div>
                          <p className="type-caption mt-1 line-clamp-2 text-ink/80">{m.text}</p>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </Shell>
  );
}
