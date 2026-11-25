"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Picks up new captures by re-rendering server data every 5 seconds while the tab is visible. */
export function AutoRefresh({ ms = 5000 }: { ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, ms);
    return () => clearInterval(t);
  }, [router, ms]);
  return null;
}
