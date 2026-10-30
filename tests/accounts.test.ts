import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { createIdentityStore } from "../lib/identity-store.ts";
import { createOrderStore } from "../lib/order-store.ts";

const credentials = { username: "cliente_prueba", name: "Cliente de prueba", password: "Clave solo para tests 123456" };
const input = { items: [{ productId: "steam-20", quantity: 1 }] };
function setup(t: { after: (fn: () => void) => void }) {
  const db = new DatabaseSync(":memory:"); t.after(() => db.close());
  let now = Date.now();
  return { db, auth: createIdentityStore(db, () => now), store: createOrderStore(db), advance: () => { now += 8 * 86400_000; } };
}
test("crear una cuenta vincula los borradores y consultas del invitado y rota la sesión", async t => {
  const { auth, store, db } = setup(t), guest = auth.initialize();
  const order = store.create(guest.owner, randomUUID(), input);
  store.createTicket(guest.owner, randomUUID(), { subject: "Consulta prueba", message: "Necesito revisar la región", orderId: order.id });
  const result = await auth.register(guest, credentials);
  assert.equal(result.identity.account?.role, "customer"); assert.notEqual(result.identity.token, guest.token);
  assert.equal(auth.read(guest.token), null); assert.equal(store.list(result.identity.owner)[0].id, order.id);
  assert.equal(store.tickets(result.identity.owner).length, 1); assert.equal(store.list(guest.owner).length, 0);
  const row = db.prepare("SELECT password,recovery_hash FROM accounts").get();
  assert.notEqual(row?.password, credentials.password); assert.notEqual(row?.recovery_hash, result.recoveryKey);
  assert.equal(result.recoveryKey.length, 48);
});
test("el identificador público de una cuenta no puede convertirse en cookie de acceso", async t => {
  const { auth, store } = setup(t), result = await auth.register(auth.initialize(), credentials);
  store.create(result.identity.owner, randomUUID(), input);
  const forged = auth.initialize(result.identity.account!.id);
  assert.notEqual(forged.owner, result.identity.owner); assert.equal(forged.account, null); assert.equal(store.list(forged.owner).length, 0);
});
test("otro dispositivo conserva el historial y cambiar de cuenta no mueve pedidos ajenos", async t => {
  const { auth, store } = setup(t), a = await auth.register(auth.initialize(), credentials);
  const order = store.create(a.identity.owner, randomUUID(), input);
  const b = await auth.register(auth.initialize(), { ...credentials, username: "otra_cuenta" });
  store.create(b.identity.owner, randomUUID(), input);
  const secondDevice = await auth.login(auth.initialize(), credentials);
  assert.equal(store.list(secondDevice.identity.owner)[0].id, order.id);
  const switchAccount = await auth.login(b.identity, credentials);
  assert.equal(store.list(switchAccount.identity.owner).length, 1); assert.equal(store.list(b.identity.owner).length, 1);
  const loggedOut = auth.logout(a.identity);
  assert.equal(loggedOut.account, null); assert.equal(auth.read(a.identity.token), null);
});
test("recuperar invalida sesiones y clave anterior, sin dar rol de administrador", async t => {
  const { auth } = setup(t), a = await auth.register(auth.initialize(), credentials);
  const b = await auth.login(auth.initialize(), credentials);
  const result = await auth.recover(auth.initialize(), { username: credentials.username, password: "Nueva contraseña de test 789", recoveryKey: a.recoveryKey });
  assert.equal(auth.read(a.identity.token), null); assert.equal(auth.read(b.identity.token), null);
  await assert.rejects(auth.recover(auth.initialize(), { ...credentials, recoveryKey: a.recoveryKey }), /incorrectos/);
  await assert.rejects(auth.login(auth.initialize(), credentials), /incorrectos/);
  assert.equal(result.identity.account?.role, "customer"); assert.notEqual(result.recoveryKey, a.recoveryKey);
});
test("acceso administrativo y vencimiento se comprueban en servidor", async t => {
  const { auth, db, advance } = setup(t), a = await auth.register(auth.initialize(), credentials);
  assert.throws(() => auth.requireAdmin(a.identity), /reservado/);
  db.prepare("UPDATE accounts SET role='admin' WHERE id=?").run(a.identity.owner);
  assert.doesNotThrow(() => auth.requireAdmin(auth.read(a.identity.token)!));
  db.prepare("UPDATE accounts SET role='customer' WHERE id=?").run(a.identity.owner);
  assert.throws(() => auth.requireAdmin(auth.read(a.identity.token)!), /reservado/);
  advance(); assert.equal(auth.read(a.identity.token), null);
});
test("contraseñas débiles, usuarios duplicados e intentos excesivos se rechazan", async t => {
  const { auth } = setup(t);
  await assert.rejects(auth.register(auth.initialize(), { ...credentials, password: "short" }), /12/);
  await auth.register(auth.initialize(), credentials);
  await assert.rejects(auth.register(auth.initialize(), { ...credentials, username: credentials.username.toUpperCase() }), /disponible/);
  for (let i = 0; i < 10; i++) await assert.rejects(auth.login(auth.initialize(), { ...credentials, password: "Contraseña de test incorrecta" }), /incorrectos/);
  await assert.rejects(auth.login(auth.initialize(), credentials), /Demasiados/);
});
