/**
 * Create or reset an admin login.
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... npx tsx --env-file=.env.local scripts/set-password.mts
 */
import { MIN_PASSWORD, normalizeEmail, upsertAdmin, validEmail } from "../src/server/auth/accounts";
import { getBundle } from "../src/server/db/client";

async function main() {
  const email = normalizeEmail(process.env.ADMIN_EMAIL ?? "");
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!validEmail(email) || password.length < MIN_PASSWORD) {
    console.error(`Set ADMIN_EMAIL and ADMIN_PASSWORD (${MIN_PASSWORD}+ characters).`);
    process.exit(1);
  }
  await upsertAdmin(getBundle().db, email, password);
  console.log("Admin login saved.");
  process.exit(0);
}

void main();
