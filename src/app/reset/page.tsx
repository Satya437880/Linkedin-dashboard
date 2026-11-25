/* eslint-disable @next/next/no-img-element */
import { redirect } from "next/navigation";
import { Field } from "@/components/ui";
import { checkRecoveryCode, clearLoginFailures, loginLockedMinutes, recordLoginFailure, recoveryEnabled, setPassword } from "@/server/auth/auth";

async function reset(form: FormData) {
  "use server";
  if (!recoveryEnabled()) redirect("/reset?error=disabled");
  if (await loginLockedMinutes()) redirect("/reset?error=locked");
  const code = String(form.get("code") ?? "");
  const pw = String(form.get("password") ?? "");
  const again = String(form.get("again") ?? "");
  if (!checkRecoveryCode(code)) {
    await recordLoginFailure();
    redirect("/reset?error=code");
  }
  if (pw.length < 10) redirect("/reset?error=short");
  if (pw !== again) redirect("/reset?error=mismatch");
  await setPassword(pw);
  await clearLoginFailures();
  redirect("/login?reset=ok");
}

const MESSAGES: Record<string, string> = {
  disabled: "Password reset is not set up. Add a RECOVERY_CODE (12+ characters) in your hosting settings first.",
  locked: "Too many wrong attempts. Wait 15 minutes and try again.",
  code: "That recovery code is not correct.",
  short: "Use a password of at least 10 characters.",
  mismatch: "The two passwords do not match.",
};

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const message = error ? MESSAGES[error] ?? MESSAGES.code : null;
  return (
    <main id="main" className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <img src="/logo-full.png" alt="Maple MPSS" className="h-auto w-56" />
        </div>
        <div className="card card-pad shadow-[var(--shadow-lg)] sm:p-8">
          <h1 className="type-h4">Reset password</h1>
          <p className="type-body mt-1 text-slate-brand">Enter your recovery code and choose a new password.</p>
          <form action={reset} className="mt-6 flex flex-col gap-6" noValidate>
            <Field id="code" label="Recovery code" hint="The RECOVERY_CODE saved in your hosting settings." error={error === "code" || error === "disabled" || error === "locked" ? message : null}>
              <input id="code" name="code" type="password" autoComplete="off" required autoFocus className="input" />
            </Field>
            <Field id="password" label="New password" hint="At least 10 characters." error={error === "short" ? message : null}>
              <input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} className="input" />
            </Field>
            <Field id="again" label="Repeat new password" error={error === "mismatch" ? message : null}>
              <input id="again" name="again" type="password" autoComplete="new-password" required className="input" />
            </Field>
            <button className="btn btn-primary btn-block">Change password</button>
            <a href="/login" className="type-caption text-center text-slate-brand underline">Back to sign in</a>
          </form>
        </div>
      </div>
    </main>
  );
}
