import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { createFinanceStore } from "../../lib/finance-store";

const baseURL = "http://127.0.0.1:3100";
const origin = { Origin: baseURL };
const demoPassword = "Contraseña exclusiva de pruebas 123";

test("catálogo, ficha, carrito persistente, revisión y cancelación", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1040 });
  const failures: string[] = [];
  page.on("pageerror", error => failures.push(error.message));
  await page.goto("/"); await expect(page.locator(".product-card")).toHaveCount(6);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: "docs/screenshots/desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Recargas", exact: true }).click();
  await expect(page.locator(".product-card")).toHaveCount(2);
  await page.getByLabel("Buscar productos").fill("free"); await expect(page.locator(".product-card")).toHaveCount(1);
  await page.getByRole("link", { name: "Ver Free Fire", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Free Fire.", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Antes de elegirlo" })).toBeVisible();
  await page.getByRole("button", { name: "Añadir Free Fire al carrito", exact: true }).click();
  await page.getByRole("link", { name: "Ver carrito, 1 productos" }).click();
  await page.getByRole("button", { name: "Añadir una unidad de Free Fire" }).click();
  await page.reload(); await expect(page.locator(".cart-total")).toContainText("2.50");
  await expect(page.getByRole("button", { name: "Guardar pedido de prueba" })).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page.screenshot({ path: "docs/screenshots/checkout.png", fullPage: true });
  await page.getByRole("button", { name: "Guardar pedido de prueba" }).click();
  await expect(page).toHaveURL(/\/pedido\/DEMO-/);
  await expect(page.locator(".order-card")).toContainText("2 × Free Fire");
  await expect(page.locator(".draft-badge")).toHaveText("Borrador · sin pago");
  await page.reload(); await expect(page.locator(".order-card")).toContainText("2.50");
  await page.getByRole("button", { name: "Cancelar borrador", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar cancelación" }).click();
  await expect(page.locator(".draft-badge")).toHaveText("Cancelado · sin pago");
  expect(failures).toEqual([]);
});

test("móvil: navegación, tamaños y páginas sin desbordamiento", async ({ page }) => {
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of ["/", "/producto/steam-20", "/cuenta", "/ayuda", "/checkout", "/pedidos", "/condiciones"]) {
      await page.goto(path);
      await expect(page.getByRole("link", { name: "AYALANET, ir al catálogo" })).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/");
  await expect(page.locator(".product-card")).toHaveCount(6);
  await page.getByRole("button", { name: "Añadir Steam Wallet al carrito" }).click();
  await page.getByRole("link", { name: "Ver carrito, 1 productos" }).click();
  await page.getByRole("button", { name: "Quitar una unidad de Steam Wallet" }).click();
  await expect(page.getByRole("heading", { name: "Tu carrito está vacío" })).toBeVisible();
  await page.goto("/"); await expect(page.locator(".product-card")).toHaveCount(6);
  await page.screenshot({ path: "docs/screenshots/mobile.png", fullPage: true });
});

