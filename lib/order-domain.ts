import { products } from "./catalog.ts";

export class OrderError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

export type OrderLine = { productId: string; name: string; quantity: number; unitPriceCents: number };
export type DraftOrder = {
  id: string;
  lines: OrderLine[];
  totalCents: number;
  currency: "USDT";
  status: "draft";
  paymentStatus: "not_configured";
  createdAt: string;
};

export function quoteDraft(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new OrderError("Pedido no válido.");
  const body = input as Record<string, unknown>;
  if (Object.keys(body).some((key) => !["items", "method"].includes(key))) throw new OrderError("El precio y el estado se calculan en el servidor.");
  if (body.method !== "usdt_bep20") throw new OrderError("Método de pago no disponible.");
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 12) throw new OrderError("Añade entre 1 y 12 productos.");
  const seen = new Set<string>();
  const lines: OrderLine[] = body.items.map((raw: unknown) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new OrderError("Artículo no válido.");
    const item = raw as Record<string, unknown>;
    if (Object.keys(item).some((key) => !["productId", "quantity"].includes(key))) throw new OrderError("Datos de artículo no válidos.");
    if (typeof item.productId !== "string" || seen.has(item.productId)) throw new OrderError("Producto duplicado o no válido.");
    seen.add(item.productId);
    const product = products.find((p) => p.id === item.productId);
    if (!product) throw new OrderError("Ese producto no está en el catálogo.");
    const quantity = item.quantity;
    if (typeof quantity !== "number" || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > Math.min(10, product.stock)) {
      throw new OrderError(`Revisa la cantidad de ${product.name}.`);
    }
    return { productId: product.id, name: product.name, quantity, unitPriceCents: product.priceCents };
  }).sort((a, b) => a.productId.localeCompare(b.productId));
  const totalCents = lines.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0);
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0) throw new OrderError("Importe no válido.");
  return { lines, totalCents, method: "usdt_bep20" as const };
}
