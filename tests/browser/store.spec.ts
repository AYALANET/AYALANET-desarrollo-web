import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

test("catálogo, carrito y pedido persistente en escritorio", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1040 });
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Mis pedidos", exact: true })).toBeEnabled();
  await expect(page.locator(".product-card")).toHaveCount(6);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: "docs/screenshots/desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Recargas", exact: true }).click();
  await expect(page.locator(".product-card")).toHaveCount(2);
  await page.getByLabel("Buscar productos").fill("free");
  await expect(page.locator(".product-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Añadir Free Fire al carrito", exact: true }).click();
  await page.getByRole("button", { name: "Añadir una unidad de Free Fire", exact: true }).click();
  await expect(page.locator(".cart-total")).toContainText("2.50");
  await page.getByRole("button", { name: "Guardar pedido de prueba", exact: true }).click();
  await expect(page.locator(".success-message")).toContainText("No se ha realizado ningún cobro");
  await page.getByRole("button", { name: "Ver mis pedidos", exact: true }).click();
  await expect(page.locator(".order-card")).toHaveCount(1);
  await expect(page.locator(".order-card")).toContainText("2 × Free Fire");
  await expect(page.locator(".draft-badge")).toHaveText("Borrador · sin pago");
  await page.reload();
  await page.getByRole("button", { name: "Mis pedidos", exact: true }).click();
  await expect(page.locator(".order-card")).toHaveCount(1);
  expect(failures).toEqual([]);
});

test("móvil sin desbordamiento y carrito navegable", async ({ page }) => {
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Mis pedidos", exact: true })).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Añadir Steam Wallet al carrito", exact: true }).click();
  await page.getByRole("button", { name: "Ver carrito, 1 productos" }).click();
  await expect(page.getByRole("button", { name: "Guardar pedido de prueba", exact: true })).toBeInViewport();
  await page.getByRole("button", { name: "Quitar una unidad de Steam Wallet", exact: true }).click();
  await expect(page.getByRole("button", { name: "Guardar pedido de prueba", exact: true })).toBeDisabled();
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: "docs/screenshots/mobile.png", fullPage: true });
});

test("API: aislamiento, origen, importes e idempotencia", async ({ playwright }) => {
  const baseURL = "http://127.0.0.1:3100";
  const client = await playwright.request.newContext({ baseURL });
  const other = await playwright.request.newContext({ baseURL });
  const input = { method: "usdt_bep20", items: [{ productId: "free-fire-110", quantity: 2 }] };
  const headers = { Origin: baseURL, "Idempotency-Key": randomUUID() };
  try {
    expect((await client.get("/api/orders")).status()).toBe(401);
    const session = await client.get("/api/session");
    expect(session.headers()["set-cookie"]).toContain("HttpOnly");
    expect(session.headers()["set-cookie"]).toContain("SameSite=strict");
    expect((await client.post("/api/orders", { data: input, headers: { ...headers, Origin: "https://untrusted.example" } })).status()).toBe(403);
    expect((await client.post("/api/orders", { data: { ...input, totalCents: 1 }, headers })).status()).toBe(400);
    const first = await client.post("/api/orders", { data: input, headers });
    expect(first.status()).toBe(201);
    const a = (await first.json()).order;
    expect(a.totalCents).toBe(250); expect(a.status).toBe("draft"); expect(a.paymentStatus).toBe("not_configured");
    const second = await client.post("/api/orders", { data: input, headers });
    expect((await second.json()).order.id).toBe(a.id);
    expect((await client.post("/api/orders", { data: { ...input, items: [{ productId: "steam-20", quantity: 1 }] }, headers })).status()).toBe(409);
    await other.get("/api/session");
    expect((await (await other.get("/api/orders")).json()).orders).toHaveLength(0);
    expect((await (await client.get("/api/orders")).json()).orders).toHaveLength(1);
    expect((await client.post("/api/orders", { data: { ...input, status: "paid" }, headers: { ...headers, "Idempotency-Key": randomUUID() } })).status()).toBe(400);
  } finally { await client.dispose(); await other.dispose(); }
});
