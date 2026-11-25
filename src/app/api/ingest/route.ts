import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { checkToken } from "@/server/auth/auth";
import { getBundle } from "@/server/db/client";
import { ingestEvent } from "@/server/ingest/ingestEvent";
import { drainJobs } from "@/server/jobs/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-ingest-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  if (!checkToken(req.headers.get("x-ingest-token"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: CORS });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: CORS });
  }
  try {
    const b = getBundle();
    const result = await ingestEvent(b, body);
    // No background process on Vercel: analyse what just arrived before the function exits.
    await drainJobs(b, { maxJobs: 12, maxMs: 6_000 }).catch((e) => console.error("job drain failed", e));
    return NextResponse.json({ ok: true, result }, { headers: CORS });
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json({ error: "invalid_event", issues: e.issues }, { status: 400, headers: CORS });
    }
    console.error("ingest failed", e);
    return NextResponse.json({ error: "server_error" }, { status: 500, headers: CORS });
  }
}
