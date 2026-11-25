import { saveDetails } from "@/app/prospects/[id]/actions";
import { TZ } from "@/lib/format";
import { Field } from "./ui";

type Props = {
  csrf: string;
  prospect: { id: number; fullName: string; linkedinUrl: string | null; designation: string | null; headline: string | null; location: string | null; industry: string | null };
  audit: { contactInfo: string | null; findings: string[] | null; recommendations: string[] | null; issues: string[] | null; painPoints: string[] | null; requirements: string[] | null; notes: string | null; source: string | null } | null;
  company: { name: string; website: string | null; headquarters: string | null; industry: string | null; aiOverview: unknown } | null;
  lastReply: { text: string; sentAt: Date } | null;
};

/** "Saturday (Nov 21) at 1:15 PM" in the app timezone. */
export function askedWhen(d: Date, tz = TZ()): string {
  const part = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, ...opts }).format(d);
  const time = part({ hour: "numeric", minute: "2-digit", hour12: true })
    .replace(/ | /g, " ")
    .replace(/\./g, "")
    .replace(/\b(am|pm)\b/i, (m) => m.toUpperCase());
  return `${part({ weekday: "long" })} (${part({ month: "short", day: "numeric" })}) at ${time}`;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
      <dt className="type-caption font-semibold text-slate-brand">{label}</dt>
      <dd className="type-body min-w-0 break-words">{children}</dd>
    </div>
  );
}

const Empty = () => <span className="text-slate-brand">Not provided yet</span>;
const Points = ({ items }: { items: string[] | null | undefined }) =>
  items && items.length ? <ul className="list-disc space-y-1 pl-5">{items.map((x, i) => <li key={i}>{x}</li>)}</ul> : <Empty />;

export function AuditDetails({ csrf, prospect: p, audit, company, lastReply }: Props) {
  const bullets = (company?.aiOverview as { bullets?: string[] } | null)?.bullets ?? [];
  return (
    <section aria-label="Prospect details" className="rounded-2xl border border-line bg-cream/40 p-4 md:p-6">
      <h2 className="type-h4 mb-2">Details</h2>
      <dl className="divide-y divide-line">
        <Row label="Person">
          {p.fullName}
          {p.location ? <span className="text-slate-brand"> (based in {p.location})</span> : null}
        </Row>
        <Row label="LinkedIn">
          {p.linkedinUrl ? <a href={p.linkedinUrl} target="_blank" rel="noreferrer" className="break-all font-medium text-wine underline-offset-2 hover:underline">{p.linkedinUrl}</a> : "-"}
        </Row>
        <Row label="Designation">
          {p.designation ?? p.headline ?? "-"}
          {company ? <>, {company.name}</> : null}
        </Row>
        <Row label="Company">
          {company ? <>{company.name}{company.headquarters ? `, ${company.headquarters}` : ""}</> : "-"}
          {company?.website && <> · <a href={company.website} target="_blank" rel="noreferrer" className="font-medium text-wine underline-offset-2 hover:underline">{company.website}</a></>}
        </Row>
        <Row label="Industry">{company?.industry ?? p.industry ?? <Empty />}</Row>
        <Row label="Contact information">
          {audit?.contactInfo ? <span className="whitespace-pre-line">{audit.contactInfo}</span> : <Empty />}
        </Row>
        <Row label="Company overview"><Points items={bullets} /></Row>
        <Row label="Audit findings"><Points items={audit?.findings} /></Row>
        <Row label="Recommendations"><Points items={audit?.recommendations} /></Row>
        <Row label="Issues"><Points items={audit?.issues} /></Row>
        <Row label="Pain points"><Points items={audit?.painPoints} /></Row>
        <Row label="Requirements"><Points items={audit?.requirements} /></Row>
        <Row label="Notes">{audit?.notes ? <span className="whitespace-pre-line">{audit.notes}</span> : <Empty />}</Row>
        <Row label="What they asked">
          {lastReply ? (
            <>
              <span className="block text-slate-brand">{askedWhen(lastReply.sentAt)}</span>
              <span className="mt-1 block border-l-4 border-rose pl-3">&ldquo;{lastReply.text}&rdquo;</span>
            </>
          ) : (
            <span className="text-slate-brand">No reply yet.</span>
          )}
        </Row>
      </dl>

      <details className="group mt-4 border-t border-line pt-4">
        <summary className="btn btn-secondary btn-sm w-fit list-none">Edit details</summary>
        <form action={saveDetails} className="mt-6 flex flex-col gap-6">
          <input type="hidden" name="csrf" value={csrf} />
          <input type="hidden" name="prospectId" value={p.id} />
          <Field id="location" label="Location" hint="City and province, for example Mississauga, ON">
            <input id="location" name="location" defaultValue={p.location ?? ""} autoComplete="off" className="input" aria-describedby="location-hint" />
          </Field>
          {company ? (
            <>
              <Field id="address" label="Company address">
                <input id="address" name="address" defaultValue={company.headquarters ?? ""} autoComplete="off" className="input" />
              </Field>
              <Field id="website" label="Company website" hint="Start with https://">
                <input id="website" name="website" type="url" inputMode="url" defaultValue={company.website ?? ""} className="input" aria-describedby="website-hint" />
              </Field>
              <Field id="overview" label="Company overview" hint="One point per line">
                <textarea id="overview" name="overview" rows={5} defaultValue={bullets.join("\n")} className="input" aria-describedby="overview-hint" />
              </Field>
            </>
          ) : (
            <p className="alert alert-info">No company is linked to this person yet, so only the location can be saved.</p>
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button className="btn btn-primary btn-block sm:w-auto">Save details</button>
            <p className="type-caption text-slate-brand">Each save is recorded in the locked activity log.</p>
          </div>
        </form>
      </details>
    </section>
  );
}
