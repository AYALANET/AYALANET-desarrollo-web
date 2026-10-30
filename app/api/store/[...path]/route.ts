import { NextRequest } from "next/server";
import { getOrderStore } from "@/lib/order-store";
import { getIdentityStore } from "@/lib/identity-store";
import { OrderError } from "@/lib/order-domain";
import { json, failure, identity, mutation } from "@/lib/api";
import { getFinanceStore } from "@/lib/finance-store";
import { getCommerceStore } from "@/lib/commerce-store";
import { financeCsv } from "@/lib/finance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
export async function GET(request: NextRequest, context: Context) {
  try {
    const { path } = await context.params, store = getOrderStore();
    if (path.length === 1 && path[0] === "catalog") return json({ products: store.catalog().filter(p => p.active !== false) });
    const who = identity(request);
    if (path.length === 2 && path[0] === "admin" && path[1] === "finance") {
      getIdentityStore().requireAdmin(who);
      const now = new Date().toISOString().slice(0, 10), from = request.nextUrl.searchParams.get("from") || now.slice(0, 7) + "-01", to = request.nextUrl.searchParams.get("to") || now;
      const finance = getFinanceStore(), report = finance.report(from, to);
      if (request.nextUrl.searchParams.get("format") === "csv") return new Response(financeCsv(report.entries), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="ayalanet-finanzas-${from}-${to}.csv"`, "Cache-Control": "no-store" } });
      return json({ report, projections: finance.projections(store.catalog()), integrationStatus: "not_connected" });
    }
    if (path.length === 1 && path[0] === "wallet") return json(getCommerceStore().wallet(who.owner));
    if (path.length === 2 && path[0] === "admin" && path[1] === "inventory") { getIdentityStore().requireAdmin(who); return json(getCommerceStore().summary(who.owner)); }
    if (path.length === 1 && path[0] === "support") return json({ tickets: store.tickets(who.owner) });
    if (path.length === 2 && path[0] === "orders") return json({ order: store.get(who.owner, path[1]) });
    if (path.length === 2 && path[0] === "support") return json({ ticket: store.ticket(who.owner, path[1]) });
    if (path.length === 1 && path[0] === "admin") { getIdentityStore().requireAdmin(who); return json(store.adminSummary()); }
    throw new OrderError("Página no encontrada.", 404);
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    const { path } = await context.params;
    const bulk = path[0] === "admin" && path[1] === "inventory";
    if (bulk) getIdentityStore().requireAdmin(identity(request));
    const { who, input } = await mutation(request, bulk ? 262_144 : 16_384);
    const only = (...fields: string[]) => { if (Object.keys(input).some(k => !fields.includes(k))) throw new OrderError("Datos de operación no válidos."); };
    const store = getOrderStore(), key = request.headers.get("idempotency-key") || "";
    if (path.length === 1 && path[0] === "wallet") {
      if (input.action === "demo_credit") { only("action"); return json(getCommerceStore().demoCredit(who.owner)); }
      if (input.action === "topup") { only("action", "amount"); return json(getCommerceStore().requestTopup(who.owner, key, input.amount), 201); }
    }
    if (path.length === 2 && path[0] === "orders" && ["demo_purchase", "reveal"].includes(String(input.action))) {
      only("action");
      return input.action === "reveal" ? json({ deliveries: getCommerceStore().reveal(who.owner, path[1]) }) : json({ order: getCommerceStore().purchase(who.owner, path[1]) });
    }
    if (path.length === 2 && path[0] === "orders" && input.action === "cancel") return json({ order: store.cancel(who.owner, path[1]) });
    if (path.length === 1 && path[0] === "support") return json({ ticket: store.createTicket(who.owner, key, input) }, 201);
    const admin = path[0] === "admin";
    if (admin) getIdentityStore().requireAdmin(who);
    if (admin && path.length === 3 && path[1] === "inventory") {
      if (path[2] === "preview") return json(getCommerceStore().preview(who.owner, input));
      if (path[2] === "import") return json(getCommerceStore().import(who.owner, key, input), 201);
      if (path[2] === "block") { only("id", "blocked"); if (typeof input.id !== "string" || typeof input.blocked !== "boolean") throw new OrderError("Unidad no válida."); return json(getCommerceStore().block(who.owner, input.id, input.blocked)); }
    }
    if (admin && path.length === 3 && path[1] === "refund") { only("action"); if (input.action !== "demo_refund") throw new OrderError("Devolución no válida."); return json(getCommerceStore().refund(who.owner, path[2])); }
    if (admin && path.length === 3 && path[1] === "costs") { getFinanceStore().updateEstimate(who.owner, path[2], input); return json({ saved: true }); }
    if (path.length === 2 && (path[0] === "support" || admin)) {
      if (input.action === "reply") return json({ ticket: store.reply(who.owner, path[1], key, input.message, admin) });
      if (input.action === "close") return json({ ticket: store.closeTicket(who.owner, path[1], admin) });
      if (admin && input.action === "product" && input.product && typeof input.product === "object" && !Array.isArray(input.product)) return json({ products: store.updateProduct(who.owner, path[1], input.product as Record<string, unknown>) });
    }
    throw new OrderError("Operación no disponible.", 400);
  } catch (error) { return failure(error); }
}
