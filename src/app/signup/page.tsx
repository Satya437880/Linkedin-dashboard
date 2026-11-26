import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/AuthCard";
import { PasswordInput } from "@/components/PasswordInput";
import { SubmitButton } from "@/components/SubmitButton";
import { MIN_PASSWORD, normalizeEmail, requestAccount, validEmail } from "@/server/auth/accounts";
import { isLocked, recordFailure } from "@/server/auth/throttle";
import { getBundle } from "@/server/db/client";

async function signup(form: FormData) {
  "use server";
  const email = normalizeEmail(String(form.get("email") ?? ""));
  const password = String(form.get("password") ?? "");
  if (await isLocked()) redirect("/signup?error=locked");
  if (!validEmail(email)) redirect("/signup?error=email");
  if (password.length < MIN_PASSWORD || password.length > 200) redirect("/signup?error=short");
  if (password !== String(form.get("again") ?? "")) redirect("/signup?error=mismatch");
  const result = await requestAccount(getBundle().db, email, password);
  if (result !== "ok") {
    await recordFailure();
    redirect(`/signup?error=${result}`);
  }
  redirect("/login?requested=1");
}

const MESSAGES: Record<string, string> = {
  email: "Enter a valid email address.",
  short: `Use a password of at least ${MIN_PASSWORD} characters.`,
  mismatch: "The two passwords do not match.",
  exists: "That email already has an account. Log in, or ask an admin to reset it.",
  full: "Too many accounts are waiting for approval. Ask an admin to clear them.",
  locked: "Too many attempts. Wait 15 minutes and try again.",
};

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <AuthCard title="Create your account" subtitle="An admin approves new accounts before they can log in.">
      {error && <p role="alert" className="type-body mb-6 rounded-xl bg-danger-bg p-3 text-danger">{MESSAGES[error] ?? "Could not create the account."}</p>}
      <form action={signup} className="flex flex-col gap-5">
        <div className="field">
          <label htmlFor="email" className="field-label">Email</label>
          <input id="email" name="email" type="email" autoComplete="username" required autoFocus className="input" />
        </div>
        <div className="field">
          <label htmlFor="password" className="field-label">Password</label>
          <PasswordInput id="password" autoComplete="new-password" minLength={MIN_PASSWORD} />
          <p className="field-hint">At least {MIN_PASSWORD} characters.</p>
        </div>
        <div className="field">
          <label htmlFor="again" className="field-label">Repeat password</label>
          <PasswordInput id="again" autoComplete="new-password" />
        </div>
        <SubmitButton pendingLabel="Creating..." className="btn btn-primary btn-block">Sign up</SubmitButton>
      </form>
      <p className="type-body mt-8 text-center text-slate-brand">
        Already have an account? <Link href="/login" className="font-semibold text-wine hover:underline">Log in</Link>
      </p>
    </AuthCard>
  );
}
