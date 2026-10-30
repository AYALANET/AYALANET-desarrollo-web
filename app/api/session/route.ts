import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, validSession } from "@/lib/http";

export const runtime = "nodejs";
export function GET(request: NextRequest) {
  const response = NextResponse.json({ ready: true }, { headers: { "Cache-Control": "no-store" } });
  if (!validSession(request.cookies.get(SESSION_COOKIE)?.value)) {
    response.cookies.set(SESSION_COOKIE, randomBytes(32).toString("hex"), { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 86400 });
  }
  return response;
}
