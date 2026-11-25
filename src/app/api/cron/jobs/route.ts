import { NextResponse } from "next/server";
import { safeEqual } from "@/server/auth/auth";
import { drainJobs } from "@/server/jobs/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`. Runs any queued analysis jobs. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!secret || !given || !safeEqual(given, secret)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const ran = await drainJobs(undefined, { maxJobs: 100, maxMs: 20_000 });
  return NextResponse.json({ ok: true, ran });
}
