import { count } from "drizzle-orm";
import { AccountCards } from "@/components/AccountCards";
import { Shell } from "@/components/Shell";
import { PageHeader } from "@/components/ui";
import { requireSession } from "@/server/auth/auth";
import { getBundle } from "@/server/db/client";
import { lastCaptureAt } from "@/server/ingest/ingestEvent";
import { jobs, messages, prospects } from "@/server/db/schema";

export const dynamic = "force-dynamic";

async function ollamaStatus() {
  const url = process.env.OLLAMA_URL ?? "http://localhost:11434";
  const model = process.env.OLLAMA_MODEL ?? "qwen2.5:7b-instruct";
  try {
    const r = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(1500), cache: "no-store" });
    const j = (await r.json()) as { models?: { name: string }[] };
    const has = (j.models ?? []).some((m) => m.name === model || m.name.startsWith(model + ":"));
    return { reachable: true, has, model };
  } catch {
    return { reachable: false, has: false, model };
  }
}

function Card({ title, badge, className = "", children }: { title: string; badge?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className={`card min-w-0 p-4 md:p-6 ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="type-h4">{title}</h2>
        {badge}
      </div>
      {children}
    </section>
  );
}

const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
    <dt className="type-caption font-semibold text-slate-brand">{k}</dt>
    <dd className="type-body min-w-0 break-words">{v}</dd>
  </div>
);

const Badge = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => (
  <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${ok ? "bg-success-bg text-success" : "bg-warning-bg text-warning"}`}>{children}</span>
);

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  const session = await requireSession();
  const { account } = await searchParams;
  const b = getBundle();
  const last = await lastCaptureAt(b);
  const nP = (await b.db.select({ n: count() }).from(prospects))[0]?.n ?? 0;
  const nM = (await b.db.select({ n: count() }).from(messages))[0]?.n ?? 0;
  const nJ = (await b.db.select({ n: count() }).from(jobs))[0]?.n ?? 0;
  const ol = await ollamaStatus();
  const tz = process.env.APP_TIMEZONE ?? "America/Toronto";
  const fmt = (d: Date) => new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: tz }).format(d);

  return (
    <Shell>
      <PageHeader title="Settings" description="Connection details, local AI and data on this computer." />
      <div className="grid grid-cols-4 gap-4 md:grid-cols-8 md:gap-6 lg:grid-cols-12">
        <AccountCards session={session} status={account} />

        <Card title="Chrome extension" badge={<Badge ok={!!last}>{last ? "Capturing" : "No capture yet"}</Badge>} className="col-span-4 md:col-span-8 lg:col-span-6">
          <dl className="divide-y divide-line">
            <Row k="App URL" v={<span className="font-mono text-sm">http://localhost:3000</span>} />
            <Row k="Last capture" v={last ? fmt(last) : "None yet"} />
          </dl>
          <details className="mt-4">
            <summary className="btn btn-secondary btn-sm w-fit list-none">Show ingest token</summary>
            <p className="mt-4 break-all rounded-xl bg-cream p-4 font-mono text-sm">{process.env.INGEST_TOKEN ?? "(not set in .env.local)"}</p>
            <p className="type-caption mt-2 text-slate-brand">Paste this into the extension Options page. Keep it private.</p>
          </details>
        </Card>

        <Card title="Local AI (Ollama)" badge={<Badge ok={ol.reachable && ol.has}>{ol.reachable ? (ol.has ? "Ready" : "Model missing") : "Rules only"}</Badge>} className="col-span-4 md:col-span-8 lg:col-span-6">
          <dl className="divide-y divide-line">
            <Row k="Status" v={ol.reachable ? "Running" : "Not running. Keyword rules are used instead."} />
            <Row k="Model" v={<span className="font-mono text-sm">{ol.model}</span>} />
            <Row k="Model pulled" v={ol.reachable ? (ol.has ? "Yes" : "No") : "-"} />
          </dl>
          {(!ol.reachable || !ol.has) && (
            <div className="mt-4">
              <p className="type-caption text-slate-brand">{ol.reachable ? "Run this in a terminal:" : "Install Ollama from ollama.com, then run:"}</p>
              <code className="mt-2 block overflow-x-auto rounded-xl bg-cream p-4 font-mono text-sm">ollama pull {ol.model}</code>
            </div>
          )}
        </Card>

        <Card title="Data" className="col-span-4 md:col-span-8 lg:col-span-6">
          <dl className="divide-y divide-line">
            <Row k="Prospects" v={nP} />
            <Row k="Messages" v={nM} />
            <Row k="Queued jobs" v={nJ} />
            <Row k="Database" v={<span className="font-mono text-sm">Supabase Postgres</span>} />
            <Row k="Timezone" v={tz} />
          </dl>
        </Card>

        <Card title="Coming next" className="col-span-4 md:col-span-8 lg:col-span-6">
          <p className="type-body text-slate-brand">Editable follow-up cadence, lead score weights, voice brief, signature, banned words and backup status arrive in the next phases.</p>
        </Card>
      </div>
    </Shell>
  );
}
