import crypto from "node:crypto";
import { eq, like } from "drizzle-orm";
import type { Db } from "../db/client";
import { settings } from "../db/schema";
import { safeEqual } from "./session";

/*
 * Accounts live in the settings table under "user:<email>". Only a scrypt hash of each password is stored.
 * Anyone can ask for an account, but it cannot sign in until an admin approves it.
 */

export const MIN_PASSWORD = 8;
const MAX_PENDING = 20;
const PREFIX = "user:";

export type Account = { salt: string; hash: string; status: "active" | "pending"; admin: boolean; version: string; createdAt: string };
export type AccountRow = Account & { email: string };

export const normalizeEmail = (raw: string) => raw.trim().toLowerCase();
export const validEmail = (email: string) => email.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const scrypt = (pw: string, salt: string) => crypto.scryptSync(pw, salt, 32).toString("hex");

/** A new version signs the account out everywhere. */
function passwordFields(pw: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  return { salt, hash: scrypt(pw, salt), version: crypto.randomBytes(8).toString("hex") };
}

export async function getAccount(db: Db, email: string): Promise<AccountRow | null> {
  const row = (await db.select().from(settings).where(eq(settings.key, PREFIX + email)).limit(1))[0];
  return row ? { ...(row.value as Account), email } : null;
}

export async function listAccounts(db: Db): Promise<AccountRow[]> {
  const rows = await db.select().from(settings).where(like(settings.key, `${PREFIX}%`));
  return rows
    .map((r) => ({ ...(r.value as Account), email: r.key.slice(PREFIX.length) }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

async function update(db: Db, email: string, change: Partial<Account>): Promise<boolean> {
  const current = await getAccount(db, email);
  if (!current) return false;
  const { email: key, ...value } = { ...current, ...change };
  await db.update(settings).set({ value }).where(eq(settings.key, PREFIX + key));
  return true;
}

export async function requestAccount(db: Db, email: string, password: string): Promise<"ok" | "exists" | "full"> {
  if ((await listAccounts(db)).filter((a) => a.status === "pending").length >= MAX_PENDING) return "full";
  const value: Account = { ...passwordFields(password), status: "pending", admin: false, createdAt: new Date().toISOString() };
  const added = await db.insert(settings).values({ key: PREFIX + email, value }).onConflictDoNothing().returning({ key: settings.key });
  return added.length ? "ok" : "exists";
}

/** Returns the account only when the password is right. The caller still has to check `status`. */
export async function checkPassword(db: Db, email: string, password: string): Promise<AccountRow | null> {
  const account = await getAccount(db, email);
  // Hash even for an unknown email so both cases take the same time.
  const hash = scrypt(password, account?.salt ?? "no-such-account");
  return account && safeEqual(hash, account.hash) ? account : null;
}

export async function setPassword(db: Db, email: string, password: string): Promise<string> {
  const fields = passwordFields(password);
  if (!(await update(db, email, fields))) throw new Error("No such account");
  return fields.version;
}

export async function approveAccount(db: Db, email: string): Promise<void> {
  await update(db, email, { status: "active" });
}

export async function removeAccount(db: Db, email: string): Promise<void> {
  await db.delete(settings).where(eq(settings.key, PREFIX + email));
}

/** Creates or resets an admin. Used by scripts/set-password.mts only. */
export async function upsertAdmin(db: Db, email: string, password: string): Promise<void> {
  const value: Account = { ...passwordFields(password), status: "active", admin: true, createdAt: new Date().toISOString() };
  await db.insert(settings).values({ key: PREFIX + email, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
}
