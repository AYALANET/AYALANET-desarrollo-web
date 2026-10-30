"use client";
import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { formatAmount, type Product } from "@/lib/catalog";
import { productDetails } from "@/lib/product-details";
import { useStore } from "./context";
import { Icon } from "./icon";
import { Hero } from "./hero";
import { Empty, PageHeading } from "./frame";

export function ProductArt({ product }: { product: Product }) {
  return <div className="product-art" style={{ "--product-color": product.color } as CSSProperties}><div className="art-grain" />{product.badge && <span className="product-badge">{product.badge}</span>}<span className={`product-mark ${product.mark.length > 2 ? "small-mark" : ""}`}>{product.mark}</span><span className="art-caption">{product.category.toUpperCase()}</span></div>;
}
export function ProductCard({ product }: { product: Product }) {
  const { cart, updateCart } = useStore();
  return <article className="product-card"><Link href={`/producto/${product.id}`} aria-label={`Ver ${product.name}`}><ProductArt product={product} /></Link><div className="product-body"><span className="product-region">{product.region}</span><h3><Link href={`/producto/${product.id}`}>{product.name}</Link></h3><p>{product.description}</p><div className="product-bottom"><div className="product-price">{formatAmount(product.priceCents)} <small>USDT</small></div><button className="add-button" disabled={(cart[product.id] || 0) >= Math.min(10, product.stock)} aria-label={`Añadir ${product.name} al carrito`} onClick={() => updateCart(product.id, 1)}>+</button></div><Link className="product-details-link" href={`/producto/${product.id}`}>Ver detalles <Icon name="arrow" size={13} /></Link>{!product.stock && <span className="stock-label">Agotado</span>}</div></article>;
}
export function CartLines({ disabled = false }: { disabled?: boolean }) {
  const { products, cart, updateCart } = useStore();
  return <div className="cart-items">{products.filter(p => cart[p.id]).map(p => <div className="cart-item" key={p.id}><div className="cart-product-mark" style={{ background: p.color }}>{p.mark}</div><div className="cart-product-detail"><h3><Link href={`/producto/${p.id}`}>{p.name}</Link></h3><p>{p.region} · {formatAmount(p.priceCents)} USDT / unidad</p><div className="quantity-control"><button disabled={disabled} onClick={() => updateCart(p.id, -1)} aria-label={`Quitar una unidad de ${p.name}`}>−</button><span>{cart[p.id]}</span><button disabled={disabled || cart[p.id] >= Math.min(10, p.stock)} onClick={() => updateCart(p.id, 1)} aria-label={`Añadir una unidad de ${p.name}`}>+</button></div></div><strong className="line-price">{formatAmount(cart[p.id] * p.priceCents)}</strong></div>)}</div>;
}
export function PaymentPending() {
  return <div className="payment-option"><span className="tether-icon">A</span><div><strong>AyalaPay</strong><span>USDT BEP20 y Binance · Integración pendiente</span></div><Icon name="shield" size={18} /></div>;
}
export function Catalog() {
  const { products, ready, quantity, total, cart } = useStore();
  const [category, setCategory] = useState("Todo"), [search, setSearch] = useState(""), [sort, setSort] = useState("featured"), [available, setAvailable] = useState(false);
  const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const shown = products.filter(p => (category === "Todo" || p.category === category) && normalize(`${p.name} ${p.description} ${p.region}`).includes(normalize(search.trim())) && (!available || p.stock > 0)).sort((a, b) => sort === "price-asc" ? a.priceCents - b.priceCents : sort === "price-desc" ? b.priceCents - a.priceCents : sort === "name" ? a.name.localeCompare(b.name) : 0);
  return <>
    <div className="breadcrumb">Inicio <span>/</span> Tienda digital</div><Hero />
    <div className="benefit-row"><div><Icon name="gift" /><span>Encuentra tus favoritos</span></div><div><Icon name="bag" /><span>Tu historial, siempre a mano</span></div><div><Icon name="shield" /><span>Atención desde tu cuenta</span></div></div>
    <div className="shop-grid" id="catalogo"><section className="catalog-section" aria-labelledby="catalog-title"><div className="section-heading"><div><span className="overline">ENCUENTRA TU PRÓXIMO FAVORITO</span><h2 id="catalog-title">Nuestro catálogo<span>.</span></h2></div><span className="result-count" aria-live="polite">{shown.length} productos</span></div>
      <div className="catalog-tools"><div className="category-tabs" aria-label="Categorías">{["Todo", "Gift cards", "Juegos", "Recargas"].map(c => <button key={c} className={category === c ? "selected" : ""} aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</button>)}</div><label className="search-box"><Icon name="search" size={17} /><input aria-label="Buscar productos" placeholder="Buscar producto o región" value={search} onChange={e => setSearch(e.target.value)} /></label></div>
      <div className="filter-row"><label><input type="checkbox" checked={available} onChange={e => setAvailable(e.target.checked)} /> Solo disponibles</label><label>Ordenar <select value={sort} onChange={e => setSort(e.target.value)} aria-label="Ordenar productos"><option value="featured">Destacados</option><option value="price-asc">Menor precio</option><option value="price-desc">Mayor precio</option><option value="name">Nombre A–Z</option></select></label></div>
      {!ready ? <p className="loading-state" role="status">Cargando catálogo…</p> : shown.length ? <div className="products">{shown.map(p => <ProductCard key={p.id} product={p} />)}</div> : <Empty title="No encontramos ese producto"><p>Prueba otro nombre o una categoría diferente.</p><button onClick={() => { setSearch(""); setCategory("Todo"); setAvailable(false); }}>Ver todos los productos</button></Empty>}
      <div className="telegram-card"><span className="telegram-symbol">➤</span><div><h3>Estamos cerca de ti</h3><p>Consulta tus pedidos y abre una consulta en el centro de ayuda. Los avisos por Telegram llegarán más adelante.</p></div><Link href="/ayuda" className="soon-badge">Ir a ayuda</Link></div>
    </section><aside className="cart-panel" aria-label="Resumen del carrito"><div className="cart-title"><h2><Icon name="bag" size={21} /> Tu carrito</h2><span aria-live="polite">{quantity}</span></div>
      {Object.keys(cart).length ? <CartLines /> : <div className="empty-cart"><span><Icon name="bag" size={31} /></span><h3>Aquí empieza tu próxima compra</h3><p>Añade tus favoritos y revisa<br />todos los detalles del pedido.</p></div>}
      <div className="cart-total"><span>Total</span><strong>{formatAmount(total)} <small>USDT</small></strong></div><PaymentPending />
      <Link href="/checkout" className="checkout-button cart-continue">Revisar pedido <Icon name="arrow" size={17} /></Link><p className="checkout-note">Tu carrito se conserva en este navegador. Los pedidos de esta versión son de prueba.</p>
    </aside></div>
  </>;
}
export function ProductPage({ id }: { id: string }) {
  const { products, ready, cart, updateCart } = useStore(), product = products.find(p => p.id === id), details = productDetails[id];
  const [added, setAdded] = useState(false);
  if (!ready) return <p className="loading-state">Cargando producto…</p>;
  if (!product || !details) return <Empty title="Producto no disponible"><Link href="/">Volver al catálogo</Link></Empty>;
  return <><PageHeading eyebrow={product.category.toUpperCase()} title={product.name}><Link href="/" className="back-catalog">Volver al catálogo</Link></PageHeading><div className="product-detail-grid"><div className="detail-art"><ProductArt product={product} /></div><section className="detail-copy"><span className="product-region">{product.region}</span><h2>{product.description}</h2><p>{details.summary}</p><dl className="product-facts"><div><dt>Plataforma</dt><dd>{details.platform}</dd></div><div><dt>Formato</dt><dd>{details.format}</dd></div><div><dt>Región</dt><dd>{product.region}</dd></div><div><dt>Disponibilidad de prueba</dt><dd>{product.stock ? `${product.stock} unidades` : "Agotado"}</dd></div></dl><div className="detail-price">{formatAmount(product.priceCents)} <small>USDT</small></div><button className="primary-button" disabled={!product.stock || (cart[id] || 0) >= Math.min(10, product.stock)} onClick={() => { updateCart(id, 1); setAdded(true); }}>Añadir {product.name} al carrito <Icon name="bag" size={18} /></button><div aria-live="polite">{added && <p className="success-message">Añadido al carrito. <Link href="/checkout">Revisar pedido →</Link></p>}</div><p className="muted">Producto de ejemplo. El importe y las condiciones se validarán con el proveedor antes de abrir la tienda.</p></section></div>
    <div className="detail-info-grid"><section className="surface"><h2>Antes de elegirlo</h2><ul>{details.requirements.map(text => <li key={text}>{text}</li>)}</ul><p>La región de la cuenta debe ser compatible. Si tienes dudas, <Link href="/ayuda">abre una consulta</Link>.</p></section><section className="surface"><h2>Cómo se utiliza</h2><ol>{details.steps.map(text => <li key={text}>{text}</li>)}</ol><p>Los plazos y condiciones definitivos se mostrarán antes de habilitar compras reales.</p></section></div><section className="related-products"><h2>También puede interesarte</h2><div className="products">{products.filter(p => p.id !== id).slice(0, 3).map(p => <ProductCard key={p.id} product={p} />)}</div></section></>;
}
