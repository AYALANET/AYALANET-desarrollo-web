"use client";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import type { Delivery, Wallet } from "@/lib/commerce-store";
import type { DraftOrder } from "@/lib/order-domain";
import { formatUsdt } from "@/lib/finance";
import { products } from "@/lib/catalog";
import { api, useResource, useStore } from "./context";
import { Empty, ErrorMessage, PageHeading } from "./frame";

const time = (value: string) => new Date(value).toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" });
const labels = { demo_credit: "Saldo de bienvenida · prueba", demo_purchase: "Compra de prueba", demo_refund: "Devolución de prueba" };
export function WalletPage() {
  const { ready, account } = useStore();
  if (!ready) return <p className="loading-state">Cargando billetera…</p>;
  return <><PageHeading eyebrow="TU SALDO, SIEMPRE A MANO" title="Mi billetera"><Link href="/pedidos" className="back-catalog">Ver pedidos</Link></PageHeading>{account ? <WalletContent key={account.id} /> : <Empty title="Tu billetera va contigo"><p>Inicia sesión o crea una cuenta para conservar tu saldo e historial.</p><Link href="/cuenta" className="primary-button">Entrar a mi cuenta</Link></Empty>}</>;
}
function WalletContent() {
  const resource = useResource<Wallet>("/api/store/wallet"), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const pending = useRef<{ amount: string; key: string } | null>(null);
  async function credit() { setBusy(true); setError(""); try { await api("/api/store/wallet", { action: "demo_credit" }); resource.refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  async function topup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const amount = String(new FormData(e.currentTarget).get("amount"));
    if (pending.current?.amount !== amount) pending.current = { amount, key: crypto.randomUUID() };
    setBusy(true); setError(""); setNotice("");
    try { await api("/api/store/wallet", { action: "topup", amount }, pending.current.key); pending.current = null; setNotice("Solicitud guardada. AyalaPay aún no está conectado: no envíes fondos. El saldo no ha cambiado."); resource.refresh(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const wallet = resource.data;
  return <><ErrorMessage text={error || resource.error} />{resource.loading ? <p className="loading-state">Consultando tu saldo…</p> : wallet && <>
    <div className="wallet-layout"><section className="wallet-balance"><span className="overline">SALDO DE PRUEBA</span><h2>{formatUsdt(wallet.balanceMicros)} <small>USDT</small></h2><p>Crédito ficticio para probar compras en esta tienda. No tiene valor monetario ni permite retiros o transferencias.</p><div className="button-row">{wallet.demoCreditAvailable && <button className="primary-button" disabled={busy} onClick={credit}>Añadir 50 USDT de prueba</button>}<Link href="/" className="secondary-button">Explorar productos</Link></div><span className="wallet-footnote">La carga de prueba se concede una sola vez por cuenta.</span></section>
    <section className="surface"><span className="overline">RECARGAS · PRÓXIMAMENTE</span><h2>Añadir saldo con AyalaPay</h2><p className="muted">Podrás recargar y usar tu saldo en varias compras. Hoy solo puedes preparar una solicitud; no genera un cobro ni una dirección de depósito.</p><form className="form-stack" onSubmit={topup}><label>Importe de recarga (USDT)<input name="amount" inputMode="decimal" defaultValue="20" required maxLength={15} disabled={busy} /></label><button className="secondary-button" disabled={busy}>Preparar solicitud de recarga</button></form>{notice && <p className="info-note" role="status">{notice}</p>}</section></div>
    <section className="surface wallet-history"><div className="section-heading"><div><span className="overline">CADA MOVIMIENTO CUENTA</span><h2>Historial de saldo</h2></div><button className="secondary-button" onClick={resource.refresh}>Actualizar saldo</button></div><p className="muted">Últimos 100 movimientos. Las solicitudes pendientes no aumentan el saldo.</p>{wallet.entries.length ? <ol className="wallet-ledger">{wallet.entries.map((entry, i) => <li key={i}><div><strong>{labels[entry.kind]}</strong><span>{time(entry.createdAt)}</span>{entry.reference.startsWith("DEMO-") && <Link href={`/pedido/${entry.reference}`}>Ver pedido →</Link>}</div><strong className={entry.amountMicros > 0 ? "amount-credit" : ""}>{entry.amountMicros > 0 ? "+" : ""}{formatUsdt(entry.amountMicros)} <small>USDT</small></strong></li>)}</ol> : <p className="muted">Tu billetera todavía no tiene movimientos.</p>}</section>
    {wallet.topups.length > 0 && <section className="surface wallet-history"><h2>Solicitudes de recarga</h2><p className="muted">Últimas 100 solicitudes. Pendientes de integrar AyalaPay; no se procesarán automáticamente al habilitar los pagos.</p><ul className="wallet-ledger">{wallet.topups.map(t => <li key={t.id}><div><strong>{formatUsdt(t.amountMicros)} USDT</strong><span>{time(t.createdAt)}</span><code>{t.id}</code></div><span className="draft-badge">Sin cobro · integración pendiente</span></li>)}</ul></section>}
  </>}</>;
}
export function WalletOrder({ order, refresh }: { order: DraftOrder; refresh: () => void }) {
  const { account, reload } = useStore();
  return <WalletOrderContent key={`${account?.id || "guest"}:${order.id}:${order.status}`} order={order} refresh={() => { refresh(); reload().catch(() => undefined); }} />;
}
function WalletOrderContent({ order, refresh }: { order: DraftOrder; refresh: () => void }) {
  const { account } = useStore(), wallet = useResource<Wallet>("/api/store/wallet", !!account);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [reviewed, setReviewed] = useState(false), [deliveries, setDeliveries] = useState<Delivery[] | null>(null);
  async function purchase() { setBusy(true); setError(""); try { await api(`/api/store/orders/${order.id}`, { action: "demo_purchase" }); refresh(); } catch (e) { setError((e as Error).message); wallet.refresh(); } finally { setBusy(false); } }
  async function reveal() { setBusy(true); setError(""); try { const result = await api<{ deliveries: Delivery[] }>(`/api/store/orders/${order.id}`, { action: "reveal" }); setDeliveries(result.deliveries); } catch (e) { setError((e as Error).message); setDeliveries(null); } finally { setBusy(false); } }
  if (order.status === "cancelled") return null;
  return <section className="surface delivery-panel"><span className="overline">BILLETERA Y ENTREGA · PRUEBA</span><h2>{order.status === "demo_refunded" ? "Saldo devuelto" : order.status === "demo_delivered" ? "Tus códigos de prueba" : "Probar compra con saldo"}</h2>
    {order.status === "demo_refunded" ? <p>La devolución figura en tu billetera. Los códigos de este pedido quedaron bloqueados y no volverán a venderse. Bloquearlos aquí no revoca un código en una plataforma externa.</p> : order.status === "demo_delivered" ? <><p className="muted">Entrega privada de códigos ficticios. Ninguno sirve para activar un producto real.</p><button className="secondary-button" disabled={busy} onClick={() => deliveries ? setDeliveries(null) : reveal()}>{deliveries ? "Ocultar códigos" : "Mostrar mis códigos de prueba"}</button>{deliveries && <div className="delivery-list">{deliveries.map(d => <article key={d.id}><h3>{products.find(p => p.id === d.productId)?.name}</h3><code className="delivery-code">{d.code}</code><dl><dt>Región</dt><dd>{d.region}</dd><dt>Caducidad</dt><dd>{d.expiresOn ? `${d.expiresOn} · fin del día UTC` : "Sin caducidad indicada"}</dd><dt>Entregado</dt><dd>{time(d.deliveredAt)}</dd></dl><p className="delivery-instructions">{d.instructions}</p></article>)}</div>}</> : !account ? <><p>Necesitas una cuenta para usar saldo y conservar tus códigos.</p><Link href="/cuenta" className="primary-button">Entrar a mi cuenta</Link></> : <><p className="muted">Solo admite productos con códigos DEMO- importados en Inventario y licencias. Las recargas de juegos esperan la conexión del proveedor.</p><p>Tu saldo de prueba: <strong>{wallet.data ? `${formatUsdt(wallet.data.balanceMicros)} USDT` : "Consultando…"}</strong> · <Link href="/billetera">Ir a mi billetera</Link></p><label className="checkbox-field"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} disabled={busy} /><span>Confirmo el uso de saldo ficticio y la entrega de códigos de prueba.</span></label><button className="primary-button" disabled={busy || !reviewed || !wallet.data} onClick={purchase}>{busy ? "Procesando…" : "Comprar con saldo de prueba"}</button></>}
    <ErrorMessage text={error || wallet.error} />
  </section>;
}
export function DemoRefund({ id, refresh }: { id: string; refresh: () => void }) {
  const [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function refund() { setBusy(true); try { await api(`/api/store/admin/refund/${id}`, { action: "demo_refund" }); refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  return <div className="demo-refund">{confirm ? <><p>Se devolverá el saldo de prueba y los códigos quedarán bloqueados para siempre.</p><button className="danger-button" disabled={busy} onClick={refund}>Confirmar devolución de prueba</button><button className="text-button" disabled={busy} onClick={() => setConfirm(false)}>Volver</button></> : <button className="text-button" onClick={() => setConfirm(true)}>Devolver saldo de prueba</button>}<ErrorMessage text={error} /></div>;
}
