/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { AuditDetails } from "@/components/AuditDetails";
import { getAudit } from "@/server/audit/apply";
import { DraftCard } from "@/components/DraftCard";
import { IconExternal, IconLock } from "@/components/Icons";
import { LinkedInThread } from "@/components/LinkedInThread";
import { getSession } from "@/server/auth/auth";
import { FlowPill, SentimentPill, StatusPill, statusOf, workflowStatus } from "@/components/Pills";
import { Shell } from "@/components/Shell";
import { StageBar } from "@/components/StageBar";
import { fmtDate, fmtTime } from "@/lib/format";
import { latestInsight } from "@/server/ai/analyze";
import type { Intent, NextAction } from "@/server/ai/rules";
import { getBundle } from "@/server/db/client";
import { activities, alerts, companies, conversations, messages, prospects, prospectTags, tags } from "@/server/db/schema";

export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, string> = {
  send_capability_deck: "Send capability deck",
  schedule_meeting: "Schedule a meeting",
  share_quotation: "Share a quotation",
  follow_up_in_days: "Follow up later",
  answer_question: "Answer their question",
  no_action: "No action needed",
};

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 first:mt-0">
      <h3 className="type-caption font-semibold text-slate-brand">{label}</h3>
      <div className="type-body mt-1">{children}</div>
    </div>
  );
}

