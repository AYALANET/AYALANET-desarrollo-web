import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { getDatabase } from "./database.ts";
import { getOrderStore } from "./order-store.ts";
import { OrderError } from "./order-domain.ts";
import { financeRange, financeReport, marginBps, validateEntry, type FinanceEntry } from "./finance.ts";
import { products, type Product } from "./catalog.ts";

export type Projection = { productId: string; name: string; saleMicros: number; costMicros: number | null; feeMicros: number; profitMicros: number | null; marginBps: number | null };
type LedgerRow = { source: string; external_id: string; order_id: string; kind: FinanceEntry["kind"]; amount_micros: number; currency: "USDT"; occurred_at: string };
export function createFinanceStore(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS financial_entries (
    source TEXT NOT NULL, external_id TEXT NOT NULL, order_id TEXT NOT NULL, kind TEXT NOT NULL,
    amount_micros INTEGER NOT NULL CHECK(amount_micros>0), currency TEXT NOT NULL CHECK(currency='USDT'), occurred_at TEXT NOT NULL,
    PRIMARY KEY(source,external_id));
    CREATE INDEX IF NOT EXISTS financial_date ON financial_entries(occurred_at);
    CREATE TABLE IF NOT EXISTS cost_estimates (product_id TEXT PRIMARY KEY,cost_micros INTEGER,fee_micros INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS store_audit (id INTEGER PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL,created_at TEXT NOT NULL);`);
  return {
    // Internal accounting boundary only. No HTTP route records money, and no live adapter calls this yet.
    // Adapters must verify the external evidence, currency and order association before recording an entry.
    record(entry: FinanceEntry) {
      validateEntry(entry);
      db.exec("BEGIN IMMEDIATE");
      try {
        const previous = db.prepare("SELECT * FROM financial_entries WHERE source=? AND external_id=?").get(entry.source, entry.externalId) as LedgerRow | undefined;
        if (previous) {
          if (previous.order_id !== entry.orderId || previous.kind !== entry.kind || previous.amount_micros !== entry.amountMicros || previous.currency !== entry.currency || previous.occurred_at !== entry.occurredAt) throw new OrderError("La referencia financiera ya existe con otros datos.", 409);
          db.exec("COMMIT"); return { duplicate: true };
        }
        db.prepare("INSERT INTO financial_entries VALUES(?,?,?,?,?,?,?)").run(entry.source, entry.externalId, entry.orderId, entry.kind, entry.amountMicros, entry.currency, entry.occurredAt);
        db.exec("COMMIT"); return { duplicate: false };
      } catch (error) { db.exec("ROLLBACK"); throw error; }
    },
    report(from: string, to: string) {
      const range = financeRange(from, to);
      const rows = db.prepare("SELECT * FROM financial_entries WHERE occurred_at>=? AND occurred_at<? ORDER BY occurred_at,source,external_id LIMIT 100001").all(new Date(range.start).toISOString(), new Date(range.end).toISOString()) as LedgerRow[];
      if (rows.length > 100000) throw new OrderError("Reduce el período del informe para consultar menos movimientos.");
      return financeReport(rows.map(r => ({ source: r.source, externalId: r.external_id, orderId: r.order_id, kind: r.kind, amountMicros: r.amount_micros, currency: r.currency, occurredAt: r.occurred_at })), from, to);
    },
    projections(catalog: Product[]): Projection[] {
      return catalog.map(p => {
        const estimate = db.prepare("SELECT * FROM cost_estimates WHERE product_id=?").get(p.id) as { cost_micros: number | null; fee_micros: number } | undefined;
        const saleMicros = p.priceCents * 10000, costMicros = estimate?.cost_micros ?? null, feeMicros = estimate?.fee_micros ?? 0;
        const profitMicros = costMicros === null ? null : saleMicros - costMicros - feeMicros;
        return { productId: p.id, name: p.name, saleMicros, costMicros, feeMicros, profitMicros, marginBps: profitMicros === null ? null : marginBps(profitMicros, saleMicros) };
      });
    },
    updateEstimate(actor: string, productId: string, input: Record<string, unknown>) {
      if (!/^[a-f0-9]{64}$/.test(actor)) throw new OrderError("Acceso no válido.", 401);
      if (!products.some(p => p.id === productId)) throw new OrderError("Producto no encontrado.", 404);
      if (Object.keys(input).some(k => !["costMicros", "feeMicros"].includes(k)) || (input.costMicros !== null && (!Number.isSafeInteger(input.costMicros) || (input.costMicros as number) < 0 || (input.costMicros as number) > 999_999_999_999_999)) || !Number.isSafeInteger(input.feeMicros) || (input.feeMicros as number) < 0 || (input.feeMicros as number) > 999_999_999_999_999) throw new OrderError("Revisa el coste y las comisiones estimadas.");
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare("INSERT INTO cost_estimates VALUES(?,?,?) ON CONFLICT(product_id) DO UPDATE SET cost_micros=excluded.cost_micros,fee_micros=excluded.fee_micros").run(productId, input.costMicros as number | null, input.feeMicros as number);
        db.prepare("INSERT INTO store_audit(actor,action,target,created_at) VALUES(?,?,?,?)").run(createHash("sha256").update(actor).digest("hex"), "finance.estimate", productId, new Date().toISOString());
        db.exec("COMMIT");
      } catch (error) { db.exec("ROLLBACK"); throw error; }
    },
  };
}
let store: ReturnType<typeof createFinanceStore> | undefined;
export function getFinanceStore() { getOrderStore(); return store ||= createFinanceStore(getDatabase()); }
