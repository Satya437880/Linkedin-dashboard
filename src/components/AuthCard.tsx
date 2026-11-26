/* eslint-disable @next/next/no-img-element */
/** Layout shared by the log in, sign up and forgot password pages. */
export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <main id="main" className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-[26rem]">
        <div className="mb-10 flex items-center gap-3">
          <img src="/logo.png" alt="" className="h-10 w-10 mix-blend-multiply" />
          <span className="text-xl font-semibold text-wine">Maple MPSS</span>
        </div>
        <h1 className="type-h3">{title}</h1>
        {subtitle && <p className="type-body mt-2 text-slate-brand">{subtitle}</p>}
        <div className="mt-8">{children}</div>
      </div>
    </main>
  );
}
