import { NextRequest } from "next/server";
import { getOrderStore } from "@/lib/order-store";
import { json, failure, identity, mutation } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: NextRequest) {
  try { return json({ orders: getOrderStore().list(identity(request).owner) }); }
  catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    const { who, input } = await mutation(request);
    return json({ order: getOrderStore().create(who.owner, request.headers.get("idempotency-key") || "", input) }, 201);
  } catch (error) { return failure(error); }
}
