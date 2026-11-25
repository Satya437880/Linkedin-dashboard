"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { IconClose, IconMenu } from "./Icons";
import { NavLinks } from "./NavLinks";

/** Top bar for screens below 1024px: logo on the left, menu button on the right. */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, [open]);

  return (
    <div ref={ref} className="sticky top-0 z-40 border-b border-line bg-white lg:hidden">
      <div className="flex h-16 items-center justify-between px-4">
        <Link href="/dashboard" aria-label="Maple MPSS home" className="flex items-center gap-2">
          <img src="/logo.png" alt="" className="h-10 w-10" />
          <span className="text-base font-bold text-wine">Maple MPSS</span>
        </Link>
        <button type="button" className="btn btn-secondary btn-sm" aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen((o) => !o)}>
          {open ? <IconClose /> : <IconMenu />}
          <span>{open ? "Close" : "Menu"}</span>
        </button>
      </div>
      {open && (
        <div id="mobile-menu" className="absolute inset-x-0 top-16 border-b border-line bg-white px-4 pb-4 pt-2 shadow-lg">
          <NavLinks onNavigate={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
