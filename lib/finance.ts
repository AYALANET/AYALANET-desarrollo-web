import { OrderError } from "./order-domain.ts";

// Six decimal places for reporting USDT. No floating-point arithmetic for amounts.
export const MICRO_USDT = 1_000_000;
export function parseUsdt(value: unknown) {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,8})(\.[0-9]{1,6})?$/.test(value)) throw new OrderError("Escribe un importe USDT positivo con hasta seis decimales.");
  const [whole, decimal = ""] = value.split(".");
  const amount = Number(whole) * MICRO_USDT + Number(decimal.padEnd(6, "0"));
  if (!Number.isSafeInteger(amount)) throw new OrderError("Importe fuera de rango.");
  return amount;
}
export function usdtText(micros: number) {
  const amount = BigInt(micros), sign = amount < 0n ? "-" : "", positive = amount < 0n ? -amount : amount;
  return `${sign}${positive / 1_000_000n}.${(positive % 1_000_000n).toString().padStart(6, "0")}`;
}
export function formatUsdt(micros: number) { return (micros / MICRO_USDT).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 6 }); }
export function marginBps(profit: number, revenue: number) { return revenue > 0 ? Number(BigInt(profit) * 10000n / BigInt(revenue)) : null; }
export const eventKinds = ["sale", "purchase", "fee", "refund", "purchase_refund", "expense"] as const;
export type FinanceKind = typeof eventKinds[number];
export type FinanceEntry = { source: string; externalId: string; orderId: string; kind: FinanceKind; amountMicros: number; currency: "USDT"; occurredAt: string };
export type FinanceTotals = { sales: number; purchases: number; fees: number; refunds: number; purchaseRefunds: number; expenses: number; netSales: number; netPurchases: number; profit: number; marginBps: number | null };
const empty = (): FinanceTotals => ({ sales: 0, purchases: 0, fees: 0, refunds: 0, purchaseRefunds: 0, expenses: 0, netSales: 0, netPurchases: 0, profit: 0, marginBps: null });
const column: Record<FinanceKind, "sales" | "purchases" | "fees" | "refunds" | "purchaseRefunds" | "expenses"> = { sale: "sales", purchase: "purchases", fee: "fees", refund: "refunds", purchase_refund: "purchaseRefunds", expense: "expenses" };
function safe(value: number) { if (!Number.isSafeInteger(value)) throw new OrderError("El informe supera el límite de cálculo exacto."); return value; }
function finish(totals: FinanceTotals) {
  totals.netSales = safe(totals.sales - totals.refunds);
  totals.netPurchases = safe(totals.purchases - totals.purchaseRefunds);
  totals.profit = safe(Number(BigInt(totals.netSales) - BigInt(totals.netPurchases) - BigInt(totals.fees) - BigInt(totals.expenses)));
  totals.marginBps = marginBps(totals.profit, totals.netSales);
  return totals;
}
export function financeRange(from: string, to: string) {
  for (const day of [from, to]) {
    if (!/^20\d{2}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day) throw new OrderError("Elige fechas válidas.");
  }
  const start = Date.parse(`${from}T00:00:00.000Z`), end = Date.parse(`${to}T00:00:00.000Z`) + 86400_000;
  if (end <= start || end - start > 366 * 86400_000) throw new OrderError("El período debe tener entre 1 y 366 días.");
  return { from, to, start, end };
}
export function validateEntry(entry: FinanceEntry) {
  if (!entry || entry.currency !== "USDT" || !eventKinds.includes(entry.kind) || !Number.isSafeInteger(entry.amountMicros) || entry.amountMicros <= 0 || entry.amountMicros > 999_999_999_999_999) throw new OrderError("Movimiento financiero no válido.");
  for (const field of [entry.source, entry.externalId, entry.orderId]) if (typeof field !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(field)) throw new OrderError("Referencia financiera no válida.");
  if (typeof entry.occurredAt !== "string" || !Number.isFinite(Date.parse(entry.occurredAt)) || new Date(entry.occurredAt).toISOString() !== entry.occurredAt) throw new OrderError("Fecha financiera no válida.");
}
export function financeReport(entries: FinanceEntry[], from: string, to: string) {
  const range = financeRange(from, to), totals = empty();
  const orders = new Map<string, FinanceTotals>(), days = new Map<string, FinanceTotals>();
  const selected: FinanceEntry[] = [];
  for (const entry of entries) {
    validateEntry(entry);
    const time = Date.parse(entry.occurredAt);
    if (time < range.start || time >= range.end) continue;
    selected.push(entry);
    const order = orders.get(entry.orderId) || empty(), day = entry.occurredAt.slice(0, 10), daily = days.get(day) || empty();
    for (const row of [totals, order, daily]) row[column[entry.kind]] = safe(row[column[entry.kind]] + entry.amountMicros);
    orders.set(entry.orderId, order); days.set(day, daily);
  }
  return { from, to, currency: "USDT" as const, timezone: "UTC", totals: finish(totals), count: selected.length,
    orders: [...orders].map(([orderId, total]) => ({ orderId, ...finish(total) })).sort((a, b) => a.orderId.localeCompare(b.orderId)),
    days: [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, total]) => ({ date, ...finish(total) })), entries: selected };
}
export function financeCsv(entries: FinanceEntry[]) {
  const quote = (value: string) => `"${(/^[=+\-@\t\r]/.test(value) ? "'" + value : value).replaceAll('"', '""')}"`;
  const labels: Record<FinanceKind, string> = { sale: "Cobro", purchase: "Compra a proveedor", fee: "Comisión", refund: "Devolución al cliente", purchase_refund: "Reintegro del proveedor", expense: "Gasto" };
  return "\uFEFF" + [["Fecha UTC", "Pedido", "Tipo", "Importe USDT", "Origen", "Referencia"], ...entries.map(e => [e.occurredAt, e.orderId, labels[e.kind], usdtText(e.amountMicros), e.source, e.externalId])].map(row => row.map(quote).join(",")).join("\r\n") + "\r\n";
}