test("cuenta de cliente: conserva el pedido de invitado, salida, entrada y recuperación", async ({ page }) => {
  await page.goto("/"); await expect(page.locator(".product-card")).toHaveCount(6);
  await page.getByRole("button", { name: "Añadir Steam Wallet al carrito" }).click();
  await page.goto("/checkout"); await page.getByRole("checkbox").check(); await page.getByRole("button", { name: "Guardar pedido de prueba" }).click();
  await expect(page).toHaveURL(/\/pedido\/DEMO-/);
  const orderUrl = page.url(); const username = `user_${randomUUID().slice(0, 8)}`;
  await page.goto("/cuenta"); await page.getByRole("button", { name: "Crear cuenta", exact: true }).click();
  await page.getByLabel("Nombre para mostrar", { exact: true }).fill("Cliente ejemplo");
  await page.getByLabel("Usuario", { exact: true }).fill(username);
  await page.getByLabel("Contraseña", { exact: true }).fill(demoPassword);
  await page.getByRole("button", { name: "Crear mi cuenta" }).click();
  await expect(page.getByRole("heading", { name: "Tu clave de recuperación" })).toBeVisible();
  const recoveryKey = await page.locator(".recovery-key").innerText();
  await page.getByRole("button", { name: "Ya la guardé" }).click();
  await page.screenshot({ path: "docs/screenshots/account.png", fullPage: true });
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await page.goto(orderUrl); await expect(page.locator(".error-message[role=alert]")).toContainText("Pedido no encontrado");
  await page.goto("/cuenta"); await page.getByLabel("Usuario", { exact: true }).fill(username); await page.getByLabel("Contraseña", { exact: true }).fill(demoPassword);
  await page.getByRole("button", { name: "Iniciar sesión" }).click(); await expect(page.getByRole("heading", { name: "Hola, Cliente ejemplo" })).toBeVisible();
  await page.goto("/pedidos"); await expect(page.locator(".order-card")).toHaveCount(1);
  await page.goto("/cuenta"); await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await page.getByRole("button", { name: "Olvidé mi contraseña" }).click(); await page.getByLabel("Usuario", { exact: true }).fill(username);
  await page.getByLabel("Clave de recuperación", { exact: true }).fill(recoveryKey); await page.getByLabel("Nueva contraseña").fill("Otra contraseña de prueba 456789");
  await page.getByRole("button", { name: "Restablecer acceso" }).click(); await expect(page.locator(".recovery-key")).toBeVisible(); await expect(page.locator(".recovery-key")).not.toHaveText(recoveryKey);
});

test("ayuda: consulta persistente, respuesta del cliente y cierre", async ({ page }) => {
  await page.goto("/ayuda"); await expect(page.getByRole("button", { name: "Guardar consulta" })).toBeEnabled();
  await page.getByLabel("Asunto", { exact: true }).fill("Revisar región de una tarjeta");
  await page.getByLabel("Mensaje", { exact: true }).fill("¿Esta tarjeta de ejemplo sirve para mi cuenta de Estados Unidos?");
  await page.getByRole("button", { name: "Guardar consulta" }).click();
  await expect(page.locator(".success-message")).toContainText("Consulta guardada");
  await page.locator(".ticket-card summary").click();
  await page.getByLabel("Añadir mensaje").fill("La cuenta utiliza dólares estadounidenses.");
  await page.getByRole("button", { name: "Guardar mensaje", exact: true }).click();
  await expect(page.locator(".message-bubble")).toHaveCount(2);
  await page.reload(); await page.locator(".ticket-card summary").click();
  await expect(page.locator(".message-bubble")).toHaveCount(2);
  await page.screenshot({ path: "docs/screenshots/support.png", fullPage: true });
  await page.getByRole("button", { name: "Cerrar consulta", exact: true }).click();
  await expect(page.locator(".ticket-card .draft-badge")).toHaveText("Cerrada");
});

