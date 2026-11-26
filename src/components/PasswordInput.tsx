"use client";
import { useState } from "react";

/** Password box with a show / hide button. */
export function PasswordInput({ id, autoComplete, minLength }: { id: string; autoComplete: "current-password" | "new-password"; minLength?: number }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input id={id} name={id} type={show ? "text" : "password"} autoComplete={autoComplete} minLength={minLength} required className="input !pr-12" />
      <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}
        className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-brand hover:text-ink">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
          {show && <path d="M3 3l18 18" />}
        </svg>
      </button>
    </div>
  );
}
