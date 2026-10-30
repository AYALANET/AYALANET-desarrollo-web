import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { quoteDraft } from "../lib/order-domain.ts";
import { createOrderStore } from "../lib/order-store.ts";
import { hasAllowedOrigin, limitedJson } from "../lib/http.ts";

const owner = "a".repeat(64);
const input = { method: "usdt_bep20", items: [{ productId: "free-fire-110", quantity: 2 }] };

test("comprueba el origen real y respeta el dominio fijado del despliegue", () => {
  const request = (origin: string, host = "127.0.0.1:3100") => new Request("http://localhost:3100/api/orders", { headers: { origin, host } });
  assert.equal(hasAllowedOrigin(request("http://127.0.0.1:3100")), true);
  assert.equal(hasAllowedOrigin(request("https://untrusted.example")), false);
  assert.equal(hasAllowedOrigin(request("null")), false);
  assert.equal(hasAllowedOrigin(request("https://shop.example", "spoofed.example"), "https://shop.example"), true);
  assert.equal(hasAllowedOrigin(request("https://spoofed.example", "spoofed.example"), "https://shop.example"), false);
});

test("el servidor calcula los importes enteros desde el catálogo", () => {
  assert.equal(quoteDraft(input).totalCents, 250);
});
test("no se aceptan precio ni confirmación de cobro enviados por el cliente", () => {
  for (const extra of [{ totalCents: 1 }, { status: "paid" }, { paymentStatus: "confirmed" }]) assert.throws(() => quoteDraft({ ...input, ...extra }));
  assert.throws(() => quoteDraft({ ...input, items: [{ ...input.items[0], unitPriceCents: 1 }] }));
});
test("rechaza cantidades inválidas, productos desconocidos y partidas duplicadas", () => {
  for (const quantity of [-1, 0, 1.5, 11, Number.MAX_SAFE_INTEGER, "2", null]) assert.throws(() => quoteDraft({ ...input, items: [{ productId: "free-fire-110", quantity }] }));
  assert.throws(() => quoteDraft({ ...input, items: [{ productId: "other", quantity: 1 }] }));
  assert.throws(() => quoteDraft({ ...input, items: [...input.items, ...input.items] }));
});
test("Binance Pay no se anuncia como integración disponible", () => {
  assert.throws(() => quoteDraft({ ...input, method: "binance_pay" }));
});
test("un reintento guarda un solo pedido y siempre permanece sin pago", () => {
  const db = new DatabaseSync(":memory:"); const store = createOrderStore(db); const key = randomUUID();
  try {
    const first = store.create(owner, key, input); const second = store.create(owner, key, input);
    assert.equal(first.id, second.id); assert.equal(store.list(owner).length, 1);
    assert.equal(first.status, "draft"); assert.equal(first.paymentStatus, "not_configured");
    assert.throws(() => store.create(owner, key, { ...input, items: [{ productId: "steam-20", quantity: 1 }] }), /otro carrito/);
    assert.equal(store.list(owner).length, 1);
  } finally { db.close(); }
});
test("cada sesión solo ve sus propios pedidos", () => {
  const db = new DatabaseSync(":memory:"); const store = createOrderStore(db);
  try { store.create(owner, randomUUID(), input); assert.equal(store.list("b".repeat(64)).length, 0); assert.equal(store.list(owner).length, 1); }
  finally { db.close(); }
});
test("pedidos persistentes después de cerrar y abrir la base", () => {
  const directory = mkdtempSync(join(tmpdir(), "ayalanet-order-test-")); const file = join(directory, "test.sqlite");
  try {
    const db = new DatabaseSync(file); const order = createOrderStore(db).create(owner, randomUUID(), input); db.close();
    const reopened = new DatabaseSync(file);
    try { assert.equal(createOrderStore(reopened).list(owner)[0].id, order.id); } finally { reopened.close(); }
  } finally { rmSync(directory, { recursive: true }); }
});
test("se limita la creación de borradores por sesión sin bloquear reintentos", () => {
  const db = new DatabaseSync(":memory:"); const store = createOrderStore(db); const key = randomUUID();
  try {
    const first = store.create(owner, key, input);
    for (let n = 1; n < 12; n++) store.create(owner, randomUUID(), input);
    assert.throws(() => store.create(owner, randomUUID(), input), /límite/);
    assert.equal(store.create(owner, key, input).id, first.id);
  } finally { db.close(); }
});
test("no se procesa un cuerpo desmedido ni JSON mal formado", async () => {
  await assert.rejects(limitedJson(new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: "x".repeat(17000) })), /demasiado grande/);
  await assert.rejects(limitedJson(new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" })), /JSON/);
});
