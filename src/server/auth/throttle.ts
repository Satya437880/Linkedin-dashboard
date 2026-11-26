import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getBundle } from "../db/client";
import { settings } from "../db/schema";

// Stored in the database so the lock holds across serverless instances.
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60_000;
type Attempts = { fails: number; until: number; last?: number };

async function clientKey(): Promise<string> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  return `login:${ip}`;
}

const read = async (key: string) =>
  (await getBundle().db.select().from(settings).where(eq(settings.key, key)).limit(1))[0]?.value as Attempts | undefined;

export async function isLocked(): Promise<boolean> {
  const a = await read(await clientKey());
  return !!a && a.until > Date.now();
}

export async function recordFailure(): Promise<void> {
  const key = await clientKey();
  const prev = await read(key);
  // Failures count together while they keep arriving within the lock window; a long quiet gap starts fresh.
  const fresh = !prev || Date.now() - (prev.last ?? 0) > LOCK_MS;
  const fails = (fresh ? 0 : prev.fails) + 1;
  const value: Attempts = { fails, last: Date.now(), until: fails >= MAX_FAILS ? Date.now() + LOCK_MS : 0 };
  await getBundle().db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
}

export async function clearFailures(): Promise<void> {
  await getBundle().db.delete(settings).where(eq(settings.key, await clientKey()));
}
