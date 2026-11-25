import crypto from "node:crypto";

/*
 * The dashboard has no sign-in: anyone with the link can open it. The only protected doors are the browser
 * extension's ingest endpoint (INGEST_TOKEN) and the cron endpoint (CRON_SECRET), which are separate secrets.
 * getSession / requireSession / verifyCsrf stay as no-ops so pages and forms do not need to change.
 */

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

const OPEN_SESSION = { csrf: "open" } as const;

export async function getSession() {
  return OPEN_SESSION;
}

export async function requireSession() {
  return OPEN_SESSION;
}

export async function verifyCsrf(_form: FormData): Promise<void> {
  void _form;
}
