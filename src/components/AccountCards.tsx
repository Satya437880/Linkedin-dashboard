import { changeMyPassword, manageAccount } from "@/app/settings/actions";
import { MIN_PASSWORD, listAccounts } from "@/server/auth/accounts";
import { getBundle } from "@/server/db/client";
import { PasswordInput } from "./PasswordInput";
import { SubmitButton } from "./SubmitButton";

const MESSAGES: Record<string, { ok: boolean; text: string }> = {
  changed: { ok: true, text: "Password changed." },
  saved: { ok: true, text: "Accounts updated." },
  wrong: { ok: false, text: "Your current password is not correct." },
  short: { ok: false, text: `Use a password of at least ${MIN_PASSWORD} characters.` },
};

/** Change your own password; admins also approve and remove accounts. */
export async function AccountCards({ session, status }: { session: { email: string; admin: boolean; csrf: string }; status?: string }) {
  const message = status ? MESSAGES[status] : undefined;
  const accounts = session.admin ? await listAccounts(getBundle().db) : [];
  return (
    <>
      <section aria-label="Your account" className="card col-span-4 min-w-0 p-4 md:col-span-8 md:p-6 lg:col-span-6">
        <h2 className="type-h4">Your account</h2>
        <p className="type-body mt-1 break-all text-slate-brand">{session.email}</p>
        {message && <p role="status" className={`type-body mt-4 rounded-xl p-3 ${message.ok ? "bg-success-bg text-success" : "bg-danger-bg text-danger"}`}>{message.text}</p>}
        <form action={changeMyPassword} className="mt-4 flex flex-col gap-4">
          <input type="hidden" name="csrf" value={session.csrf} />
          <div className="field">
            <label htmlFor="current" className="field-label">Current password</label>
            <PasswordInput id="current" autoComplete="current-password" />
          </div>
          <div className="field">
            <label htmlFor="password" className="field-label">New password</label>
            <PasswordInput id="password" autoComplete="new-password" minLength={MIN_PASSWORD} />
          </div>
          <SubmitButton className="btn btn-primary w-fit">Change password</SubmitButton>
        </form>
      </section>

      {session.admin && (
        <section aria-label="People" className="card col-span-4 min-w-0 p-4 md:col-span-8 md:p-6 lg:col-span-6">
          <h2 className="type-h4">People</h2>
          <p className="type-caption mt-1 text-slate-brand">Approve only people you know. They can see and edit every prospect.</p>
          <ul className="mt-2 divide-y divide-line">
            {accounts.map((a) => (
              <li key={a.email} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className="type-body min-w-0 break-all">
                  {a.email}
                  <span className="type-caption block text-slate-brand">{a.admin ? "Admin" : a.status === "pending" ? "Waiting for approval" : "Active"}</span>
                </span>
                {a.email !== session.email && (
                  <form action={manageAccount} className="flex gap-2">
                    <input type="hidden" name="csrf" value={session.csrf} />
                    <input type="hidden" name="email" value={a.email} />
                    {a.status === "pending" && <button name="do" value="approve" className="btn btn-primary btn-sm">Approve</button>}
                    <button name="do" value="remove" className="btn btn-secondary btn-sm">Remove</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
