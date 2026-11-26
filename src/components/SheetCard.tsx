"use client";
import { useActionState, useState } from "react";
import { sheetAction, type SheetState } from "@/app/prospects/[id]/audit-actions";
import { IconAlert, IconCheck, IconExternal } from "./Icons";
import { Field } from "./ui";

export type SheetView = {
  url: string;
  connectedText: string;
  lastSyncText: string | null;
  total: number;
  matched: number;
  updated: number;
  unmatched: string[];
  columns: { label: string; header: string }[];
  unmappedHeaders: string[];
  thisPersonFound: boolean | null;
};

const initial: SheetState = {};

export function SheetCard({ csrf, conn }: { csrf: string; conn: SheetView | null }) {
  const [state, action, pending] = useActionState(sheetAction, initial);
  const [editing, setEditing] = useState(false);
  // Controlled, because React clears plain form fields after a form action finishes and a failed Connect must not lose the link.
  const [urlValue, setUrlValue] = useState(conn?.url ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const showForm = !conn || editing;
  const synced = !!conn?.lastSyncText;

  return (
    <section aria-label="Auto Import" className="card p-4 md:p-6">
      <form action={action} className="flex flex-col gap-5" noValidate>
        <input type="hidden" name="csrf" value={csrf} />

        {showForm ? (
          <>
            <Field id="sheet-url" label="Sheet URL" hint="A Google Sheets link set to Anyone with the link can view, or a direct https link to a CSV file.">
              <input id="sheet-url" name="url" type="url" inputMode="url" value={urlValue} onChange={(e) => setUrlValue(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." className="input" aria-describedby="sheet-url-hint" autoComplete="off" />
            </Field>
            <div className="flex flex-wrap gap-2">
              <button name="intent" value="connect" disabled={pending} className="btn btn-primary btn-sm">{pending ? "Reading sheet..." : "Connect"}</button>
              <button name="intent" value="save" disabled={pending} className="btn btn-secondary btn-sm">Save link</button>
              {editing && <button type="button" onClick={() => setEditing(false)} className="btn btn-tertiary btn-sm">Cancel</button>}
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {synced ? (
                <span className="inline-flex items-center gap-2 rounded-full bg-success-bg px-3 py-1 text-sm font-medium text-success"><IconCheck className="h-4 w-4" />Connected successfully</span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-warning-bg px-3 py-1 text-sm font-medium text-warning">Link saved, not synced yet</span>
              )}
              {synced && conn!.thisPersonFound !== null && (conn!.thisPersonFound
                ? <span className="inline-flex items-center gap-2 rounded-full bg-success-bg px-3 py-1 text-sm font-medium text-success"><IconCheck className="h-4 w-4" />This person is in the sheet</span>
                : <span className="inline-flex items-center rounded-full bg-warning-bg px-3 py-1 text-sm font-medium text-warning">This person was not found in the sheet</span>)}
            </div>
            <a href={conn!.url} target="_blank" rel="noreferrer" className="type-caption inline-flex max-w-full items-center gap-1 break-all font-medium text-wine underline-offset-2 hover:underline">
              {conn!.url}<IconExternal className="h-4 w-4 shrink-0" /><span className="sr-only">(opens the sheet)</span>
            </a>
            <input type="hidden" name="url" value={conn!.url} />

            {synced && (
              <dl className="grid grid-cols-2 gap-3 rounded-xl bg-cream/60 p-4 sm:grid-cols-4">
                {[
                  ["Last sync", conn!.lastSyncText],
                  ["Records found", conn!.total],
                  ["Matched prospects", conn!.matched],
                  ["Updated", conn!.updated],
                ].map(([k, v]) => (
                  <div key={String(k)} className="min-w-0">
                    <dt className="type-caption font-semibold text-slate-brand">{k}</dt>
                    <dd className="type-body font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>
            )}

            {conn!.columns.length > 0 && (
              <details className="type-caption">
                <summary className="cursor-pointer font-semibold text-wine">Columns detected ({conn!.columns.length})</summary>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {conn!.columns.map((c) => <li key={c.label} className="chip h-8 text-xs">{c.header} <span aria-hidden="true">&rarr;</span> {c.label}</li>)}
                </ul>
                {conn!.unmappedHeaders.length > 0 && <p className="mt-2 text-slate-brand">Ignored columns: {conn!.unmappedHeaders.join(", ")}</p>}
                {conn!.unmatched.length > 0 && <p className="mt-2 text-slate-brand">Rows not matched to a prospect: {conn!.unmatched.join(", ")}</p>}
              </details>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button name="intent" value="refresh" disabled={pending} className="btn btn-primary btn-sm">{pending ? "Refreshing..." : "Refresh data"}</button>
              <button type="button" onClick={() => { setUrlValue(conn?.url ?? ""); setEditing(true); setConfirmDelete(false); }} className="btn btn-secondary btn-sm">Edit link</button>
              {!confirmDelete ? (
                <button type="button" onClick={() => setConfirmDelete(true)} className="btn btn-tertiary btn-sm text-danger">Delete link</button>
              ) : (
                <span className="inline-flex items-center gap-2" role="group" aria-label="Confirm delete">
                  <span className="type-caption font-medium">Delete this link?</span>
                  <button name="intent" value="delete" disabled={pending} onClick={() => setUrlValue("")} className="btn btn-sm border-danger bg-danger text-white hover:opacity-90">Yes, delete</button>
                  <button type="button" onClick={() => setConfirmDelete(false)} className="btn btn-tertiary btn-sm">Keep</button>
                </span>
              )}
            </div>
          </div>
        )}

        <div aria-live="polite" className="empty:hidden">
          {state.error && <p role="alert" className="alert alert-error"><IconAlert className="mt-0.5 shrink-0" />{state.error}</p>}
          {state.ok && state.message && <p role="status" className="alert alert-success"><IconCheck className="mt-0.5 shrink-0" />{state.message}</p>}
        </div>
      </form>

      <details className="type-caption mt-4 border-t border-line pt-3 text-slate-brand">
        <summary className="cursor-pointer font-semibold text-wine">Which links work?</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Google Sheets with sharing set to <strong>Anyone with the link</strong> (Viewer). The tab in the link is the one that is read.</li>
          <li>A sheet published to the web as CSV, or any direct https link to a CSV file.</li>
          <li>Private sheets and pages that need a login cannot be read. Download the sheet as CSV or use Auto-fill from audit instead.</li>
        </ul>
      </details>
    </section>
  );
}
