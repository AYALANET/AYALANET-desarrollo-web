import { NextRequest, NextResponse } from "next/server";
import { getOrderStore } from "@/lib/order-store";
import { OrderError } from "@/lib/order-domain";
import { hasAllowedOrigin, limitedJson, SESSION_COOKIE, validSession } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export function GET(request: NextRequest) {
  const session = request.cookies.get(SESSION_COOKIE)?.value;
  if (!validSession(session)) return NextResponse.json({ error: "Abre una sesión de tienda." }, { status: 401, headers });
  try { return NextResponse.json({ orders: getOrderStore().list(session) }, { headers }); }
  catch { return NextResponse.json({ error: "No pudimos consultar tus pedidos." }, { status: 503, headers }); }
}

export async function POST(request: NextRequest) {
  if (!hasAllowedOrigin(request)) return NextResponse.json({ error: "Origen no permitido." }, { status: 403, headers });
  const session = request.cookies.get(SESSION_COOKIE)?.value;
  if (!validSession(session)) return NextResponse.json({ error: "Abre una sesión de tienda." }, { status: 401, headers });
  try {
    const input = await limitedJson(request);
    const order = getOrderStore().create(session, request.headers.get("idempotency-key") || "", input);
    return NextResponse.json({ order }, { status: 201, headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof OrderError ? error.message : "No pudimos guardar el pedido. Puedes reintentar sin duplicarlo." }, { status: error instanceof OrderError ? error.status : 503, headers });
  }
}