test("API: autorización, origen, precios, reintentos y bloqueo de estados de pago", async ({ playwright }) => {
  const client = await playwright.request.newContext({ baseURL }), other = await playwright.request.newContext({ baseURL });
  const input = { items: [{ productId: "free-fire-110", quantity: 2 }] }, headers = { ...origin, "Idempotency-Key": randomUUID() };
  try {
    expect((await client.get("/api/orders")).status()).toBe(401);
    const session = await client.get("/api/session"); expect(session.headers()["set-cookie"]).toContain("HttpOnly"); expect(session.headers()["set-cookie"]).toContain("SameSite=strict");
    expect((await client.post("/api/orders", { data: input, headers: { ...headers, Origin: "https://untrusted.example" } })).status()).toBe(403);
    expect((await client.post("/api/orders", { data: { ...input, totalCents: 1 }, headers })).status()).toBe(400);
    const first = await client.post("/api/orders", { data: input, headers }); expect(first.status()).toBe(201);
    const order = (await first.json()).order; expect(order.totalCents).toBe(250); expect(order.paymentStatus).toBe("not_configured");
    expect((await (await client.post("/api/orders", { data: input, headers })).json()).order.id).toBe(order.id);
    expect((await client.post("/api/orders", { data: { items: [{ productId: "steam-20", quantity: 1 }] }, headers })).status()).toBe(409);
    await other.get("/api/session"); expect((await other.get(`/api/store/orders/${order.id}`)).status()).toBe(404);
    expect((await other.post(`/api/store/orders/${order.id}`, { headers: origin, data: { action: "cancel" } })).status()).toBe(404);
    expect((await client.get("/api/store/admin")).status()).toBe(403);
    expect((await client.get("/api/store/admin/finance")).status()).toBe(403);
    expect((await client.get("/api/store/admin/finance?format=csv")).status()).toBe(403);
    expect((await client.post("/api/store/admin/costs/steam-20", { headers: origin, data: { costMicros: 1, feeMicros: 0 } })).status()).toBe(403);
    expect((await client.post("/api/store/admin/steam-20", { headers: origin, data: { action: "product", product: { priceCents: 1, stock: 10, active: true } } })).status()).toBe(403);
    expect((await client.post("/api/auth/register", { headers: origin, data: { name: "Prueba", username: "role_attack", password: demoPassword, role: "admin" } })).status()).toBe(400);
    expect((await client.post("/api/orders", { headers: { ...headers, "Idempotency-Key": randomUUID() }, data: { ...input, status: "paid" } })).status()).toBe(400);
    expect((await client.post(`/api/store/orders/${order.id}`, { headers: origin, data: { action: "pay" } })).status()).toBe(400);
    expect((await client.get("/api/store/catalog")).headers()["x-frame-options"]).toBe("DENY");
  } finally { await client.dispose(); await other.dispose(); }
});

