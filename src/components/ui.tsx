import type { ReactNode } from "react";
import { IconInbox } from "./Icons";

/** Page title block: H3 title, optional description, optional actions on the right. */
export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <h1 className="type-h3">{title}</h1>
        {description && <p className="type-body mt-1 text-slate-brand">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </header>
  );
}

/** Label above the control, optional hint, and an error that screen readers announce. */
export function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id} className="field-label">{label}</label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="field-hint">{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className="field-error">{error}</p>}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose/30 text-wine"><IconInbox className="h-7 w-7" /></span>
      <h2 className="type-h4">{title}</h2>
      <p className="type-body mt-2 max-w-md text-slate-brand">{body}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
