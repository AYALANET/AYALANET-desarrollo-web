import { NextRequest, NextResponse } from "next/server";
import { getIdentityStore, type Identity } from "./identity-store";
import { OrderError } from "./order-domain";
import { hasAllowedOrigin, limitedJson, SESSION_COOKIE } from "./http";

export function json(value: unknown, status = 200) { return NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } }); }
export function failure(error: unknown) { return json({ error: error instanceof OrderError ? error.message : "No pudimos completar la operación. Inténtalo de nuevo." }, error instanceof OrderError ? error.status : 503); }
export function identity(request: NextRequest): Identity {
  const value = getIdentityStore().read(request.cookies.get(SESSION_COOKIE)?.value);
  if (!value) throw new OrderError("La sesión venció. Recarga la página e inicia sesión de nuevo.", 401);
  return value;
}
export function sessionResponse(session: Identity, recoveryKey?: string) {
  const response = json({ ready: true, account: session.account, ...(recoveryKey ? { recoveryKey } : {}) });
  response.cookies.set(SESSION_COOKIE, session.token, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 7 * 86400 });
  return response;
}
export async function mutation(request: NextRequest, maxBytes = 16_384) {
  if (!hasAllowedOrigin(request)) throw new OrderError("Origen no permitido.", 403);
  const who = identity(request), raw = await limitedJson(request, maxBytes);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new OrderError("Solicitud no válida.");
  return { who, input: raw as Record<string, unknown> };
}
