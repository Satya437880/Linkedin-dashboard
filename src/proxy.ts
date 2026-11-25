import { NextResponse, type NextRequest } from "next/server";
import { readSessionValue } from "@/server/auth/auth";

/** One gate in front of every page, so a new page can never be left open by accident. */
const OPEN = [/^\/login(\/|$)/, /^\/api\/ingest(\/|$)/, /^\/api\/cron(\/|$)/, /^\/robots\.txt$/, /^\/icon\.png$/, /^\/logo(-full)?\.png$/];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (OPEN.some((r) => r.test(pathname))) return NextResponse.next();
  if (readSessionValue(req.cookies.get("mpss_session")?.value)) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
