import { redirect } from "next/navigation";
import { IconAlert, IconCheck } from "@/components/Icons";
import { Shell } from "@/components/Shell";
import { SubmitButton } from "@/components/SubmitButton";
import { Field, PageHeader } from "@/components/ui";
import { requireSession, verifyCsrf } from "@/server/auth/auth";
import { getBundle } from "@/server/db/client";
import { importContactsCsv } from "@/server/ingest/csvImport";

async function upload(form: FormData) {
  "use server";
  await verifyCsrf(form);
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) redirect("/import?error=missing");
  if (file.size > 5_000_000) redirect("/import?error=big");
  let created = 0, skipped = 0;
  try {
    ({ created, skipped } = importContactsCsv(getBundle(), await file.text()));
  } catch {
    redirect("/import?error=format");
  }
  redirect(`/import?created=${created}&skipped=${skipped}`);
}

const ERRORS: Record<string, string> = {
  missing: "Choose a CSV file first.",
  big: "That file is larger than 5 MB. Split it into smaller files.",
  format: "That file could not be read. It needs a header row with a name column.",
};

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ created?: string; skipped?: string; error?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const error = sp.error ? ERRORS[sp.error] ?? ERRORS.format : null;
  return (
    <Shell>
      <PageHeader title="CSV import" description="Add people from a spreadsheet export." />
      <div className="grid grid-cols-4 gap-6 md:grid-cols-8 lg:grid-cols-12">
        <section className="card col-span-4 p-4 md:col-span-8 md:p-8 lg:col-span-7">
          {sp.created && (
            <p role="status" className="alert alert-success mb-6"><IconCheck className="mt-0.5 shrink-0" /> Imported {sp.created} new {sp.created === "1" ? "person" : "people"}. {sp.skipped} already existed and were skipped.</p>
          )}
          {error && <p role="alert" className="alert alert-error mb-6"><IconAlert className="mt-0.5 shrink-0" /> {error}</p>}
          <form action={upload} className="flex flex-col gap-6">
            <input type="hidden" name="csrf" value={s.csrf} />
            <Field id="file" label="CSV file" hint="Up to 5 MB. Comma-separated, with a header row.">
              <input id="file" type="file" name="file" accept=".csv,text/csv" required aria-describedby="file-hint"
                className="input h-auto cursor-pointer p-2 file:mr-4 file:h-10 file:cursor-pointer file:rounded-lg file:border-0 file:bg-wine file:px-4 file:font-semibold file:text-white hover:file:bg-wine-dark" />
            </Field>
            <div className="flex justify-end"><SubmitButton pendingLabel="Importing...">Import file</SubmitButton></div>
          </form>
        </section>
        <aside className="card col-span-4 p-4 md:col-span-8 md:p-6 lg:col-span-5">
          <h2 className="type-h4">Expected columns</h2>
          <dl className="mt-4 divide-y divide-line text-sm">
            {[["name", "Required"], ["linkedin_url", "Used to match existing people"], ["company", "Creates the company record"], ["designation", "Job title"]].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 py-3"><dt className="font-mono font-medium">{k}</dt><dd className="text-slate-brand">{v}</dd></div>
            ))}
          </dl>
          <p className="type-caption mt-4 text-slate-brand">Header names are matched loosely, so &ldquo;Full Name&rdquo; or &ldquo;Company name&rdquo; also work.</p>
        </aside>
      </div>
    </Shell>
  );
}
