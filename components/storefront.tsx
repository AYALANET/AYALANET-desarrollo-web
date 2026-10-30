"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { products, formatAmount, type Category } from "@/lib/catalog";
import type { DraftOrder } from "@/lib/order-domain";

function Icon({ name, size = 20 }: { name: "bag" | "search" | "arrow" | "check" | "gift" | "bolt" | "shield"; size?: number }) {
  const paths = {
    bag: "M5 7h14l1 14H4L5 7Zm4 0V5a3 3 0 0 1 6 0v2",
    search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
    arrow: "M5 12h14m-6-6 6 6-6 6", check: "m5 12 4 4L19 6",
    gift: "M3 9h18v4H3V9Zm2 4v8h14v-8M12 9v12M12 9H8a3 3 0 1 1 3-3l1 3Zm0 0h4a3 3 0 1 0-3-3l-1 3Z",
    bolt: "m13 2-9 12h7l-1 8 10-13h-7l1-7Z",
    shield: "m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Zm-5 10 3 3 7-7",
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

type Cart = Record<string, number>;
const categories: (Category | "Todo")[] = ["Todo", "Gift cards", "Juegos", "Recargas"];

export default function Storefront() {
  const [category, setCategory] = useState<(typeof categories)[number]>("Todo");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Cart>({});
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<"catalog" | "orders">("catalog");
  const [orders, setOrders] = useState<DraftOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const requestKey = useRef<string | null>(null);
  const cartSection = useRef<HTMLElement>(null);

  useEffect(() => {
    fetch("/api/session", { cache: "no-store" }).then((response) => {
      if (!response.ok) throw new Error();
      setReady(true);
    }).catch(() => setError("No pudimos iniciar la sesión. Recarga la página para volver a intentarlo."));
  }, []);

  const shown = products.filter((p) => (category === "Todo" || p.category === category) && `${p.name} ${p.description}`.toLowerCase().includes(search.toLowerCase()));
  const cartLines = products.filter((p) => cart[p.id]);
  const quantity = Object.values(cart).reduce((sum, n) => sum + n, 0);
  const total = cartLines.reduce((sum, p) => sum + p.priceCents * cart[p.id], 0);

  function changeQuantity(id: string, difference: number) {
    if (saving) return;
    const product = products.find((p) => p.id === id);
    if (!product) return;
    setCart((previous) => {
      const next = { ...previous };
      const amount = Math.max(0, Math.min(product.stock, 10, (next[id] || 0) + difference));
      if (amount) next[id] = amount; else delete next[id];
      return next;
    });
    requestKey.current = null; setNotice(""); setError("");
  }

  async function showOrders() {
    setView("orders"); setLoadingOrders(true); setError("");
    try {
      const response = await fetch("/api/orders", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setOrders(data.orders);
    } catch (e) { setError(e instanceof Error ? e.message : "No pudimos consultar los pedidos."); }
    finally { setLoadingOrders(false); }
  }

  async function saveOrder() {
    if (!quantity || saving || !ready) return;
    setSaving(true); setError(""); setNotice("");
    requestKey.current ||= crypto.randomUUID();
    try {
      const response = await fetch("/api/orders", {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": requestKey.current },
        body: JSON.stringify({ method: "usdt_bep20", items: cartLines.map((p) => ({ productId: p.id, quantity: cart[p.id] })) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No pudimos guardar el pedido.");
      setNotice(`Pedido de prueba ${data.order.id.slice(0, 13)} guardado. No se ha realizado ningún cobro.`);
      setCart({}); requestKey.current = null;
    } catch (e) { setError(e instanceof Error ? e.message : "No pudimos guardar el pedido."); }
    finally { setSaving(false); }
  }

  return <>
    <div className="preview-strip"><span className="status-dot" /> Vista de prueba <span className="strip-divider">·</span> Productos y precios de ejemplo. Sin cobros ni entregas reales.</div>
    <header className="site-header"><div className="header-inner">
      <button className="brand" onClick={() => setView("catalog")} aria-label="AYALANET, ir al catálogo"><span className="brand-symbol"><Icon name="bolt" size={24} /></span>AYALANET<span className="brand-dot">.</span></button>
      <nav aria-label="Navegación principal"><button className={view === "catalog" ? "nav-active" : ""} onClick={() => setView("catalog")}>Tienda</button><button className={view === "orders" ? "nav-active" : ""} onClick={showOrders} disabled={!ready}>Mis pedidos</button></nav>
      <button className="header-cart" onClick={() => { setView("catalog"); setTimeout(() => cartSection.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0); }} aria-label={`Ver carrito, ${quantity} productos`}><Icon name="bag" /><span className="cart-word">Mi carrito</span><span className="cart-count">{quantity}</span></button>
    </div></header>
    <main className="store-shell">
      <div className="breadcrumb">Inicio <span>/</span> {view === "catalog" ? "Tienda digital" : "Mis pedidos"}</div>
      {view === "catalog" ? <>
        <section className="hero">
          <div className="hero-copy"><div className="eyebrow"><span /> TU MUNDO DIGITAL, EN UN SOLO LUGAR</div><h1>Más juego.<br />Más posibilidades<span>.</span></h1><p>Gift cards, recargas y tus favoritos digitales.<br className="desktop-break" /> Elige lo que sigue para ti.</p><a className="hero-button" href="#catalogo">Explorar catálogo <Icon name="arrow" size={18} /></a><div className="hero-note"><Icon name="shield" size={15} /> Una nueva experiencia AYALANET</div></div>
          <div className="hero-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="floating-tag tag-top"><span className="tiny-icon">✦</span> TUS FAVORITOS</div><div className="hero-card card-back"><span>DIGITAL GIFT CARD</span><b>PLAY<br />YOUR WAY.</b><i>AYALANET</i></div><div className="hero-card card-front"><div><Icon name="gift" size={28} /><span>GIFT CARD</span></div><b>Un mundo<br />por descubrir.</b><div className="card-foot"><span>AYALANET</span><span>✦</span></div></div><div className="floating-tag tag-bottom"><span className="green-check"><Icon name="check" size={15} /></span> HECHO PARA TU DÍA A DÍA</div><span className="star star-one">✦</span><span className="star star-two">✧</span></div>
        </section>
        <div className="benefit-row"><div><Icon name="gift" /><span>Todo tu entretenimiento</span></div><div><Icon name="bag" /><span>Pedidos en un solo lugar</span></div><div><Icon name="shield" /><span>Pagos automáticos en preparación</span></div></div>
        <div className="shop-grid" id="catalogo"><section className="catalog-section" aria-labelledby="catalog-title">
          <div className="section-heading"><div><span className="overline">ENCUENTRA TU PRÓXIMO FAVORITO</span><h2 id="catalog-title">Nuestro catálogo<span>.</span></h2></div><span className="result-count">{shown.length} productos</span></div>
          <div className="catalog-tools"><div className="category-tabs" aria-label="Categorías">{categories.map((c) => <button key={c} className={category === c ? "selected" : ""} aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</button>)}</div><label className="search-box"><Icon name="search" size={17} /><input aria-label="Buscar productos" placeholder="Buscar producto" value={search} onChange={(e) => setSearch(e.target.value)} /></label></div>
          <div className="products">{shown.map((product) => <article className="product-card" key={product.id}>
            <div className="product-art" style={{ "--product-color": product.color } as CSSProperties}><div className="art-grain" />{product.badge && <span className="product-badge">{product.badge}</span>}<span className={`product-mark ${product.mark.length > 2 ? "small-mark" : ""}`}>{product.mark}</span><span className="art-caption">{product.category.toUpperCase()}</span></div>
            <div className="product-body"><span className="product-region">{product.region}</span><h3>{product.name}</h3><p>{product.description}</p><div className="product-bottom"><div className="product-price">{formatAmount(product.priceCents)} <small>USDT</small></div><button className="add-button" disabled={saving || (cart[product.id] || 0) >= Math.min(10, product.stock)} aria-label={`Añadir ${product.name} al carrito`} onClick={() => changeQuantity(product.id, 1)}><span>+</span></button></div></div>
          </article>)}</div>
          {!shown.length && <div className="empty-search"><Icon name="search" size={30} /><h3>No encontramos ese producto</h3><p>Prueba otro nombre o una categoría diferente.</p><button onClick={() => { setSearch(""); setCategory("Todo"); }}>Ver todos los productos</button></div>}
          <div className="telegram-card"><span className="telegram-symbol">➤</span><div><h3>Tu tienda, más cerca de ti</h3><p>Próximamente, atención y avisos de tus pedidos por Telegram.</p></div><span className="soon-badge">En preparación</span></div>
        </section>
        <aside className="cart-panel" ref={cartSection} aria-label="Resumen del carrito"><div className="cart-title"><h2><Icon name="bag" size={21} /> Tu carrito</h2><span>{quantity}</span></div>
          {cartLines.length ? <div className="cart-items">{cartLines.map((p) => <div className="cart-item" key={p.id}><div className="cart-product-mark" style={{ background: p.color }}>{p.mark}</div><div className="cart-product-detail"><h3>{p.name}</h3><p>{formatAmount(p.priceCents)} USDT</p><div className="quantity-control"><button disabled={saving} onClick={() => changeQuantity(p.id, -1)} aria-label={`Quitar una unidad de ${p.name}`}>−</button><span>{cart[p.id]}</span><button disabled={saving || cart[p.id] >= Math.min(10, p.stock)} onClick={() => changeQuantity(p.id, 1)} aria-label={`Añadir una unidad de ${p.name}`}>+</button></div></div></div>)}</div> : <div className="empty-cart"><span><Icon name="bag" size={31} /></span><h3>Aquí empieza tu próxima compra</h3><p>Añade tus favoritos y prepara<br />tu primer pedido de prueba.</p></div>}
          <div className="cart-total"><span>Total</span><strong>{formatAmount(total)} <small>USDT</small></strong></div>
          <div className="payment-option"><span className="tether-icon">₮</span><div><strong>USDT · BEP20</strong><span>Cobro aún no habilitado</span></div><span className="inactive-radio" /></div>
          <div className="binance-option"><span>◇</span> Binance Pay <small>Pendiente de cuenta comercial</small></div>
          <button className="checkout-button" disabled={!quantity || !ready || saving} onClick={saveOrder}>{saving ? "Guardando…" : "Guardar pedido de prueba"}<Icon name="arrow" size={17} /></button>
          <p className="checkout-note">El pedido queda como borrador. No envíes dinero: todavía no se ha configurado el cobro.</p>
          <div className="messages" aria-live="polite">{notice && <div className="success-message"><Icon name="check" size={18} /><p>{notice} <button onClick={showOrders}>Ver mis pedidos</button></p></div>}{error && <p className="error-message" role="alert">{error}</p>}</div>
        </aside></div>
      </> : <section className="orders-section"><div className="section-heading"><div><span className="overline">TU ACTIVIDAD</span><h1>Mis pedidos<span>.</span></h1></div><button className="back-catalog" onClick={() => setView("catalog")}>Volver a la tienda <Icon name="arrow" size={16} /></button></div><p className="orders-explanation">Borradores de esta sesión del navegador. Son pedidos de prueba, sin pagos ni entregas.</p>{loadingOrders ? <p className="loading-state" role="status">Consultando tus pedidos…</p> : !orders.length ? <div className="empty-search"><Icon name="bag" size={34} /><h3>Todavía no tienes pedidos</h3><p>Explora el catálogo y guarda tu primer borrador.</p></div> : <div className="order-list">{orders.map((order) => <article key={order.id} className="order-card"><div className="order-top"><span className="order-reference">{order.id.slice(0, 18)}</span><span className="draft-badge">Borrador · sin pago</span></div><p className="order-date">{new Date(order.createdAt).toLocaleString("es-PE")}</p>{order.lines.map((line) => <div key={line.productId} className="order-line"><span>{line.quantity} × {line.name}</span><span>{formatAmount(line.unitPriceCents * line.quantity)} USDT</span></div>)}<div className="order-total"><span>Total del borrador</span><strong>{formatAmount(order.totalCents)} USDT</strong></div></article>)}</div>}{error && <p className="error-message" role="alert">{error}</p>}</section>}
    </main>
    <footer className="site-footer"><div><span className="footer-brand">AYALANET<span>.</span></span><p>Tu mundo digital, a tu manera.</p></div><span>Primera versión · Catálogo de demostración</span><span>Hecho para lo que viene <span className="footer-star">✦</span></span></footer>
  </>;
}
