"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { sanitizeCart, type Product, type Cart } from "@/lib/catalog";
import type { Account } from "@/lib/identity-store";

export async function api<T>(url: string, body?: unknown, key?: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...(body !== undefined ? { method: "POST", headers: { "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) }, body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudo completar la operación.");
  return data as T;
}
type StoreContext = {
  products: Product[]; cart: Cart; ready: boolean; account: Account | null; error: string;
  quantity: number; total: number; updateCart: (id: string, difference: number) => void;
  clearCart: () => void; reload: () => Promise<void>; setAccount: (a: Account | null) => void;
};
const Context = createContext<StoreContext | null>(null);
const CART_KEY = "ayalanet-cart-v1";
export function StoreProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]), [cart, setCart] = useState<Cart>({});
  const [ready, setReady] = useState(false), [account, setAccount] = useState<Account | null>(null), [error, setError] = useState("");
  const reload = useCallback(async () => {
    const [session, catalog] = await Promise.all([api<{ account: Account | null }>("/api/session"), api<{ products: Product[] }>("/api/store/catalog")]);
    let stored: unknown = {};
    try { stored = JSON.parse(localStorage.getItem(CART_KEY) || "{}"); } catch { /* Storage may be unavailable. */ }
    setProducts(catalog.products); setCart(sanitizeCart(stored, catalog.products)); setAccount(session.account); setReady(true); setError("");
  }, []);
  useEffect(() => { Promise.resolve().then(reload).catch(() => setError("No pudimos cargar la tienda. Revisa la conexión y vuelve a intentarlo.")); }, [reload]);
  useEffect(() => { if (ready) { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* The cart remains usable in memory. */ } } }, [cart, ready]);
  useEffect(() => {
    function sync(event: StorageEvent) { if (event.key === CART_KEY) { try { setCart(sanitizeCart(JSON.parse(event.newValue || "{}"), products)); } catch { /* Ignore malformed storage. */ } } }
    window.addEventListener("storage", sync); return () => window.removeEventListener("storage", sync);
  }, [products]);
  function updateCart(id: string, difference: number) { setCart(old => sanitizeCart({ ...old, [id]: (old[id] || 0) + difference }, products)); }
  const total = products.reduce((n, p) => n + p.priceCents * (cart[p.id] || 0), 0), quantity = Object.values(cart).reduce((n, q) => n + q, 0);
  return <Context.Provider value={{ products, cart, ready, account, error, quantity, total, updateCart, clearCart: () => setCart({}), reload, setAccount }}>{children}</Context.Provider>;
}
export function useStore() { const context = useContext(Context); if (!context) throw new Error("StoreProvider required"); return context; }
export function useResource<T>(url: string, enabled = true) {
  const { account } = useStore();
  const scope = `${url}:${account?.id || "guest"}`;
  const [result, setResult] = useState<{ scope: string; data: T | null; error: string } | null>(null), [version, setVersion] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    // Refresh without closing conversations. Never show another account's cached data.
    api<T>(url).then(data => { if (!cancelled) setResult({ scope, data, error: "" }); }).catch(e => { if (!cancelled) setResult({ scope, data: null, error: e.message }); });
    return () => { cancelled = true; };
  }, [url, enabled, version, scope]);
  const current = enabled && result?.scope === scope ? result : null;
  return { data: current?.data || null, error: current?.error || "", loading: !current, refresh: () => setVersion(n => n + 1) };
}
