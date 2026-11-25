import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="card w-full max-w-lg p-6 text-center md:p-8">
        <p className="type-caption font-semibold text-wine">404</p>
        <h1 className="type-h3 mt-1">We could not find that page</h1>
        <p className="type-body mt-2 text-slate-brand">The link may be old, or the person was archived.</p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/prospects" className="btn btn-primary">Back to prospects</Link>
          <Link href="/dashboard" className="btn btn-secondary">Dashboard</Link>
        </div>
      </div>
    </main>
  );
}
