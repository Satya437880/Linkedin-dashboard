"use client";
import { useState } from "react";
import { checkDraft } from "@/server/ai/draftCheck";
import { IconAlert, IconCheck, IconCopy } from "./Icons";

export function DraftCard({ title, initialText, threadUrl, disabled, note }: { title: string; initialText: string; threadUrl: string | null; disabled: boolean; note?: string }) {
  const [text, setText] = useState(initialText);
  const [copied, setCopied] = useState(false);
  const check = checkDraft(text);

  async function copyAndOpen() {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* clipboard blocked */ }
    if (threadUrl) window.open(threadUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <section aria-label={title} className="card p-4 md:p-6">
      <h2 className="type-h4">{title}</h2>
      {note && <p className="type-caption mt-1 text-slate-brand">{note}</p>}
      <div className="field mt-4">
        <label htmlFor="draft" className="field-label">Edit before sending</label>
        <textarea id="draft" value={text} onChange={(e) => setText(e.target.value)} rows={9} disabled={disabled}
          aria-describedby="draft-check" className="input disabled:bg-cream disabled:text-slate-brand" />
      </div>
      <p id="draft-check" className={`mt-3 flex items-start gap-2 text-sm font-medium ${check.ok ? "text-success" : "text-danger"}`} role={check.ok ? undefined : "alert"}>
        {check.ok ? <IconCheck className="mt-0.5 shrink-0" /> : <IconAlert className="mt-0.5 shrink-0" />}
        {check.ok ? "Checked: no em dashes, no banned words" : `Problem: ${check.problems.join("; ")}`}
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <button type="button" onClick={copyAndOpen} disabled={disabled || !text.trim()} className="btn btn-primary btn-block sm:w-auto">
          {copied ? <IconCheck /> : <IconCopy />}
          {copied ? "Copied" : "Copy and open"}
        </button>
        <p className="type-caption text-slate-brand">Copies the text and opens the LinkedIn page. You paste and send.</p>
      </div>
      {disabled && <p role="alert" className="alert alert-error mt-4">Disabled: this person asked not to be contacted.</p>}
    </section>
  );
}
