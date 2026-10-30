import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { createOrderStore } from "../lib/order-store.ts";
import { sanitizeCart } from "../lib/catalog.ts";

const owner = "a".repeat(64), other = "b".repeat(64), input = { items: [{ productId: "steam-20", quantity: 1 }] };
function setup(t: { after: (fn: () => void) => void }) { const db = new DatabaseSync(":memory:"); t.after(() => db.close()); return { db, store: createOrderStore(db) }; }
test("solo el propietario consulta/cancela el borrador; cancelar es idempotente", t => {
  const { store } = setup(t), key = randomUUID(), order = store.create(owner, key, input);
  assert.throws(() => store.get(other, order.id), /no encontrado/); assert.throws(() => store.cancel(other, order.id), /no encontrado/);
  const cancelled = store.cancel(owner, order.id);
  assert.equal(cancelled.status, "cancelled"); assert.equal(cancelled.paymentStatus, "not_configured");
  assert.deepEqual(store.cancel(owner, order.id), cancelled); assert.deepEqual(store.create(owner, key, input), cancelled);
});
test("cambios de precio/visibilidad afectan nuevos pedidos, conservando reintentos e historial", t => {
  const { store } = setup(t), key = randomUUID(), order = store.create(owner, key, { ...input, expectedTotalCents: 2150 });
  store.updateProduct(other, "steam-20", { priceCents: 3000, stock: 5, active: true });
  assert.equal(store.create(owner, key, input).id, order.id);
  assert.throws(() => store.create(owner, randomUUID(), { ...input, expectedTotalCents: 2150 }), /precio cambió/);
  assert.equal(store.get(owner, order.id).totalCents, 2150);
  store.updateProduct(other, "steam-20", { priceCents: 3000, stock: 0, active: false });
  assert.throws(() => store.create(owner, randomUUID(), input), /no está disponible/);
  assert.equal(store.create(owner, key, input).id, order.id);
  assert.equal(store.adminSummary().audit.length, 2);
});
test("consultas privadas, pedido vinculado exacto, mensajes sin duplicados y cierre", t => {
  const { store } = setup(t), order = store.create(owner, randomUUID(), input), key = randomUUID();
  const data = { subject: "Consulta sobre región", message: "¿Puedo usarlo en mi cuenta?", orderId: order.id };
  assert.throws(() => store.createTicket(other, key, data), /no encontrado/);
  const ticket = store.createTicket(owner, key, data);
  assert.equal(store.createTicket(owner, key, data).id, ticket.id);
  assert.throws(() => store.createTicket(owner, key, { ...data, subject: "Otro asunto distinto" }), /otra consulta/);
  assert.throws(() => store.reply(other, ticket.id, randomUUID(), "No debe entrar"), /no encontrada/);
  const replyKey = randomUUID(); store.reply(owner, ticket.id, replyKey, "Gracias, espero la respuesta");
  store.reply(owner, ticket.id, replyKey, "Gracias, espero la respuesta");
  assert.equal(store.ticket(owner, ticket.id).messages.length, 2);
  const answered = store.reply(other, ticket.id, randomUUID(), "Respuesta de prueba", true);
  assert.equal(answered.messages.at(-1)?.author, "admin");
  store.closeTicket(owner, ticket.id); assert.throws(() => store.reply(owner, ticket.id, randomUUID(), "Otra respuesta"), /cerrada/);
  assert.equal(store.tickets(other).length, 0);
});
test("límites de consultas y entradas de catálogo manipuladas se rechazan", t => {
  const { store } = setup(t);
  for (let i = 0; i < 5; i++) store.createTicket(owner, randomUUID(), { subject: "Consulta de prueba", message: "Este es un mensaje de prueba" });
  assert.throws(() => store.createTicket(owner, randomUUID(), { subject: "Consulta adicional", message: "Este es otro mensaje de prueba" }), /cinco/);
  for (const fields of [{ priceCents: -1 }, { priceCents: 1.2 }, { stock: -1 }, { active: "yes" }, { status: "paid" }]) assert.throws(() => store.updateProduct(owner, "steam-20", { priceCents: 100, stock: 1, active: true, ...fields }));
});
test("el carrito persistido no puede introducir productos o cantidades arbitrarias", () => {
  assert.deepEqual(sanitizeCart({ unknown: 4, "steam-20": 999, "free-fire-110": -1, "xbox-10": 1.5 }), { "steam-20": 8 });
  assert.deepEqual(sanitizeCart("malformed"), {});
});
