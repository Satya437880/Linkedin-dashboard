"use client";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { analyzeAction, type PasteAuditState } from "@/app/prospects/[id]/audit-actions";
import { IconAlert, IconCheck } from "./Icons";
import { Field } from "./ui";

const initial: PasteAuditState = {};

export function PasteAuditCard({ csrf, prospects, initialId }: { csrf: string; prospects: { id: number; name: string }[]; initialId: number | null }) {
  const [state, action, pending] = useActionState(analyzeAction, initial);
  const [text, setText] = useState("");
  // Controlled, because React clears plain form fields after a form action finishes.
  const [who, setWho] = useState(initialId ? String(initialId) : "auto");

  // Clear the box after a successful import. Keep it when the user still has to confirm or fix something.
  useEffect(() => { if (state.ok) setText(""); }, [state]);

  return (
    <section aria-label="Paste Audit Details" className="card p-4 md:p-6">
      <h2 className="type-h4"><span aria-hidden="true">📝 </span>Paste Audit Details</h2>
      <p className="type-body mt-1 text-slate-brand">Paste raw prospect research, LinkedIn information, audit findings, meeting notes, or AI-generated reports.</p>

      <form action={action} className="mt-5 flex flex-col gap-5" noValidate>
        <input type="hidden" name="csrf" value={csrf} />

        <Field id="audit-prospect" label="Prospect" hint="Leave on Detect and the person is found from the Person or LinkedIn line in your text.">
          <select id="audit-prospect" name="prospectId" value={who} onChange={(e) => setWho(e.target.value)} aria-describedby="audit-prospect-hint" className="input">
            <option value="auto">Detect from the pasted text</option>
            {prospects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>

        <Field id="audit-text" label="Details to paste" hint="Labels such as Designation: or Audit Findings: help, but plain text works too." error={state.error}>
          <textarea
            id="audit-text" name="text" rows={12} value={text} onChange={(e) => setText(e.target.value)}
            placeholder="Paste Prospect Details, Audit Details, LinkedIn Research, Company Research, Website Audit, Meeting Notes, or AI Analysis here."
            aria-invalid={state.error ? true : undefined} aria-describedby={state.error ? "audit-text-error" : "audit-text-hint"} className="input"
          />
        </Field>

        {state.mismatch && (
          <div role="alert" className="alert alert-info flex-col items-stretch gap-3">
            <p>
              This text is about <strong>{state.mismatch.found}</strong>, but you chose <strong>{state.mismatch.expected}</strong>.
            </p>
            <div className="flex flex-wrap gap-2">
              <button name="confirm" value="1" disabled={pending} className="btn btn-primary btn-sm">Apply to {state.mismatch.expected} anyway</button>
              <button type="button" onClick={() => setWho("auto")} className="btn btn-secondary btn-sm">Detect the person instead</button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button disabled={pending || !text.trim()} className="btn btn-primary btn-sm">{pending ? "Analyzing..." : "Analyze & Populate"}</button>
          {text && !pending && <button type="button" onClick={() => setText("")} className="btn btn-tertiary btn-sm">Clear</button>}
        </div>

        <div aria-live="polite" className="empty:hidden">
          {state.ok && state.message && (
            <div role="status" className="alert alert-success flex-col items-stretch gap-2">
              <p className="flex items-start gap-2"><IconCheck className="mt-0.5 shrink-0" />{state.message}</p>
              {state.populated && state.populated.length > 0 && (
                <ul className="flex flex-wrap gap-2">{state.populated.map((f) => <li key={f} className="rounded-full bg-white px-3 py-1 text-sm font-medium text-success">{f}</li>)}</ul>
              )}
              {state.target && (
                <p><Link href={`/prospects/${state.target.id}?tab=audit`} className="font-semibold underline underline-offset-2">View {state.target.name}&rsquo;s audit details</Link></p>
              )}
              {state.engine && <p className="type-caption font-normal">{state.engine === "rules" ? "Read by keyword rules." : `Read with the local model ${state.engine}.`}</p>}
            </div>
          )}
          {state.error && <p className="sr-only"><IconAlert />{state.error}</p>}
        </div>
      </form>
    </section>
  );
}
