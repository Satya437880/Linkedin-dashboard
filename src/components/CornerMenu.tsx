"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { IconSettings, IconSignOut } from "./Icons";

/** Floating logo badge (bottom-left). 48px touch target; the menu opens upward. */
export function CornerMenu({ csrf }: { csrf: string | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const item = "flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-base font-medium hover:bg-rose/25 focus-visible:bg-rose/25";
  return (
    <div ref={ref} className="fixed bottom-4 left-4 z-50 hidden lg:block">
      {open && (
        <div role="menu" className="absolute bottom-16 left-0 w-56 rounded-2xl border border-line bg-white p-2 shadow-lg">
          {csrf ? (
            <>
              <Link href="/settings" role="menuitem" onClick={() => setOpen(false)} className={item}><IconSettings />Settings</Link>
              <form action="/api/logout" method="post" className="mt-1 border-t border-line pt-1">
                <input type="hidden" name="csrf" value={csrf} />
                <button role="menuitem" className={item}><IconSignOut />Sign out</button>
              </form>
            </>
          ) : (
            <Link href="/login" role="menuitem" className={item}>Sign in</Link>
          )}
        </div>
      )}
      <button type="button" aria-label="Open account menu" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className="h-12 w-12 overflow-hidden rounded-full bg-white shadow-md ring-1 ring-line hover:shadow-lg">
        <img src="/logo.png" alt="" className="h-full w-full" />
      </button>
    </div>
  );
}
