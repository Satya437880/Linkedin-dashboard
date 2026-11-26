import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/AuthCard";
import { PasswordInput } from "@/components/PasswordInput";
import { SubmitButton } from "@/components/SubmitButton";
import { checkPassword, normalizeEmail } from "@/server/auth/accounts";
import { getSession, startSession } from "@/server/auth/auth";
import { clearFailures, isLocked, recordFailure } from "@/server/auth/throttle";
import { getBundle } from "@/server/db/client";

async function login(form: FormData) {
  "use server";
  const email = normalizeEmail(String(form.get("email") ?? ""));
  const password = String(form.get("password") ?? "");
  if (await isLocked()) redirect("/login?error=locked");
  if (!email || !password) redirect("/login?error=empty");
  const account = await checkPassword(getBundle().db, email, password);
  if (!account) {
    await recordFailure();
    redirect("/login?error=wrong");
  }
  if (account.status !== "active") redirect("/login?error=pending");
  await clearFailures();
  await startSession(account.email, account.version);
  redirect("/dashboard");
}

const MESSAGES: Record<string, string> = {
  empty: "Enter your email and password.",
  wrong: "That email or password is not correct.",
  locked: "Too many wrong attempts. Wait 15 minutes and try again.",
  pending: "Your account is waiting for an admin to approve it.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; requested?: string }> }) {
  const { error, requested } = await searchParams;
  if (await getSession()) redirect("/dashboard");
  return (
    <AuthCard title="Log in to LinkedIn Dashboard">
      {requested && <p role="status" className="type-body mb-6 rounded-xl bg-success-bg p-3 text-success">Account created. You can log in once an admin approves it.</p>}
      {error && <p role="alert" className="type-body mb-6 rounded-xl bg-danger-bg p-3 text-danger">{MESSAGES[error] ?? MESSAGES.wrong}</p>}
      <form action={login} className="flex flex-col gap-5">
        <div className="field">
          <label htmlFor="email" className="field-label">Email</label>
          <input id="email" name="email" type="email" autoComplete="username" required autoFocus className="input" />
        </div>
        <div className="field">
          <label htmlFor="password" className="field-label">Password</label>
          <PasswordInput id="password" autoComplete="current-password" />
        </div>
        <Link href="/forgot" className="self-end font-medium text-wine hover:underline">Forgot password?</Link>
        <SubmitButton pendingLabel="Logging in..." className="btn btn-primary btn-block">Log in</SubmitButton>
      </form>
      <p className="type-body mt-8 text-center text-slate-brand">
        Don&apos;t have an account? <Link href="/signup" className="font-semibold text-wine hover:underline">Sign up</Link>
      </p>
    </AuthCard>
  );
}
