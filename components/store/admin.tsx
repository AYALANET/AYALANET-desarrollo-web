"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { Product } from "@/lib/catalog";
import type { DraftOrder } from "@/lib/order-domain";
import type { Ticket } from "@/lib/order-store";
import { api, useResource, useStore } from "./context";
import { Empty, ErrorMessage, PageHeading } from "./frame";
import { TicketConversation } from "./support";
import { date } from "./orders";
import { formatAmount } from "@/lib/catalog";
import { Finance } from "./finance";

type AdminData = { products: Product[]; orders: DraftOrder[]; tickets: Ticket[]; audit: { action: string; target: string; createdAt: string }[] };
function ProductEditor({ product, refresh }: { product: Product; refresh: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const data = new FormData(e.currentTarget), price = String(data.get("price"));
    if (!/^[0-9]{1,5}(\.[0-9]{1,2})?$/.test(price)) { setError("Escribe un precio con hasta dos decimales."); return; }
    const [units, fraction = ""] = price.split("."); setBusy(true); setError("");
    try { await api(`/api/store/admin/${product.id}`, { action: "product", product: { priceCents: Number(units) * 100 + Number(fraction.padEnd(2, "0")), stock: Number(data.get("stock")), active: data.get("active") === "on" } }); refresh(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <form className="admin-product" onSubmit={save}><div><h3>{product.name}</h3><p>{product.description} · {product.region}</p></div><label>Precio de prueba (USDT)<input aria-label={`Precio de ${product.name}`} name="price" inputMode="decimal" defaultValue={(product.priceCents / 100).toFixed(2)} required disabled={busy} /></label><label>Existencias de prueba<input aria-label={`Existencias de ${product.name}`} name="stock" type="number" min={0} max={10000} step={1} defaultValue={product.stock} required disabled={busy} /></label><label className="checkbox-field"><input name="active" type="checkbox" defaultChecked={product.active !== false} disabled={busy} /> Visible</label><button className="secondary-button" disabled={busy}>Guardar {product.name}</button><ErrorMessage text={error} /></form>;
}
export function Admin() {
  const { ready, account, reload } = useStore(), resource = useResource<AdminData>("/api/store/admin", ready && account?.role === "admin");
  const [tab, setTab] = useState("finance");
  if (!ready) return <p className="loading-state">Comprobando acceso…</p>;
  if (account?.role !== "admin") return <><PageHeading eyebrow="ACCESO PRIVADO" title="Administración" /><Empty title="Acceso reservado"><p>Inicia sesión con una cuenta autorizada para administrar la tienda.</p><Link href="/cuenta" className="primary-button">Ir a mi cuenta</Link></Empty></>;
  const data = resource.data;
  return <><PageHeading eyebrow="PANEL PRIVADO · ENTORNO DE PRUEBAS" title="Administración"><button className="secondary-button" onClick={resource.refresh}>Actualizar</button></PageHeading><p className="orders-explanation">Gestiona el catálogo de muestra y las consultas. Los pedidos permanecen sin pago y no se envían a proveedores.</p><ErrorMessage text={resource.error} />{resource.loading ? <p className="loading-state">Cargando panel…</p> : data && <><div className="admin-metrics"><div><span>Pedidos recientes (hasta 100)</span><strong>{data.orders.length}</strong></div><div><span>Consultas abiertas en la lista</span><strong>{data.tickets.filter(t => t.status === "open").length}</strong></div><div><span>Productos visibles</span><strong>{data.products.filter(p => p.active).length}</strong></div><div><span>Pagos reales</span><strong>Deshabilitados</strong></div></div><div className="category-tabs admin-tabs">{[["finance", "Compras y ganancias"], ["orders", "Pedidos"], ["catalog", "Catálogo"], ["support", "Consultas"], ["audit", "Actividad"]].map(([id, label]) => <button key={id} className={tab === id ? "selected" : ""} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}</div>
    {tab === "finance" && <Finance />}
    {tab === "orders" && <div className="surface table-scroll"><table><caption>Últimos 100 pedidos</caption><thead><tr><th>Referencia</th><th>Fecha</th><th>Productos</th><th>Total</th><th>Estado</th></tr></thead><tbody>{data.orders.map(o => <tr key={o.id}><td><code>{o.id}</code></td><td>{date(o.createdAt)}</td><td>{o.lines.map(l => `${l.quantity} × ${l.name}`).join(", ")}</td><td>{formatAmount(o.totalCents)} USDT</td><td>{o.status === "draft" ? "Borrador" : "Cancelado"}</td></tr>)}</tbody></table>{!data.orders.length && <p>No hay pedidos todavía.</p>}</div>}
    {tab === "catalog" && <section className="surface"><h2>Catálogo de prueba</h2><p className="muted">Estos cambios solo afectan a esta tienda de desarrollo. Los borradores existentes conservan sus precios originales.</p>{data.products.map(p => <ProductEditor key={`${p.id}-${p.priceCents}-${p.stock}-${p.active}`} product={p} refresh={() => { resource.refresh(); reload().catch(() => undefined); }} />)}</section>}
    {tab === "support" && <section>{data.tickets.length ? data.tickets.map(t => <TicketConversation key={t.id} ticket={t} refresh={resource.refresh} admin />) : <Empty title="No hay consultas pendientes" />}</section>}
    {tab === "audit" && <section className="surface"><h2>Últimas acciones administrativas</h2>{data.audit.length ? <ul className="audit-list">{data.audit.map((event, i) => <li key={i}><strong>{event.action === "catalog.update" ? "Catálogo actualizado" : event.action === "support.reply" ? "Respuesta guardada" : event.action === "finance.estimate" ? "Estimación de coste actualizada" : "Consulta cerrada"}</strong><code>{event.target}</code><span>{date(event.createdAt)}</span></li>)}</ul> : <p className="muted">Las modificaciones de catálogo y respuestas aparecerán aquí.</p>}</section>}</>}</>;
}
