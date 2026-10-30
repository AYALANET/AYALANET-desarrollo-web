import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { getDatabase } from "./database.ts";
import { createOrderStore } from "./order-store.ts";
import { inventorySchema, managedStock } from "./inventory-schema.ts";
import { inventoryCipher, loadInventoryKey } from "./inventory-crypto.ts";
import { parseInventoryImport, type ImportBatch, licenseProductIds } from "./inventory-import.ts";
import { parseUsdt } from "./finance.ts";
import { OrderError, type OrderLine } from "./order-domain.ts";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const keyCheck = (key: string) => { if (!/^[A-Za-z0-9-]{20,80}$/.test(key)) throw new OrderError("Falta la referencia de la solicitud."); };
export type Delivery = { id: string; productId: string; code: string; region: string; instructions: string; expiresOn: string | null; deliveredAt: string };
type Unit = { id: string; product_id: string; ciphertext: string; expires_on: string | null; region: string; instructions: string; delivered_at: string };
export type Wallet = { mode: "sandbox"; balanceMicros: number; demoCreditAvailable: boolean; entries: { kind: "demo_credit" | "demo_purchase" | "demo_refund"; reference: string; amountMicros: number; createdAt: string }[]; topups: { id: string; amountMicros: number; createdAt: string; status: "awaiting_integration" }[] };
export type InventorySummary = {
  products: { id: string; name: string; region: string; managed: boolean; available: number; lowStock: boolean }[];
  batches: { id: string; productId: string; label: string; supplier: string; unitCostMicros: number; region: string; createdAt: string; total: number; available: number; delivered: number; blocked: number; expired: number }[];
  units: { id: string; productId: string; batchLabel: string; status: "available" | "delivered" | "blocked" | "expired"; expiresOn: string | null; orderId: string | null }[];
};
export function createCommerceStore(db: DatabaseSync, suppliedKey?: Buffer) {
  const orders = createOrderStore(db); inventorySchema(db);
  // Lazy: a wallet balance read does not require loading any decryption key.
  let cipher: ReturnType<typeof inventoryCipher> | undefined;
  function crypto() {
    if (!cipher) {
      const candidate = inventoryCipher(suppliedKey || loadInventoryKey(db));
      db.prepare("INSERT OR IGNORE INTO inventory_meta VALUES(1,?)").run(candidate.fingerprint);
      if ((db.prepare("SELECT key_fingerprint FROM inventory_meta WHERE id=1").get() as { key_fingerprint: string }).key_fingerprint !== candidate.fingerprint) throw new Error("Inventory key mismatch");
      cipher = candidate;
    }
    return cipher;
  }
  function atomic<T>(run: () => T): T { db.exec("BEGIN IMMEDIATE"); try { const value = run(); db.exec("COMMIT"); return value; } catch (error) { db.exec("ROLLBACK"); throw error; } }
  function account(owner: string) {
    if (!/^[a-f0-9]{64}$/.test(owner) || !db.prepare("SELECT 1 FROM accounts WHERE id=?").get(owner)) throw new OrderError("Inicia sesión para usar tu billetera.", 401);
    return hash(owner);
  }
  function admin(actor: string) { account(actor); if (!db.prepare("SELECT 1 FROM accounts WHERE id=? AND role='admin'").get(actor)) throw new OrderError("Acceso reservado.", 403); }
  function audit(actor: string, action: string, target: string) { db.prepare("INSERT INTO store_audit(actor,action,target,created_at) VALUES(?,?,?,?)").run(hash(actor), action, target, new Date().toISOString()); }
  function balance(ownerHash: string) { return (db.prepare("SELECT coalesce(sum(amount_micros),0) AS balance FROM wallet_entries WHERE owner_hash=?").get(ownerHash) as { balance: number }).balance; }
  function wallet(owner: string): Wallet {
    const ownerId = account(owner);
    return { mode: "sandbox", balanceMicros: balance(ownerId), demoCreditAvailable: !db.prepare("SELECT 1 FROM wallet_entries WHERE owner_hash=? AND kind='demo_credit'").get(ownerId),
      entries: db.prepare("SELECT kind,reference,amount_micros AS amountMicros,created_at AS createdAt FROM wallet_entries WHERE owner_hash=? ORDER BY id DESC LIMIT 100").all(ownerId) as Wallet["entries"],
      topups: db.prepare("SELECT id,amount_micros AS amountMicros,created_at AS createdAt,'awaiting_integration' AS status FROM wallet_topups WHERE owner_hash=? ORDER BY created_at DESC LIMIT 100").all(ownerId) as Wallet["topups"] };
  }
  function duplicates(batch: ImportBatch) { return batch.rows.reduce((n, row) => n + Number(!!db.prepare("SELECT 1 FROM inventory_units WHERE code_hash=?").get(crypto().hash(row.code.toUpperCase()))), 0); }
  function summary(actor: string): InventorySummary {
    admin(actor); const today = new Date().toISOString().slice(0, 10);
    return {
      products: orders.catalog().filter(p => licenseProductIds.includes(p.id)).map(p => ({ id: p.id, name: p.name, region: p.region, managed: p.inventoryManaged || false, available: p.inventoryManaged ? p.stock : 0, lowStock: !!p.inventoryManaged && p.stock <= 3 })),
      batches: db.prepare(`SELECT b.id,b.product_id AS productId,b.label,b.supplier,b.unit_cost_micros AS unitCostMicros,b.region,b.created_at AS createdAt,count(u.id) AS total,
        sum(u.status='available' AND (u.expires_on IS NULL OR u.expires_on>=?)) AS available,
        sum(u.status='delivered') AS delivered,sum(u.status='blocked') AS blocked,
        sum(u.status='available' AND u.expires_on<?) AS expired
        FROM inventory_batches b JOIN inventory_units u ON u.batch_id=b.id GROUP BY b.id ORDER BY b.created_at DESC LIMIT 100`).all(today, today) as InventorySummary["batches"],
      units: db.prepare(`SELECT u.id,u.product_id AS productId,b.label AS batchLabel,CASE WHEN u.status='available' AND u.expires_on<? THEN 'expired' ELSE u.status END AS status,u.expires_on AS expiresOn,u.order_id AS orderId FROM inventory_units u JOIN inventory_batches b ON b.id=u.batch_id ORDER BY b.created_at DESC,u.rowid DESC LIMIT 200`).all(today) as InventorySummary["units"],
    };
  }
  function ownedOrder(owner: string, id: string) {
    const ownerId = account(owner);
    const row = db.prepare("SELECT owner_hash,status,total_cents,lines_json FROM draft_orders WHERE id=? AND owner_hash=?").get(id, ownerId) as { owner_hash: string; status: string; total_cents: number; lines_json: string } | undefined;
    if (!row) throw new OrderError("Pedido no encontrado.", 404);
    return row;
  }
  function decrypted(unit: Unit): Delivery { return { id: unit.id, productId: unit.product_id, code: crypto().decrypt(unit.ciphertext, `${unit.id}:${unit.product_id}`), region: unit.region, instructions: unit.instructions, expiresOn: unit.expires_on, deliveredAt: unit.delivered_at }; }
  return {
    wallet, summary,
    preview(actor: string, input: Record<string, unknown>) {
      admin(actor); const batch = parseInventoryImport(input);
      return { count: batch.rows.length, duplicates: duplicates(batch), productId: batch.productId, region: batch.region, totalCostMicros: batch.unitCostMicros * batch.rows.length };
    },
    import(actor: string, key: string, input: Record<string, unknown>) {
      admin(actor); keyCheck(key);
      // A replay remains valid even if a previously imported unit has since expired.
      const batch = parseInventoryImport(input, "0000-01-01"), fingerprint = crypto().hash(JSON.stringify(batch));
      return atomic(() => {
        const old = db.prepare("SELECT id,fingerprint FROM inventory_batches WHERE request_key=?").get(key) as { id: string; fingerprint: string } | undefined;
        if (old) { if (old.fingerprint !== fingerprint) throw new OrderError("La referencia ya pertenece a otro lote.", 409); return { id: old.id, count: batch.rows.length }; }
        parseInventoryImport(input);
        if (duplicates(batch)) throw new OrderError("El lote contiene códigos ya importados. No se guardó ninguna fila.", 409);
        const id = randomUUID(), now = new Date().toISOString();
        db.prepare("INSERT INTO inventory_batches VALUES(?,?,?,?,?,?,?,?,?,?)").run(id, batch.productId, batch.label, batch.supplier, batch.unitCostMicros, batch.region, batch.instructions, now, key, fingerprint);
        for (const row of batch.rows) { const unitId = randomUUID(); db.prepare("INSERT INTO inventory_units(id,batch_id,product_id,code_hash,ciphertext,expires_on,status) VALUES(?,?,?,?,?,?,'available')").run(unitId, id, batch.productId, crypto().hash(row.code.toUpperCase()), crypto().encrypt(row.code, `${unitId}:${batch.productId}`), row.expiresOn); }
        audit(actor, "inventory.import", id); return { id, count: batch.rows.length };
      });
    },
    block(actor: string, id: string, blocked: boolean) {
      admin(actor);
      return atomic(() => {
        const unit = db.prepare("SELECT status,order_id FROM inventory_units WHERE id=?").get(id) as { status: string; order_id: string | null } | undefined;
        if (!unit) throw new OrderError("Unidad no encontrada.", 404);
        if (unit.order_id || unit.status === "delivered") throw new OrderError("Un código entregado no puede volver a venderse.", 409);
        db.prepare("UPDATE inventory_units SET status=? WHERE id=?").run(blocked ? "blocked" : "available", id);
        audit(actor, blocked ? "inventory.block" : "inventory.unblock", id); return { saved: true };
      });
    },
    demoCredit(owner: string) {
      const ownerId = account(owner);
      atomic(() => db.prepare("INSERT OR IGNORE INTO wallet_entries(owner_hash,kind,reference,amount_micros,created_at) VALUES(?,'demo_credit','welcome-v1',50000000,?)").run(ownerId, new Date().toISOString()));
      return wallet(owner);
    },
    requestTopup(owner: string, key: string, amount: unknown) {
      const ownerId = account(owner); keyCheck(key); const micros = parseUsdt(amount);
      if (micros < 1_000_000 || micros > 1_000_000_000) throw new OrderError("La recarga debe estar entre 1 y 1.000 USDT.");
      return atomic(() => {
        const old = db.prepare("SELECT id,amount_micros FROM wallet_topups WHERE owner_hash=? AND request_key=?").get(ownerId, key) as { id: string; amount_micros: number } | undefined;
        if (old) { if (old.amount_micros !== micros) throw new OrderError("La referencia ya pertenece a otro importe.", 409); return { id: old.id, status: "awaiting_integration" }; }
        const count = db.prepare("SELECT count(*) AS n FROM wallet_topups WHERE owner_hash=? AND created_at>=?").get(ownerId, new Date(Date.now() - 86400_000).toISOString()) as { n: number };
        if (count.n >= 5) throw new OrderError("Puedes preparar hasta cinco recargas por día.", 429);
        const id = `REC-${randomUUID()}`;
        db.prepare("INSERT INTO wallet_topups VALUES(?,?,?,?,?)").run(id, ownerId, micros, new Date().toISOString(), key);
        return { id, status: "awaiting_integration" };
      });
    },
    purchase(owner: string, id: string) {
      return atomic(() => {
        const order = ownedOrder(owner, id);
        if (order.status === "demo_delivered") return orders.get(owner, id);
        if (order.status !== "draft") throw new OrderError("Este pedido ya no admite una compra de prueba.", 409);
        const amount = order.total_cents * 10000;
        if (!Number.isSafeInteger(amount) || amount <= 0) throw new OrderError("Importe del pedido no válido.");
        if (balance(order.owner_hash) < amount) throw new OrderError("Saldo de prueba insuficiente. No se ha descontado nada.", 409);
        const today = new Date().toISOString().slice(0, 10), now = new Date().toISOString();
        const lines = JSON.parse(order.lines_json) as OrderLine[];
        for (const line of lines) {
          const product = orders.catalog().find(p => p.id === line.productId);
          if (!product?.active || !licenseProductIds.includes(line.productId) || managedStock(db, line.productId) === null) throw new OrderError("Este pedido necesita códigos de prueba importados. Las recargas de proveedor aún no están conectadas.", 409);
          const units = db.prepare(`SELECT u.*,b.region,b.instructions FROM inventory_units u JOIN inventory_batches b ON b.id=u.batch_id WHERE u.product_id=? AND u.status='available' AND (u.expires_on IS NULL OR u.expires_on>=?) ORDER BY u.expires_on IS NULL,u.expires_on,b.created_at,u.rowid LIMIT ?`).all(line.productId, today, line.quantity) as Unit[];
          if (units.length !== line.quantity) throw new OrderError("No quedan códigos suficientes. No se ha descontado nada.", 409);
          for (const unit of units) {
            // Verify the encrypted payload before committing either stock or balance.
            decrypted(unit);
            db.prepare("UPDATE inventory_units SET status='delivered',order_id=?,delivered_at=? WHERE id=? AND status='available'").run(id, now, unit.id);
          }
        }
        db.prepare("INSERT INTO wallet_entries(owner_hash,kind,reference,amount_micros,created_at) VALUES(?,'demo_purchase',?,?,?)").run(order.owner_hash, id, -amount, now);
        db.prepare("UPDATE draft_orders SET status='demo_delivered' WHERE id=?").run(id);
        return orders.get(owner, id);
      });
    },
    reveal(owner: string, id: string): Delivery[] {
      const order = ownedOrder(owner, id);
      if (order.status !== "demo_delivered") throw new OrderError("Este pedido no tiene códigos disponibles para mostrar.", 409);
      return (db.prepare("SELECT u.*,b.region,b.instructions FROM inventory_units u JOIN inventory_batches b ON b.id=u.batch_id WHERE u.order_id=? AND u.status='delivered' ORDER BY u.rowid").all(id) as Unit[]).map(decrypted);
    },
    refund(actor: string, id: string) {
      admin(actor);
      return atomic(() => {
        const order = db.prepare("SELECT owner_hash,status,total_cents FROM draft_orders WHERE id=?").get(id) as { owner_hash: string; status: string; total_cents: number } | undefined;
        if (!order) throw new OrderError("Pedido no encontrado.", 404);
        if (order.status === "demo_refunded") return { refunded: true };
        if (order.status !== "demo_delivered") throw new OrderError("Solo se puede devolver una compra de prueba entregada.", 409);
        const debit = db.prepare("SELECT amount_micros FROM wallet_entries WHERE owner_hash=? AND kind='demo_purchase' AND reference=?").get(order.owner_hash, id) as { amount_micros: number } | undefined;
        if (!debit || debit.amount_micros !== -order.total_cents * 10000) throw new OrderError("No se encontró un descuento válido para devolver.", 409);
        db.prepare("INSERT INTO wallet_entries(owner_hash,kind,reference,amount_micros,created_at) VALUES(?,'demo_refund',?,?,?)").run(order.owner_hash, id, -debit.amount_micros, new Date().toISOString());
        db.prepare("UPDATE inventory_units SET status='blocked' WHERE order_id=?").run(id);
        db.prepare("UPDATE draft_orders SET status='demo_refunded' WHERE id=?").run(id);
        audit(actor, "wallet.demo_refund", id); return { refunded: true };
      });
    },
  };
}
let store: ReturnType<typeof createCommerceStore> | undefined;
export function getCommerceStore() { return store ||= createCommerceStore(getDatabase()); }
