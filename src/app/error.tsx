"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="card w-full max-w-lg p-6 text-center md:p-8" role="alert">
        <h1 className="type-h3">Something went wrong</h1>
        <p className="type-body mt-2 text-slate-brand">This page could not load. Your data is safe. Try again, and if it keeps happening, restart the app.</p>
        {error.digest && <p className="type-caption mt-2 font-mono text-slate-brand">Reference: {error.digest}</p>}
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <button type="button" onClick={reset} className="btn btn-primary">Try again</button>
          <a href="/dashboard" className="btn btn-secondary">Go to dashboard</a>
        </div>
      </div>
    </main>
  );
}
