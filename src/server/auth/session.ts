import crypto from "node:crypto";

/* Signed session cookie. No database or Next imports, so the proxy can use it on every request. */

export const COOKIE = "mpss_session";
export const TTL_MS = 1000 * 60 * 60 * 24 * 14;

export function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb) && a.length === b.length;
}

/** SESSION_SECRET when set; otherwise a separate key derived from CRON_SECRET, so hosting needs no new setting. */
function secret(): string {
  const own = process.env.SESSION_SECRET ?? "";
  if (own.length >= 16) return own;
  const base = process.env.CRON_SECRET ?? "";
  if (base.length >= 16) return crypto.createHmac("sha256", base).update("mpss-session").digest("hex");
  throw new Error("Set SESSION_SECRET or CRON_SECRET (16+ characters)");
}

const sign = (payload: string) => crypto.createHmac("sha256", secret()).update(payload).digest("base64url");

export type SessionData = { email: string; version: string; csrf: string };

export function makeSessionValue(email: string, version: string, now = Date.now()): string {
  const csrf = crypto.randomBytes(16).toString("base64url");
  const payload = `${now + TTL_MS}.${csrf}.${Buffer.from(email).toString("base64url")}.${version}`;
  return `${payload}.${sign(payload)}`;
}

export function readSessionValue(value: string | undefined, now = Date.now()): SessionData | null {
  const parts = value?.split(".") ?? [];
  if (parts.length !== 5) return null;
  const [exp, csrf, who, version, mac] = parts;
  if (!safeEqual(sign(`${exp}.${csrf}.${who}.${version}`), mac)) return null;
  if (Number(exp) < now) return null;
  return { email: Buffer.from(who, "base64url").toString(), version, csrf };
}
