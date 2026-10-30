"use client";
import { useRef, useState, type FormEvent } from "react";
import type { InventorySummary } from "@/lib/commerce-store";
import { formatUsdt } from "@/lib/finance";
import { api, useResource, useStore } from "./context";
import { ErrorMessage } from "./frame";

type Preview = { count: number; duplicates: number; totalCostMicros: number; region: string };
export function Inventory({ onChange }: { onChange: () => void }) {
  const resource = useResource<InventorySummary>("/api/store/admin/inventory"), { reload } = useStore();
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState(""), [csv, setCsv] = useState(""), [productId, setProductId] = useState("steam-20"), [preview, setPreview] = useState<Preview | null>(null);
  const pending = useRef<{ input: Record<string, unknown>; key: string } | null>(null);
  const data = resource.data, product = data?.products.find(p => p.id === productId);
  function invalidate() { setPreview(null); pending.current = null; setNotice(""); }
  async function validate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = new FormData(e.currentTarget);
    const input = { productId, region: product?.region, label: String(form.get("label")), supplier: String(form.get("supplier")), unitCost: String(form.get("unitCost")), instructions: String(form.get("instructions")), csv };
    setBusy(true); setError(""); setNotice(""); setPreview(null);
    try { const checked = await api<Preview>("/api/store/admin/inventory/preview", input); pending.current = { input, key: crypto.randomUUID() }; setPreview(checked); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function save() {
    if (!pending.current || !preview || preview.duplicates) return;
    setBusy(true); setError("");
    try { const result = await api<{ count: number }>("/api/store/admin/inventory/import", pending.current.input, pending.current.key); setNotice(`Lote guardado: ${result.count} códigos de prueba. Stock actualizado.`); setCsv(""); setPreview(null); pending.current = null; resource.refresh(); onChange(); reload().catch(() => undefined); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function block(id: string, blocked: boolean) { setBusy(true); setError(""); try { await api("/api/store/admin/inventory/block", { id, blocked }); resource.refresh(); onChange(); reload().catch(() => undefined); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  async function file(file?: File) {
    if (!file) return; invalidate();
    if (file.size > 240000) { setError("El archivo debe ocupar como máximo 240 KB."); return; }
    try { setCsv(await file.text()); setError(""); } catch { setError("No se pudo leer el archivo."); }
  }
  return <section className="inventory-section"><div className="section-heading"><div><span className="overline">INVENTARIO CENTRAL DE LA TIENDA</span><h2>Inventario y licencias</h2></div><button className="secondary-button" disabled={busy} onClick={resource.refresh}>Actualizar inventario</button></div><p className="orders-explanation">Importa códigos ficticios, controla existencias y prueba la entrega automática. Cada código se cifra y solo puede asignarse a un pedido. Este inventario todavía no se sincroniza con WordPress ni con proveedores.</p><ErrorMessage text={error || resource.error} />{notice && <p className="info-note" role="status">{notice}</p>}
    {resource.loading ? <p className="loading-state">Consultando inventario…</p> : data && <>
      <div className="admin-metrics inventory-metrics">{data.products.map(p => <div key={p.id}><span>{p.name}</span><strong>{p.managed ? p.available : "—"}</strong><small>{!p.managed ? "Sin lote importado" : p.lowStock ? "Stock bajo · mínimo sugerido 4" : "Códigos disponibles"}</small></div>)}</div>
      <div className="inventory-layout"><section className="surface"><h3>Importar un lote</h3><p className="muted">Hasta 500 códigos por lote. Puedes cargar CSV o pegar un código por línea.</p><form className="form-stack" onSubmit={validate} onChange={invalidate}>
        <label>Producto<select value={productId} onChange={e => setProductId(e.target.value)} disabled={busy}>{data.products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><p className="field-hint">Región del lote: <strong>{product?.region}</strong></p>
        <div className="form-pair"><label>Nombre del lote<input name="label" required maxLength={80} placeholder="Lote de pruebas 001" disabled={busy} /></label><label>Proveedor del lote<input name="supplier" required maxLength={100} placeholder="Proveedor de pruebas" disabled={busy} /></label></div>
        <label>Coste unitario de prueba (USDT)<input name="unitCost" required inputMode="decimal" defaultValue="0" maxLength={16} disabled={busy} /></label>
        <label>Instrucciones de canje<textarea name="instructions" required maxLength={2000} defaultValue="Código ficticio para probar la entrega. No introducir en una plataforma real." disabled={busy} /></label>
        <label>Archivo CSV o TXT<input type="file" accept=".csv,.txt,text/csv,text/plain" disabled={busy} onChange={e => { void file(e.target.files?.[0]); }} /></label>
        <label>Códigos del lote<textarea className="code-input" value={csv} onChange={e => setCsv(e.target.value)} placeholder={'code,expires_on\nDEMO-STEAM-001,\nDEMO-STEAM-002,'} required maxLength={240000} disabled={busy} rows={5} /></label>
        <button className="secondary-button" disabled={busy}>Validar lote antes de importar</button>
      </form>{preview && <div className="import-preview" role="status"><h4>Revisión del lote</h4><p>{preview.count} códigos · {preview.region}</p><p>Coste del lote de prueba: {formatUsdt(preview.totalCostMicros)} USDT</p><p>{preview.duplicates ? `${preview.duplicates} códigos ya existen. Corrige el archivo; no se importará ninguna fila.` : "Sin duplicados. Listo para importar."}</p><button className="primary-button" disabled={busy || preview.duplicates > 0} onClick={save}>Confirmar importación de prueba</button></div>}</section>
      <aside className="surface inventory-guide"><span className="overline">CÓDIGOS BAJO CONTROL</span><h3>De lote a entrega</h3><ol><li><strong>Valida antes de guardar.</strong><p>Solo se aceptan códigos DEMO-. El lote se importa completo o se rechaza completo.</p></li><li><strong>Stock calculado.</strong><p>Después del primer lote, las existencias del producto se calculan con los códigos disponibles.</p></li><li><strong>Entrega privada.</strong><p>La compra con saldo asigna primero los códigos que caducan antes. Los vencidos y bloqueados no se venden.</p></li><li><strong>Costes privados.</strong><p>Los costes del lote solo aparecen en administración. Las pruebas no generan ventas en el informe financiero.</p></li></ol><h4>Formato del CSV</h4><code className="csv-example">code,expires_on<br />DEMO-EJEMPLO-001,2099-12-31<br />DEMO-EJEMPLO-002,</code><p className="muted">Fecha opcional AAAA-MM-DD, válida hasta el final del día UTC. No pegues licencias reales ni contraseñas.</p></aside></div>
      <section className="surface wallet-history table-scroll"><table><caption>Últimos 100 lotes · importes y proveedores privados</caption><thead><tr><th>Lote</th><th>Proveedor</th><th>Coste / código</th><th>Disponibles</th><th>Entregados</th><th>Bloqueados</th><th>Vencidos</th></tr></thead><tbody>{data.batches.map(b => <tr key={b.id}><td><strong>{b.label}</strong><small className="cell-detail">{data.products.find(p => p.id === b.productId)?.name} · {b.region}</small></td><td>{b.supplier}</td><td>{formatUsdt(b.unitCostMicros)} USDT</td><td>{b.available}</td><td>{b.delivered}</td><td>{b.blocked}</td><td>{b.expired}</td></tr>)}</tbody></table>{!data.batches.length && <p className="muted">Todavía no hay lotes importados.</p>}</section>
      <section className="surface wallet-history table-scroll"><table><caption>Últimas 200 unidades · los códigos permanecen ocultos</caption><thead><tr><th>Referencia</th><th>Lote</th><th>Caducidad UTC</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{data.units.map(u => <tr key={u.id}><td><code>{u.id.slice(0, 8)}</code></td><td>{u.batchLabel}</td><td>{u.expiresOn || "Sin indicar"}</td><td>{{ available: "Disponible", delivered: "Entregado", blocked: "Bloqueado", expired: "Vencido" }[u.status]}</td><td>{!u.orderId && ["available", "blocked"].includes(u.status) ? <button className="text-button" disabled={busy} onClick={() => block(u.id, u.status !== "blocked")}>{u.status === "blocked" ? "Desbloquear" : "Bloquear"}</button> : "No reutilizable"}</td></tr>)}</tbody></table></section>
    </>}</section>;
}
