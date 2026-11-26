import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getBundle } from "../db/client";
import { getAccount } from "./accounts";
import { COOKIE, TTL_MS, makeSessionValue, readSessionValue, safeEqual } from "./session";

export { safeEqual };

/** Fails closed: an unset or empty expected token never matches. */
export function checkToken(provided: string | null | undefined, expected = process.env.INGEST_TOKEN): boolean {
  if (!expected || !provided) return false;
  return safeEqual(provided, expected);
}

/** The signed cookie must still match a live, approved account, so removing someone signs them out. */
export const getSession = cache(async () => {
  const data = readSessionValue((await cookies()).get(COOKIE)?.value);
  if (!data) return null;
  const account = await getAccount(getBundle().db, data.email);
  if (!account || account.status !== "active" || account.version !== data.version) return null;
  return { email: account.email, admin: account.admin, csrf: data.csrf };
});

export async function requireSession() {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

export async function startSession(email: string, version: string) {
  (await cookies()).set(COOKIE, makeSessionValue(email, version), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: TTL_MS / 1000,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

/** Every action that changes data calls this: signed in, and the form carries the token bound to the session. */
export async function verifyCsrf(form: FormData) {
  const s = await requireSession();
  if (!safeEqual(String(form.get("csrf") ?? ""), s.csrf)) throw new Error("Invalid CSRF token");
  return s;
}
