"use client";
import { useFormStatus } from "react-dom";

/** Submit button that shows a pending state and cannot be double-clicked. */
export function SubmitButton({ children, pendingLabel = "Working...", className = "btn btn-primary" }: { children: React.ReactNode; pendingLabel?: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-disabled={pending} className={className}>
      {pending ? pendingLabel : children}
    </button>
  );
}
