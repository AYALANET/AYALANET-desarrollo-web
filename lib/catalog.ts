export type Category = "Gift cards" | "Juegos" | "Recargas";

export type Product = {
  id: string;
  name: string;
  description: string;
  category: Category;
  priceCents: number;
  stock: number;
  region: string;
  color: string;
  mark: string;
  badge?: string;
  active?: boolean;
  inventoryManaged?: boolean;
};

// Catálogo ficticio para desarrollo. No representa existencias de los proveedores.
export const products: readonly Product[] = [
  { id: "steam-20", name: "Steam Wallet", description: "Tarjeta de regalo · 20 USD", category: "Gift cards", priceCents: 2150, stock: 8, region: "Estados Unidos", color: "#223950", mark: "S", badge: "Favorito" },
  { id: "free-fire-110", name: "Free Fire", description: "Recarga · 110 diamantes", category: "Recargas", priceCents: 125, stock: 10, region: "Latinoamérica", color: "#b85b2c", mark: "FF", badge: "Popular" },
  { id: "xbox-10", name: "Xbox Gift Card", description: "Tarjeta de regalo · 10 USD", category: "Gift cards", priceCents: 1090, stock: 6, region: "Estados Unidos", color: "#21704b", mark: "X" },
  { id: "roblox-400", name: "Roblox", description: "Tarjeta digital · 400 Robux", category: "Juegos", priceCents: 590, stock: 5, region: "Según activación", color: "#6f55ae", mark: "R" },
  { id: "playstation-10", name: "PlayStation Store", description: "Tarjeta de regalo · 10 USD", category: "Gift cards", priceCents: 1120, stock: 7, region: "Estados Unidos", color: "#31579d", mark: "PS" },
  { id: "pubg-60", name: "PUBG Mobile", description: "Recarga · 60 UC", category: "Recargas", priceCents: 119, stock: 10, region: "Global", color: "#926c22", mark: "PUBG" },
];

export function formatAmount(cents: number) {
  return (cents / 100).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export type Cart = Record<string, number>;
export function sanitizeCart(input: unknown, catalog: readonly Product[] = products): Cart {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const result: Cart = {};
  for (const product of catalog) {
    const n = (input as Record<string, unknown>)[product.id];
    if (product.active !== false && typeof n === "number" && Number.isSafeInteger(n) && n > 0 && product.stock > 0) result[product.id] = Math.min(n, 10, product.stock);
  }
  return result;
}
