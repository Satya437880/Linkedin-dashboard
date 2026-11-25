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
  jar.set(COOKIE, value, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: TTL_MS / 1000 });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

const PW_KEY = "app_password_hash";
type PwHash = { salt: string; hash: string };

function scrypt(pw: string, salt: string): string {
  return crypto.scryptSync(pw, salt, 32).toString("hex");
}

/** A password set through "Forgot password" is stored hashed in the database and wins over APP_PASSWORD. */
export async function checkPassword(provided: string): Promise<boolean> {
  const { eq, db, settings } = await store();
  const row = (await db.select().from(settings).where(eq(settings.key, PW_KEY)).limit(1))[0];
  const saved = row?.value as PwHash | undefined;
  if (saved?.salt && saved.hash) return safeEqual(scrypt(provided, saved.salt), saved.hash);
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  return safeEqual(provided, expected);
}

export async function setPassword(newPassword: string): Promise<void> {
  const { db, settings } = await store();
  const salt = crypto.randomBytes(16).toString("hex");
  const value: PwHash = { salt, hash: scrypt(newPassword, salt) };
  await db.insert(settings).values({ key: PW_KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
}

/** Reset is only possible when RECOVERY_CODE is configured, and only with that exact code. */
export function recoveryEnabled(): boolean {
  return (process.env.RECOVERY_CODE ?? "").length >= 12;
}
export function checkRecoveryCode(provided: string): boolean {
  const expected = process.env.RECOVERY_CODE ?? "";
  return expected.length >= 12 && safeEqual(provided.trim(), expected);
}

/** CSRF for forms: hidden field must equal the token bound to the session. */
export async function verifyCsrf(form: FormData): Promise<void> {
  const s = await requireSession();
  const t = String(form.get("csrf") ?? "");
  if (!safeEqual(t, s.csrf)) throw new Error("Invalid CSRF token");
}

// ---- login throttling: stored in the database so it holds across serverless instances
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60_000;
type Attempts = { fails: number; until: number; last?: number };

async function store() {
  const [{ eq }, { getDb }, { settings }] = await Promise.all([import("drizzle-orm"), import("../db/client"), import("../db/schema")]);
  return { eq, db: getDb(), settings };
}

async function clientKey(): Promise<string> {
  const { headers } = await import("next/headers");
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  return `login:${ip}`;
}

/** Returns minutes left when this client is locked out, otherwise 0. */
export async function loginLockedMinutes(): Promise<number> {
  const key = await clientKey();
  const { eq, db, settings } = await store();
  const row = (await db.select().from(settings).where(eq(settings.key, key)).limit(1))[0];
  const a = row?.value as Attempts | undefined;
  return a && a.until > Date.now() ? Math.ceil((a.until - Date.now()) / 60_000) : 0;
}

export async function recordLoginFailure(): Promise<void> {
  const key = await clientKey();
  const { eq, db, settings } = await store();
  const row = (await db.select().from(settings).where(eq(settings.key, key)).limit(1))[0];
  const prev = row?.value as Attempts | undefined;
  // Failures count together while they keep arriving within the lock window; a long quiet gap starts fresh.
  const fresh = !prev || Date.now() - (prev.last ?? 0) > LOCK_MS;
  const fails = (fresh ? 0 : prev.fails) + 1;
  const value: Attempts = { fails, last: Date.now(), until: fails >= MAX_FAILS ? Date.now() + LOCK_MS : 0 };
  await db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
}

export async function clearLoginFailures(): Promise<void> {
  const { eq, db, settings } = await store();
  await db.delete(settings).where(eq(settings.key, await clientKey()));
}
