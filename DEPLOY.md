# Deploying to Vercel + Supabase

## 1. Supabase
1. Project Settings > Database > Connection string > **Transaction pooler** (port 6543). Copy it.
2. Put it in `.env.local` as `DATABASE_URL=...` (this file is gitignored).
3. Create the tables: `npm run db:migrate`
4. Optional, keep your existing local data (74 prospects): `npm run db:copy-sqlite`
   (reads `./data/dashboard.db`, refuses to run if the target already has prospects).

Row-level security is switched on for every table by the migration, so the Supabase public REST API
cannot read anything. Only this app's server connection can.

## 2. Vercel
Import `Satya437880/Linkedin-dashboard`, branch `supabase-vercel` (or `main` once merged), then add
these Environment Variables (Production):

| Name | Value |
|---|---|
| `DATABASE_URL` | the transaction pooler string |
| `APP_PASSWORD` | a long random password |
| `SESSION_SECRET` | 32+ random characters |
| `INGEST_TOKEN` | long random string; also set it in the browser extension |
| `CRON_SECRET` | long random string (Vercel sends it to `/api/cron/jobs`) |
| `OWNER_NAME`, `APP_TIMEZONE` | optional |

Generate secrets with: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`

## 3. Browser extension
Change its server URL from `http://127.0.0.1:3000` to your Vercel URL and keep the same `INGEST_TOKEN`.

## What changed from the local version
- SQLite file -> Supabase Postgres (async queries, Postgres triggers keep the append-only audit log).
- The in-process job timer is gone. Jobs run right after each ingest, and daily via Vercel Cron.
- The app is gated by `src/proxy.ts`, login is rate-limited (5 wrong tries = 15 min lock), cookies are `Secure`,
  and search engines are told not to index it.
- Ollama is optional and unreachable from Vercel; pasted-text extraction falls back to the built-in rules.
