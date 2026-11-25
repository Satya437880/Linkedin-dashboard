/* eslint-disable @next/next/no-img-element */
import { redirect } from "next/navigation";
import { Field } from "@/components/ui";
import { checkPassword, startSession } from "@/server/auth/auth";

async function login(form: FormData) {
  "use server";
  const pw = String(form.get("password") ?? "");
  if (!pw) redirect("/login?error=empty");
  if (!checkPassword(pw)) redirect("/login?error=wrong");
  await startSession();
  redirect("/dashboard");
}

const MESSAGES: Record<string, string> = {
  empty: "Enter your password to continue.",
  wrong: "That password is not correct. Check it and try again.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const message = error ? MESSAGES[error] ?? MESSAGES.wrong : null;
  return (
    <main id="main" className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <img src="/logo-full.png" alt="Maple MPSS" className="h-auto w-56" />
        </div>
        <div className="card card-pad shadow-[var(--shadow-lg)] sm:p-8">
          <h1 className="type-h4">Sign in</h1>
          <p className="type-body mt-1 text-slate-brand">LinkedIn Response Dashboard</p>
          <form action={login} className="mt-6 flex flex-col gap-6" noValidate>
            <Field id="password" label="Password" error={message}>
              <input id="password" name="password" type="password" autoComplete="current-password" required autoFocus
                aria-invalid={message ? true : undefined} aria-describedby={message ? "password-error" : undefined} className="input" />
            </Field>
            <button className="btn btn-primary btn-block">Sign in</button>
          </form>
        </div>
        <p className="type-caption mt-6 text-center text-slate-brand">Runs on this computer only. Nothing is sent to the cloud.</p>
      </div>
    </main>
  );
}