export default async function ProspectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab } = await searchParams;
  const b = getBundle();
  const db = b.db;
  const p = (await db.select().from(prospects).where(eq(prospects.id, Number(id))).limit(1))[0];
  if (!p) notFound();

  await db.update(alerts).set({ readAt: new Date() }).where(and(eq(alerts.prospectId, p.id), isNull(alerts.readAt)));

  const company = p.companyId ? (await db.select().from(companies).where(eq(companies.id, p.companyId)).limit(1))[0] : null;
  const msgs = await db.select().from(messages).where(and(eq(messages.prospectId, p.id), isNull(messages.duplicateOf))).orderBy(asc(messages.sentAt));
  const conv = (await db.select().from(conversations).where(eq(conversations.prospectId, p.id)).limit(1))[0];
  const ptags = await db.select({ name: tags.name }).from(prospectTags).innerJoin(tags, eq(prospectTags.tagId, tags.id)).where(eq(prospectTags.prospectId, p.id));
  const log = tab === "audit" ? await db.select().from(activities).where(eq(activities.prospectId, p.id)).orderBy(desc(activities.occurredAt), desc(activities.id)) : [];

  const csrf = (await getSession())?.csrf ?? "";
  const audit = tab === "audit" ? await getAudit(b, p.id) : null;
  const lastInbound = [...msgs].reverse().find((m) => m.direction === "inbound") ?? null;
  const intent = await latestInsight<Intent>(b, p.id, "intent");
  const summary = await latestInsight<{ text: string }>(b, p.id, "summary");
  const next = await latestInsight<NextAction>(b, p.id, "next_action");
  const reply = await latestInsight<{ text: string }>(b, p.id, "suggested_reply");
  const followUp = await latestInsight<{ text: string; followUp: number }>(b, p.id, "follow_up_draft");
  const status = statusOf(p);
  const showFollowUp = status === "follow_up" && followUp;
  const draft = showFollowUp ? followUp : reply;
  const hasIntent = intent && intent.output.confidence > 0;
  const rulesTag = [intent, next].some((i) => i?.engine === "rules");
  const tabCls = (on: boolean) =>
    `inline-flex h-12 items-center border-b-2 px-4 text-base font-medium ${on ? "border-wine font-semibold text-wine" : "border-transparent text-slate-brand hover:text-ink"}`;

  return (
    <Shell>
      <Link href="/prospects" className="type-caption mb-4 inline-flex items-center gap-1 font-medium text-wine underline-offset-2 hover:underline">
        <span aria-hidden="true">&larr;</span> All prospects
      </Link>

      {/* Profile header */}
      <section aria-label="Profile" className="card mb-6 flex flex-col gap-4 p-4 md:flex-row md:items-center md:gap-6 md:p-6">
        {p.photoUrl ? <img src={p.photoUrl} alt="" className="h-16 w-16 shrink-0 rounded-full" /> : (
          <span aria-hidden="true" className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-rose/50 text-2xl font-semibold text-wine-deep">{p.fullName.slice(0, 1)}</span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="type-h3 break-words">{p.fullName}</h1>
          <p className="type-body mt-1 text-slate-brand">
            {[p.designation ?? p.headline, company?.name].filter(Boolean).join(" at ") || "No role or company yet"}
            {p.location ? ` · ${p.location}` : ""}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusPill status={p.category} />
            <FlowPill flow={workflowStatus(p)} />
            {p.sentiment && <SentimentPill sentiment={p.sentiment} />}
            <span className="type-caption font-semibold text-slate-brand">Lead score {p.leadScore}</span>
          </div>
          {p.doNotContact && <p role="alert" className="alert alert-error mt-3">Do not contact. Replies and follow-ups are disabled for this person.</p>}
        </div>
        {p.linkedinUrl && (
          <a href={p.linkedinUrl} target="_blank" rel="noreferrer" className="btn btn-secondary shrink-0">
            LinkedIn profile <IconExternal /><span className="sr-only">(opens LinkedIn)</span>
          </a>
        )}
      </section>

      <div className="grid grid-cols-4 gap-6 md:grid-cols-8 lg:grid-cols-12">
        {/* Conversation / Audit */}
        <section aria-label="Conversation" className="card col-span-4 min-w-0 md:col-span-8 lg:col-span-7">
          <nav aria-label="Conversation views" className="flex gap-2 border-b border-line px-2 md:px-4">
            <Link href={`/prospects/${p.id}`} aria-current={!tab ? "page" : undefined} className={tabCls(!tab)}>Conversation</Link>
            <Link href={`/prospects/${p.id}?tab=audit`} aria-current={tab === "audit" ? "page" : undefined} className={tabCls(tab === "audit")}>Audit</Link>
          </nav>
          <div className="p-4 md:p-6">
            {tab === "audit" ? (
              <div>
                <div className="mb-6 flex flex-col gap-3 rounded-2xl bg-rose/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="type-body text-wine-deep">Fill this page automatically instead of typing.</p>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/paste-audit?prospect=${p.id}`} className="btn btn-primary btn-sm">Paste Audit Details</Link>
                    <Link href="/import-sheet" className="btn btn-secondary btn-sm">Import from Sheet</Link>
                  </div>
                </div>
                <AuditDetails
                  csrf={csrf}
                  prospect={p}
                  audit={audit}
                  company={company ? { name: company.name, website: company.website, headquarters: company.headquarters, industry: company.industry, aiOverview: company.aiOverview } : null}
                  lastReply={lastInbound ? { text: lastInbound.text, sentAt: lastInbound.sentAt } : null}
                />
                <h2 className="type-h4 mb-3 mt-8">Activity log</h2>
                <div className="overflow-x-auto rounded-xl border border-line" tabIndex={0} role="region" aria-label="Activity log table">
                  <table className="w-full min-w-[26rem] text-left text-sm">
                    <thead className="bg-cream/60 text-slate-brand">
                      <tr><th scope="col" className="px-4 py-3 font-semibold">Date</th><th scope="col" className="px-4 py-3 font-semibold">Time</th><th scope="col" className="px-4 py-3 font-semibold">Action</th><th scope="col" className="px-4 py-3 font-semibold">By</th></tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {log.map((a) => (
                        <tr key={a.id}>
                          <td className="whitespace-nowrap px-4 py-3">{fmtDate(a.occurredAt)}</td>
                          <td className="whitespace-nowrap px-4 py-3">{fmtTime(a.occurredAt)}</td>
                          <td className="px-4 py-3">{a.action}</td>
                          <td className="px-4 py-3 text-slate-brand">{a.actor}</td>
                        </tr>
                      ))}
                      {log.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-slate-brand">No activity yet.</td></tr>}
                    </tbody>
                  </table>
                </div>
                <p className="type-caption mt-4 flex items-center gap-2 text-slate-brand"><IconLock className="h-4 w-4" /> Locked by a database trigger. Entries cannot be edited or deleted.</p>
              </div>
            ) : (
              <LinkedInThread messages={msgs} prospectName={p.fullName} prospectPhoto={p.photoUrl} prospectHeadline={p.headline} ownerName={p.owner ?? "Maple MPSS Team"} />
            )}
          </div>
        </section>

        {/* Insights, draft, stage, tags */}
        <aside className="col-span-4 flex min-w-0 flex-col gap-6 md:col-span-8 lg:col-span-5">
          <section aria-label="AI summary" className="card p-4 md:p-6">
            <h2 className="type-h4 mb-4">Summary and next step</h2>
            {hasIntent ? (
              <Block label="Why">
                <p>{intent.output.reason}</p>
                {intent.output.evidence_quote && <p className="mt-1 border-l-4 border-rose pl-3 text-ink/80">&ldquo;{intent.output.evidence_quote}&rdquo;</p>}
              </Block>
            ) : <Block label="Why"><p className="text-slate-brand">Waiting for a reply to analyse.</p></Block>}
            <Block label="Summary"><p>{summary?.output.text ?? "-"}</p></Block>
            <Block label="Next best action">
              <p className="font-semibold">{next ? ACTION_LABEL[next.output.action] : "-"}</p>
              {next && <p className="text-slate-brand">{next.output.reason}</p>}
            </Block>
            {rulesTag && <p className="type-caption mt-4 text-slate-brand">Tagged by keyword rules</p>}
          </section>

          {draft ? (
            <DraftCard key={`${showFollowUp ? "f" : "r"}-${draft.createdAt.getTime()}`}
              title={showFollowUp ? `Follow-up ${followUp.output.followUp} draft` : "Suggested reply"}
              initialText={draft.output.text} threadUrl={conv?.threadUrl ?? p.linkedinUrl} disabled={p.doNotContact} />
          ) : (
            <section className="card p-4 md:p-6">
              <h2 className="type-h4">Suggested reply</h2>
              <p className="type-body mt-2 text-slate-brand">No draft yet. A suggested reply appears after the prospect replies.</p>
            </section>
          )}

          <section aria-label="Stage" className="card p-4 md:p-6">
            <h2 className="type-h4 mb-3">Stage</h2>
            <StageBar stage={p.stage} />
            {showFollowUp && <p className="type-caption mt-3 text-slate-brand">Follow-up {followUp.output.followUp} draft written.</p>}
          </section>

          <section aria-label="Tags" className="card p-4 md:p-6">
            <h2 className="type-h4 mb-3">Tags</h2>
            {ptags.length ? (
              <ul className="flex flex-wrap gap-2">{ptags.map((t) => <li key={t.name} className="chip">{t.name}</li>)}</ul>
            ) : <p className="type-body text-slate-brand">No tags yet.</p>}
            <p className="type-caption mt-4 text-slate-brand">Notes and attachments arrive in Phase 3.</p>
          </section>
        </aside>
      </div>
    </Shell>
  );
}
