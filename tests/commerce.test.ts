import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, existsSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { createIdentityStore } from "../lib/identity-store.ts";
import { createCommerceStore } from "../lib/commerce-store.ts";
import { createOrderStore } from "../lib/order-store.ts";
import { createFinanceStore } from "../lib/finance-store.ts";
import { inventoryCipher, loadInventoryKey } from "../lib/inventory-crypto.ts";
import { parseInventoryImport } from "../lib/inventory-import.ts";

const batch = (csv = "code,expires_on\nDEMO-STEAM-ONE,2099-12-31\nDEMO-STEAM-TWO,") => ({ productId: "steam-20", label: "Lote ficticio", supplier: "Proveedor ficticio", unitCost: "18.123456", region: "Estados Unidos", instructions: "Solo para pruebas; no canjear.", csv });
async function setup(t: { after: (fn: () => void) => void }, path = ":memory:") {
  const db = new DatabaseSync(path); db.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000"); t.after(() => db.close());
  const auth = createIdentityStore(db), key = randomBytes(32), store = createCommerceStore(db, key), orders = createOrderStore(db);
  const register = async (username: string) => (await auth.register(auth.initialize(), { username, name: username, password: "Una clave ficticia 123456789" })).identity.owner;
  const admin = await register("administrador"), a = await register("cliente_uno"), b = await register("cliente_dos");
  db.prepare("UPDATE accounts SET role='admin' WHERE id=?").run(admin);
  const order = (owner = a, items = [{ productId: "steam-20", quantity: 1 }]) => orders.create(owner, randomUUID(), { items });
  return { db, key, store, orders, admin, a, b, order };
}
test("AES-GCM liga cada código a su producto y unidad; manipulación y otra clave fallan", () => {
  const key = randomBytes(32), c = inventoryCipher(key), code = "DEMO-PRIVATE-CODE", value = c.encrypt(code, "unit:steam");
  assert.equal(c.decrypt(value, "unit:steam"), code); assert.ok(!value.includes(code));
  assert.notEqual(c.encrypt(code, "unit:steam"), value);
  assert.throws(() => c.decrypt(value, "other:steam")); assert.throws(() => inventoryCipher(randomBytes(32)).decrypt(value, "unit:steam"));
  const parts = value.split(":"), bytes = Buffer.from(parts[3], "base64"); bytes[0] ^= 1; parts[3] = bytes.toString("base64");
  assert.throws(() => c.decrypt(parts.join(":"), "unit:steam"));
});
test("CSV valida BOM, comillas, fechas, región, duplicados y límites sin exponer códigos", () => {
  const parsed = parseInventoryImport(batch('\uFEFF"code";"expires_on"\r\n"DEMO-TEST-001";"2099-01-01"\r\n"DEMO-TEST-002";""'));
  assert.equal(parsed.rows.length, 2); assert.equal(parsed.unitCostMicros, 18123456);
  assert.equal(parseInventoryImport(batch("DEMO-ONE-0001\nDEMO-TWO-0002\n")).rows.length, 2);
  for (const csv of ["REAL-LICENSE-SECRET", "DEMO-AAAA\nDEMO-aaaa", "code,expires_on\nDEMO-AAAA,2099-02-30", 'code,expires_on\n"DEMO-AAAA,2099-01-01', "code,expires_on\nDEMO-AAAA,2000-01-01", Array.from({ length: 501 }, (_, i) => `DEMO-TEST-${i}`).join("\n")]) {
    assert.throws(() => parseInventoryImport(batch(csv)), (e: Error) => !e.message.includes("REAL-LICENSE-SECRET"));
  }
  assert.throws(() => parseInventoryImport({ ...batch(), region: "Global" }), /región/);
  assert.throws(() => parseInventoryImport({ ...batch(), productId: "pubg-60" }), /recargas/);
  assert.throws(() => parseInventoryImport({ ...batch(), status: "paid" }));
});
test("importación atómica, cifrada e idempotente; duplicados globales incluso bloqueados", async t => {
  const { store, db, admin, a, orders } = await setup(t), key = randomUUID();
  assert.throws(() => store.preview(a, batch()), /reservado/);
  assert.equal(store.preview(admin, batch()).count, 2);
  const imported = store.import(admin, key, batch()); assert.deepEqual(store.import(admin, key, batch()), imported);
  assert.throws(() => store.import(admin, key, { ...batch(), label: "Otro" }), /otro lote/);
  const raw = JSON.stringify(db.prepare("SELECT * FROM inventory_units").all()); assert.ok(!raw.includes("DEMO-STEAM-ONE"));
  assert.equal(orders.catalog()[0].stock, 2); assert.equal(orders.catalog()[0].inventoryManaged, true);
  assert.ok(!JSON.stringify(store.summary(admin)).includes("DEMO-STEAM-ONE"));
  assert.throws(() => store.import(admin, randomUUID(), batch("DEMO-UNIQUE-000\nDEMO-STEAM-ONE")), /ya importados/);
  assert.equal(db.prepare("SELECT count(*) AS n FROM inventory_units").get()?.n, 2);
  const unit = store.summary(admin).units[0]; store.block(admin, unit.id, true);
  assert.equal(orders.catalog()[0].stock, 1); assert.equal(store.preview(admin, batch()).duplicates, 2);
  assert.throws(() => store.import(admin, randomUUID(), { ...batch(), productId: "xbox-10" }), /ya importados/);
  store.block(admin, unit.id, false); assert.equal(orders.catalog()[0].stock, 2);
  assert.throws(() => orders.updateProduct(admin, "steam-20", { priceCents: 2150, stock: 90, active: true }), /Inventario/);
});
test("billetera exige cuenta; recargas pendientes no acreditan y el bono no puede repetirse", async t => {
  const { store, a, b } = await setup(t), key = randomUUID();
  assert.throws(() => store.wallet("0".repeat(64)), /Inicia sesión/);
  assert.equal(store.wallet(a).balanceMicros, 0);
  assert.deepEqual(store.requestTopup(a, key, "15.123456"), store.requestTopup(a, key, "15.123456"));
  assert.equal(store.wallet(a).balanceMicros, 0); assert.equal(store.wallet(a).topups.length, 1);
  assert.throws(() => store.requestTopup(a, key, "16"), /otro importe/);
  assert.equal(store.demoCredit(a).balanceMicros, 50000000); store.demoCredit(a);
  assert.equal(store.wallet(a).entries.length, 1); assert.equal(store.wallet(b).balanceMicros, 0);
  for (const amount of ["0", "-5", "1000.01", "1e3", "1.0000001"]) assert.throws(() => store.requestTopup(a, randomUUID(), amount));
});
test("compra y entrega privada: un descuento, una asignación, FEFO y ninguna venta real", async t => {
  const { store, orders, admin, a, b, order, db } = await setup(t);
  store.import(admin, randomUUID(), batch()); store.demoCredit(a);
  const draft = order();
  const purchased = store.purchase(a, draft.id); assert.equal(purchased.status, "demo_delivered"); assert.equal(purchased.paymentStatus, "demo_debited");
  assert.deepEqual(store.purchase(a, draft.id), purchased);
  assert.equal(store.wallet(a).balanceMicros, 28500000); assert.equal(orders.catalog()[0].stock, 1);
  assert.equal(store.reveal(a, draft.id)[0].code, "DEMO-STEAM-ONE");
  assert.throws(() => store.reveal(b, draft.id), /no encontrado/); assert.throws(() => store.purchase(b, draft.id), /no encontrado/);
  assert.throws(() => orders.cancel(a, draft.id), /devolución/);
  store.demoCredit(a); assert.equal(store.wallet(a).balanceMicros, 28500000);
  assert.equal(createFinanceStore(db).report("2026-01-01", "2026-12-31").count, 0);
});
test("saldo insuficiente y fallos parciales revierten stock, pedido y movimientos", async t => {
  const { store, orders, admin, a, order, db } = await setup(t);
  store.import(admin, randomUUID(), batch()); const draft = order();
  assert.throws(() => store.purchase(a, draft.id), /insuficiente/);
  assert.equal(orders.catalog()[0].stock, 2); assert.equal(orders.get(a, draft.id).status, "draft");
  store.demoCredit(a);
  // First product is allocated, but second product lacks managed inventory.
  const mixed = order(a, [{ productId: "steam-20", quantity: 1 }, { productId: "xbox-10", quantity: 1 }]);
  assert.throws(() => store.purchase(a, mixed.id), /importados/);
  assert.equal(orders.catalog()[0].stock, 2); assert.equal(store.wallet(a).balanceMicros, 50000000);
  // An unreadable second unit must roll back the already processed first unit.
  const last = db.prepare("SELECT id FROM inventory_units ORDER BY rowid DESC LIMIT 1").get()!.id as string;
  db.prepare("UPDATE inventory_units SET ciphertext='corrupt' WHERE id=?").run(last);
  const two = order(a, [{ productId: "steam-20", quantity: 2 }]); assert.throws(() => store.purchase(a, two.id));
  assert.equal(orders.catalog()[0].stock, 2); assert.equal(store.wallet(a).balanceMicros, 50000000);
  assert.equal(store.wallet(a).entries.length, 1); assert.equal(orders.get(a, two.id).status, "draft");
});
test("caducados y bloqueados no se entregan; no se vende sin stock ni se debita", async t => {
  const { store, admin, a, b, order, orders, db } = await setup(t);
  store.import(admin, randomUUID(), batch()); store.demoCredit(a); store.demoCredit(b);
  const first = order(a), second = order(b);
  db.prepare("UPDATE inventory_units SET expires_on='2000-01-01' WHERE rowid=(SELECT max(rowid) FROM inventory_units)").run();
  assert.equal(orders.catalog()[0].stock, 1); store.purchase(a, first.id);
  assert.throws(() => store.purchase(b, second.id), /suficientes/);
  assert.equal(store.wallet(b).balanceMicros, 50000000); assert.equal(store.summary(admin).batches[0].expired, 1);
});
test("devolución repone saldo exactamente una vez y nunca recicla el código", async t => {
  const { store, admin, a, b, order, orders } = await setup(t);
  store.import(admin, randomUUID(), batch()); store.demoCredit(a); const draft = order(); store.purchase(a, draft.id);
  const unitId = store.reveal(a, draft.id)[0].id;
  assert.throws(() => store.refund(b, draft.id), /reservado/);
  store.refund(admin, draft.id); store.refund(admin, draft.id);
  assert.equal(store.wallet(a).balanceMicros, 50000000); assert.equal(store.wallet(a).entries.length, 3);
  assert.equal(orders.get(a, draft.id).status, "demo_refunded"); assert.equal(orders.catalog()[0].stock, 1);
  assert.throws(() => store.reveal(a, draft.id), /no tiene códigos/);
  assert.throws(() => store.purchase(a, draft.id), /ya no admite/);
  assert.throws(() => store.block(admin, unitId, false), /no puede volver/);
});
test("la clave persiste fuera de SQLite y su pérdida nunca genera una clave nueva", async t => {
  const dir = mkdtempSync(join(tmpdir(), "inventory-key-test-")); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const previous = process.env.INVENTORY_KEY_FILE; process.env.INVENTORY_KEY_FILE = join(dir, "inventory.key");
  t.after(() => { if (previous === undefined) delete process.env.INVENTORY_KEY_FILE; else process.env.INVENTORY_KEY_FILE = previous; });
  const { db, admin } = await setup(t); const store = createCommerceStore(db);
  store.import(admin, randomUUID(), batch()); const key = readFileSync(process.env.INVENTORY_KEY_FILE);
  assert.deepEqual(loadInventoryKey(db), key);
  assert.throws(() => createCommerceStore(db, randomBytes(32)).preview(admin, batch()), /mismatch/);
  unlinkSync(process.env.INVENTORY_KEY_FILE); assert.throws(() => loadInventoryKey(db), /missing/); assert.equal(existsSync(process.env.INVENTORY_KEY_FILE), false);
});
test("dos conexiones concurrentes compiten por un código: solo una compra descuenta", async t => {
  const dir = mkdtempSync(join(tmpdir(), "inventory-race-")), path = join(dir, "store.sqlite");
  // Cleanup hook registered before setup closes the connection; Linux permits unlinking it.
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const { store, admin, a, b, order, key, orders } = await setup(t, path);
  store.import(admin, randomUUID(), batch("DEMO-SINGLE-CODE")); store.demoCredit(a); store.demoCredit(b);
  const first = order(a), second = order(b);
  const workers = [[a, first.id], [b, second.id]].map(([owner, id]) => new Worker(new URL("./helpers/purchase-worker.ts", import.meta.url), { workerData: { path, key: key.toString("hex"), owner, id } }));
  t.after(() => { for (const worker of workers) void worker.terminate(); });
  await Promise.all(workers.map(worker => new Promise<void>((resolve, reject) => { worker.once("message", () => resolve()); worker.once("error", reject); })));
  const pending = workers.map(worker => new Promise<{ success: boolean }>((resolve, reject) => { worker.once("message", resolve); worker.once("error", reject); }));
  workers.forEach(worker => worker.postMessage("go")); const results = await Promise.all(pending);
  assert.equal(results.filter(r => r.success).length, 1);
  assert.equal(store.wallet(a).balanceMicros + store.wallet(b).balanceMicros, 78500000);
  assert.equal(orders.catalog()[0].stock, 0);
});

