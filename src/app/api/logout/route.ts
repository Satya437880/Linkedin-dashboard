import { NextResponse } from "next/server";
import { endSession, verifyCsrf } from "@/server/auth/auth";

export async function POST(req: Request) {
  await verifyCsrf(await req.formData());
  await endSession();
  return NextResponse.redirect(new URL("/login", req.url), 303);
}
