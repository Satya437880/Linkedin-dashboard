/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { getBundle } from "@/server/db/client";
import { lastCaptureAt } from "@/server/ingest/ingestEvent";
import { requireSession } from "@/server/auth/auth";
import { AlertBar } from "./AlertBar";
import { AutoRefresh } from "./AutoRefresh";
import { IconAlert } from "./Icons";
import { MobileNav } from "./MobileNav";
import { NavLinks } from "./NavLinks";

export async function Shell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  const session = await requireSession();
  const last = lastCaptureAt(getBundle());
  const stale = last ? Date.now() - last.getTime() > 2 * 86_400_000 : false;
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: process.env.APP_TIMEZONE ?? "America/Toronto" }).format(d);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      {/* Desktop sidebar: logo, navigation. Bottom space stays clear for the floating menu badge. */}
      <aside className="hidden border-r border-line bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:px-4 lg:pb-24 lg:pt-6">
        <Link href="/dashboard" aria-label="Maple MPSS home" className="mb-8 block px-2">
          <img src="/logo-full.png" alt="Maple MPSS" className="h-auto w-44" />
        </Link>
        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-brand">LinkedIn Dashboard</p>
        <NavLinks />
      </aside>

      <div className="min-w-0">
        <MobileNav csrf={session.csrf} />
        <header className="flex min-h-14 items-center justify-end gap-3 border-b border-line bg-white px-4 py-2 text-sm text-slate-brand md:px-6 lg:px-8">
          <span className="rounded-full bg-cream px-3 py-1 font-medium">
            Last capture: <span className="text-ink">{last ? fmt(last) : "none yet"}</span>
          </span>
        </header>
        <AlertBar />
        <AutoRefresh />
        {stale && (
          <div role="alert" className="alert alert-error mx-4 mt-4 md:mx-6 lg:mx-8">
            <IconAlert className="mt-0.5 shrink-0" />
            No messages captured for over 2 days. Is the extension running?
          </div>
        )}
        <main id="main" tabIndex={-1} className={`mx-auto w-full px-4 pb-24 pt-6 md:px-6 md:pt-8 lg:px-8 lg:pb-16 ${wide ? "max-w-[125rem]" : "max-w-[112rem]"}`}>
          {children}
        </main>
      </div>
    </div>
  );
}
