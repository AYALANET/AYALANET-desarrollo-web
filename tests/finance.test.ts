import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { financeReport, financeRange, financeCsv, parseUsdt, usdtText, type FinanceEntry, type FinanceKind } from "../lib/finance.ts";
import { createFinanceStore } from "../lib/finance-store.ts";
import { createOrderStore } from "../lib/order-store.ts";

const owner = "a".repeat(64);
const entry = (kind: FinanceKind, amount: string, id = kind as string, when = "2026-10-30T12:00:00.000Z"): FinanceEntry => ({ source: "fixture", externalId: id, orderId: "ORDER-TEST-1", kind, currency: "USDT", amountMicros: parseUsdt(amount), occurredAt: when });
test("ventas, compras, comisiones, devoluciones y reintegros producen el resultado exacto", () => {
  const result = financeReport([entry("sale", "100"), entry("purchase", "60"), entry("fee", "2.000001"), entry("refund", "10"), entry("purchase_refund", "5"), entry("expense", "3")], "2026-10-01", "2026-10-31");
  assert.equal(result.totals.netSales, parseUsdt("90")); assert.equal(result.totals.netPurchases, parseUsdt("55"));
  assert.equal(result.totals.profit, parseUsdt("29.999999")); assert.equal(result.totals.marginBps, 3333);
  assert.equal(result.orders[0].profit, result.totals.profit); assert.equal(result.days[0].profit, result.totals.profit);
});
test("pérdidas, ausencia de ventas y devoluciones sin cobros del período no muestran margen falso", () => {
  const loss = financeReport([entry("sale", "10"), entry("purchase", "12"), entry("fee", "1")], "2026-10-30", "2026-10-30");
  assert.equal(loss.totals.profit, -parseUsdt("3")); assert.equal(loss.totals.marginBps, -3000);
  const refundOnly = financeReport([entry("refund", "5")], "2026-10-30", "2026-10-30");
  assert.equal(refundOnly.totals.profit, -parseUsdt("5")); assert.equal(refundOnly.totals.marginBps, null);
  assert.equal(financeReport([], "2026-10-30", "2026-10-30").totals.marginBps, null);
});
test("el período incluye exactamente ambos días UTC y rechaza fechas imposibles", () => {
  const report = financeReport([entry("sale", "1", "before", "2026-10-29T23:59:59.999Z"), entry("sale", "2", "start", "2026-10-30T00:00:00.000Z"), entry("sale", "3", "end", "2026-10-30T23:59:59.999Z"), entry("sale", "4", "after", "2026-10-31T00:00:00.000Z")], "2026-10-30", "2026-10-30");
  assert.equal(report.count, 2); assert.equal(report.totals.sales, parseUsdt("5"));
  for (const [from, to] of [["2026-02-30", "2026-03-01"], ["2026-11-01", "2026-10-01"], ["2024-01-01", "2026-01-01"], ["wrong", "2026-10-30"]]) assert.throws(() => financeRange(from, to));
});
test("importes exactos de seis decimales y exportación sin redondeo ni fórmulas", () => {
  assert.equal(parseUsdt("0.000001"), 1); assert.equal(usdtText(-1), "-0.000001");
  for (const value of ["1.0000001", "-1", "1e3", "1,50", "01", "Infinity", 1.5]) assert.throws(() => parseUsdt(value));
  const csv = financeCsv([{ ...entry("fee", "0.000001"), externalId: "=SUM(1)" }]);
  assert.match(csv, /"0\.000001"/); assert.match(csv, /"'=SUM\(1\)"/);
});
test("movimientos idempotentes, persistentes e inmutables por referencia", () => {
  const dir = mkdtempSync(join(tmpdir(), "ayalanet-finance-")), file = join(dir, "finance.sqlite");
  try {
    let db = new DatabaseSync(file), finance = createFinanceStore(db);
    assert.equal(finance.record(entry("sale", "10")).duplicate, false); assert.equal(finance.record(entry("sale", "10")).duplicate, true);
    assert.throws(() => finance.record(entry("sale", "11")), /otros datos/);
    assert.throws(() => finance.record({ ...entry("fee", "1"), currency: "USD" } as unknown as FinanceEntry), /no válido/);
    db.close(); db = new DatabaseSync(file); finance = createFinanceStore(db);
    try { assert.equal(finance.report("2026-10-30", "2026-10-30").count, 1); } finally { db.close(); }
  } finally { rmSync(dir, { recursive: true }); }
});
test("borradores y estimaciones nunca crean ventas; los costes privados no alteran el catálogo público", () => {
  const db = new DatabaseSync(":memory:");
  try {
    const orders = createOrderStore(db), finance = createFinanceStore(db);
    orders.create(owner, randomUUID(), { items: [{ productId: "steam-20", quantity: 1 }] });
    assert.equal(finance.projections(orders.catalog())[0].profitMicros, null);
    finance.updateEstimate(owner, "steam-20", { costMicros: parseUsdt("18"), feeMicros: parseUsdt("0.5") });
    assert.equal(finance.projections(orders.catalog())[0].profitMicros, parseUsdt("3"));
    assert.equal(finance.report("2026-01-01", "2026-12-31").count, 0);
    assert.equal(orders.catalog()[0].priceCents, 2150); assert.equal(Object.hasOwn(orders.catalog()[0], "costMicros"), false);
    finance.updateEstimate(owner, "steam-20", { costMicros: null, feeMicros: 0 });
    assert.equal(finance.projections(orders.catalog())[0].profitMicros, null);
    assert.throws(() => finance.updateEstimate(owner, "steam-20", { costMicros: -1, feeMicros: 0 }));
    assert.throws(() => finance.updateEstimate(owner, "steam-20", { costMicros: 0, feeMicros: 0, profit: 1000 }));
  } finally { db.close(); }
});