test("administración: catálogo, consulta y acceso con rol verificado", async ({ page, playwright }) => {
  const customer = await playwright.request.newContext({ baseURL });
  await customer.get("/api/session");
  const ticketResponse = await customer.post("/api/store/support", { headers: { ...origin, "Idempotency-Key": randomUUID() }, data: { subject: "Consulta para administración", message: "Necesito confirmar la compatibilidad de una tarjeta." } });
  expect(ticketResponse.status()).toBe(201);
  const ticket = (await ticketResponse.json()).ticket;
  await page.goto("/admin"); await expect(page.getByRole("heading", { name: "Acceso reservado", exact: true })).toBeVisible();
  const username = `admin_${randomUUID().slice(0, 8)}`;
  const registered = await page.request.post("/api/auth/register", { headers: origin, data: { name: "Administración prueba", username, password: demoPassword } });
  expect(registered.status()).toBe(200);
  // Explicit promotion in the isolated E2E database, never an application endpoint.
  const db = new DatabaseSync(process.env.E2E_DATABASE_PATH!);
  try { db.prepare("UPDATE accounts SET role='admin' WHERE username=?").run(username); } finally { db.close(); }
  await page.reload(); await expect(page.getByRole("button", { name: "Catálogo", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Catálogo", exact: true }).click();
  await page.getByLabel("Precio de Steam Wallet", { exact: true }).fill("22.00");
  await page.getByRole("button", { name: "Guardar Steam Wallet", exact: true }).click();
  await expect(page.getByLabel("Precio de Steam Wallet", { exact: true })).toHaveValue("22.00");
  await expect.poll(async () => (await (await page.request.get("/api/store/catalog")).json()).products.find((p: { id: string }) => p.id === "steam-20").priceCents).toBe(2200);
  await page.getByLabel("Precio de Steam Wallet", { exact: true }).fill("21.50"); await page.getByRole("button", { name: "Guardar Steam Wallet", exact: true }).click();
  await expect(page.getByLabel("Precio de Steam Wallet", { exact: true })).toHaveValue("21.50");
  await expect.poll(async () => (await (await page.request.get("/api/store/catalog")).json()).products.find((p: { id: string }) => p.id === "steam-20").priceCents).toBe(2150);
  await page.getByRole("button", { name: "Consultas", exact: true }).click();
  const open = page.locator(".ticket-card").filter({ hasText: "Consulta para administración" });
  await open.locator("summary").click(); await open.getByLabel("Añadir mensaje").fill("Respuesta administrativa de prueba. Revisaremos la compatibilidad.");
  await open.getByRole("button", { name: "Guardar mensaje" }).click();
  await expect(page.locator(".message-bubble.admin")).toBeVisible();
  expect((await (await customer.get(`/api/store/support/${ticket.id}`)).json()).ticket.messages.at(-1).author).toBe("admin");
  await customer.dispose();
  await page.getByRole("button", { name: "Actividad", exact: true }).click(); await expect(page.locator(".audit-list")).toContainText("Catálogo actualizado");
  await page.screenshot({ path: "docs/screenshots/admin.png", fullPage: true });
});

test("finanzas privadas: cálculos reales del informe, filtros, CSV y estimaciones separadas", async ({ page }) => {
  await page.goto("/"); await expect(page.locator(".product-card")).toHaveCount(6);
  const username = `finance_${randomUUID().slice(0, 8)}`;
  expect((await page.request.post("/api/auth/register", { headers: origin, data: { name: "Finanzas prueba", username, password: demoPassword } })).status()).toBe(200);
  const db = new DatabaseSync(process.env.E2E_DATABASE_PATH!);
  try {
    db.prepare("UPDATE accounts SET role='admin' WHERE username=?").run(username);
    const finance = createFinanceStore(db);
    for (const [kind, amountMicros] of [["sale", 10_000_000], ["purchase", 6_000_000], ["fee", 250_000], ["refund", 1_000_000], ["purchase_refund", 500_000], ["expense", 250_000]] as const) {
      finance.record({ source: "e2e-fixture", externalId: kind, orderId: "ORDER-E2E-ONLY", kind, amountMicros, currency: "USDT", occurredAt: "2026-10-30T12:00:00.000Z" });
    }
  } finally { db.close(); }
  await page.goto("/admin");
  await page.getByLabel("Desde", { exact: true }).fill("2026-10-30"); await page.getByLabel("Hasta", { exact: true }).fill("2026-10-30");
  await page.getByRole("button", { name: "Aplicar período" }).click();
  await expect(page.locator(".profit-metric strong")).toContainText("3.00");
  await expect(page.locator(".finance-metrics article").nth(0)).toContainText("9.00");
  await expect(page.locator(".finance-metrics article").nth(1)).toContainText("5.50");
  const csv = await page.request.get("/api/store/admin/finance?from=2026-10-30&to=2026-10-30&format=csv");
  expect(csv.status()).toBe(200); expect(csv.headers()["content-disposition"]).toContain("attachment"); expect(await csv.text()).toContain('"0.250000"');
  expect((await page.request.post("/api/store/admin/finance", { headers: origin, data: { action: "record", amountMicros: 999999, kind: "sale" } })).status()).toBe(400);
  await page.getByLabel("Coste de Steam Wallet", { exact: true }).fill("18");
  await page.getByLabel("Comisiones de Steam Wallet", { exact: true }).fill("0.50");
  await page.getByRole("button", { name: "Guardar coste de Steam Wallet", exact: true }).click();
  const steam = page.locator(".estimate-row").filter({ has: page.getByRole("heading", { name: "Steam Wallet", exact: true }) });
  await expect(steam.locator(".estimated-profit strong")).toHaveText("3.00 USDT");
  const catalog = (await (await page.request.get("/api/store/catalog")).json()).products;
  expect(catalog[0]).not.toHaveProperty("costMicros"); expect(catalog[0].priceCents).toBe(2150);
  // Remove only explicit fixtures from the isolated E2E database before capturing the empty live report.
  const cleanup = new DatabaseSync(process.env.E2E_DATABASE_PATH!);
  try { cleanup.prepare("DELETE FROM financial_entries WHERE source=?").run("e2e-fixture"); } finally { cleanup.close(); }
  await page.locator(".finance-section").getByRole("button", { name: "Actualizar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Todavía no hay operaciones registradas" })).toBeVisible();
  await expect(page.locator(".profit-metric strong")).toContainText("0.00");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "docs/screenshots/finance.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "docs/screenshots/finance-mobile.png", fullPage: true });
});
