import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE = "mpss_session";
const TTL_MS = 1000 * 60 * 60 * 24 * 14;

export function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb) && a.length === b.length;
}

/** Fails closed: an unset or empty expected token never matches. */
export function checkToken(provided: string | null | undefined, expected = process.env.INGEST_TOKEN): boolean {
  if (!expected || !provided) return false;
  return safeEqual(provided, expected);
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET must be set (16+ chars)");
  return s;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function makeSessionValue(now = Date.now()): { value: string; csrf: string } {
  const csrf = crypto.randomBytes(16).toString("base64url");
  const payload = `${now + TTL_MS}.${csrf}`;
  return { value: `${payload}.${sign(payload)}`, csrf };
}

export function readSessionValue(value: string | undefined, now = Date.now()): { csrf: string } | null {
  if (!value) return null;
  const [exp, csrf, mac] = value.split(".");
  if (!exp || !csrf || !mac) return null;
  if (!safeEqual(sign(`${exp}.${csrf}`), mac)) return null;
  if (Number(exp) < now) return null;
  return { csrf };
}

export async function getSession() {
  const jar = await cookies();
  return readSessionValue(jar.get(COOKIE)?.value);
}

export async function requireSession() {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

export async function startSession() {
  const { value } = makeSessionValue();
  const jar = await cookies();
  jar.set(COOKIE, value, { httpOnly: true, sameSite: "strict", secure: false, path: "/", maxAge: TTL_MS / 1000 });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export function checkPassword(provided: string): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  return safeEqual(provided, expected);
}

/** CSRF for forms: hidden field must equal the token bound to the session. */
export async function verifyCsrf(form: FormData): Promise<void> {
  const s = await requireSession();
  const t = String(form.get("csrf") ?? "");
  if (!safeEqual(t, s.csrf)) throw new Error("Invalid CSRF token");
}