test("saldo y entrega persisten al reabrir SQLite y recuperar la cuenta", async t => {
  const dir = mkdtempSync(join(tmpdir(), "wallet-persistence-")), path = join(dir, "store.sqlite"), key = randomBytes(32);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  let db = new DatabaseSync(path);
  try {
    let auth = createIdentityStore(db), store = createCommerceStore(db, key);
    const credentials = { username: "cliente_persistente", name: "Cliente ficticio", password: "Una clave ficticia 123456789" };
    const registered = await auth.register(auth.initialize(), credentials), owner = registered.identity.owner;
    db.prepare("UPDATE accounts SET role='admin' WHERE id=?").run(owner);
    store.import(owner, randomUUID(), batch()); store.demoCredit(owner);
    const order = createOrderStore(db).create(owner, randomUUID(), { items: [{ productId: "steam-20", quantity: 1 }] });
    store.purchase(owner, order.id); store.requestTopup(owner, randomUUID(), "12.01");
    db.close(); db = new DatabaseSync(path); auth = createIdentityStore(db); store = createCommerceStore(db, key);
    const recovered = await auth.recover(auth.initialize(), { username: credentials.username, password: "Nueva contraseña ficticia 123456789", recoveryKey: registered.recoveryKey });
    assert.equal(recovered.identity.owner, owner); assert.equal(auth.read(registered.identity.token), null);
    assert.equal(store.wallet(owner).balanceMicros, 28500000); assert.equal(store.wallet(owner).topups.length, 1);
    assert.equal(store.reveal(owner, order.id)[0].code, "DEMO-STEAM-ONE");
    store.demoCredit(owner); assert.equal(store.wallet(owner).balanceMicros, 28500000);
  } finally { db.close(); }
});
