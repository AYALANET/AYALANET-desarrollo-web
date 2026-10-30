import { NextRequest } from "next/server";
import { mutation, failure, sessionResponse } from "@/lib/api";
import { getIdentityStore } from "@/lib/identity-store";
import { OrderError } from "@/lib/order-domain";

export const runtime = "nodejs";
export async function POST(request: NextRequest, context: { params: Promise<{ action: string }> }) {
  try {
    const { who, input } = await mutation(request), { action } = await context.params;
    if (Object.keys(input).some(k => !["username", "password", "name", "recoveryKey"].includes(k))) throw new OrderError("Datos de cuenta no válidos.");
    const store = getIdentityStore();
    if (action === "logout") return sessionResponse(store.logout(who));
    if (action !== "register" && action !== "login" && action !== "recover") throw new OrderError("Operación no disponible.", 404);
    const result = await store[action](who, input);
    return sessionResponse(result.identity, "recoveryKey" in result && typeof result.recoveryKey === "string" ? result.recoveryKey : undefined);
  } catch (error) { return failure(error); }
}
