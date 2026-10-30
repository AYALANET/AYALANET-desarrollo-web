import { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/http";
import { getIdentityStore } from "@/lib/identity-store";
import { failure, sessionResponse } from "@/lib/api";

export const runtime = "nodejs";
export function GET(request: NextRequest) {
  try { return sessionResponse(getIdentityStore().initialize(request.cookies.get(SESSION_COOKIE)?.value)); }
  catch (error) { return failure(error); }
}
