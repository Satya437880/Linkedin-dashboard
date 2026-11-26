"use server";
import { redirect } from "next/navigation";
import { MIN_PASSWORD, approveAccount, checkPassword, normalizeEmail, removeAccount, setPassword } from "@/server/auth/accounts";
import { startSession, verifyCsrf } from "@/server/auth/auth";
import { getBundle } from "@/server/db/client";

export async function changeMyPassword(form: FormData) {
  const s = await verifyCsrf(form);
  const password = String(form.get("password") ?? "");
  if (!(await checkPassword(getBundle().db, s.email, String(form.get("current") ?? "")))) redirect("/settings?account=wrong");
  if (password.length < MIN_PASSWORD || password.length > 200) redirect("/settings?account=short");
  const version = await setPassword(getBundle().db, s.email, password);
  await startSession(s.email, version);
  redirect("/settings?account=changed");
}

/** Admin only: approve a pending account, or remove one (never your own). */
export async function manageAccount(form: FormData) {
  const s = await verifyCsrf(form);
  if (!s.admin) throw new Error("Admins only");
  const email = normalizeEmail(String(form.get("email") ?? ""));
  if (form.get("do") === "approve") await approveAccount(getBundle().db, email);
  else if (email !== s.email) await removeAccount(getBundle().db, email);
  redirect("/settings?account=saved");
}
