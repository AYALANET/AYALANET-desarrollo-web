"use client";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import type { Ticket } from "@/lib/order-store";
import { api, useResource, useStore } from "./context";
import { Empty, ErrorMessage, PageHeading } from "./frame";
import { date } from "./orders";

const faqs = [
  ["¿Puedo comprar ahora?", "Esta versión permite explorar productos y guardar pedidos de prueba. AyalaPay se conectará al finalizar el desarrollo. No envíes dinero por ahora."],
  ["¿Cómo elijo la región correcta?", "Revisa la región indicada en la ficha y compárala con el país de tu cuenta de juego. Si no coincide o tienes dudas, abre una consulta antes de comprar."],
  ["¿Cómo recupero mis pedidos?", "Con una cuenta puedes verlos al iniciar sesión desde otro dispositivo. Los pedidos de invitado se vinculan a tu cuenta al entrar desde ese mismo navegador."],
  ["¿Dónde recibiré mi producto?", "Después de una compra con saldo ficticio, abre el detalle del pedido y pulsa Mostrar mis códigos de prueba. No son licencias reales. Las recargas de juegos requieren conectar los proveedores."],
  ["¿Cómo funciona la billetera?", "La billetera guarda crédito de tienda. Hoy puedes añadir 50 USDT ficticios una sola vez por cuenta y probar compras de códigos DEMO-. Las solicitudes de recarga no aumentan el saldo hasta que exista una integración real, que todavía está pendiente."],
  ["¿Puedo cancelar un borrador?", "Sí. Abre Mis pedidos, entra en el detalle y selecciona Cancelar borrador. El historial se conserva y no se mueve dinero."],
  ["¿Ya funciona la atención por Telegram?", "Todavía no está conectada. Puedes probar las consultas en este centro de ayuda; se guardan aquí y no se envían a Telegram ni por correo."],
];
export function TicketConversation({ ticket, refresh, admin = false }: { ticket: Ticket; refresh: () => void; admin?: boolean }) {
  const [message, setMessage] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const key = useRef<string | null>(null);
  async function send(action: "reply" | "close") {
    setBusy(true); setError(""); key.current ||= crypto.randomUUID();
    try { await api(`/api/store/${admin ? "admin" : "support"}/${ticket.id}`, { action, message }, key.current); key.current = null; setMessage(""); refresh(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <details className="ticket-card"><summary><span><strong>{ticket.subject}</strong><small>{date(ticket.createdAt)} · {ticket.id.slice(0, 12)}</small></span><span className={`draft-badge ${ticket.status === "closed" ? "cancelled-badge" : ""}`}>{ticket.status === "open" ? "Abierta" : "Cerrada"}</span></summary>{ticket.orderId && <p className="muted">{admin ? `Pedido: ${ticket.orderId}` : <Link href={`/pedido/${ticket.orderId}`}>Ver pedido relacionado →</Link>}</p>}<div className="conversation">{ticket.messages.map((m, i) => <div key={i} className={`message-bubble ${m.author}`}><strong>{m.author === "admin" ? "Atención AYALANET" : "Cliente"}</strong><p>{m.text}</p><small>{date(m.createdAt)}</small></div>)}</div>{ticket.status === "open" && <form className="form-stack" onSubmit={e => { e.preventDefault(); void send("reply"); }}><label>Añadir mensaje<textarea value={message} onChange={e => { setMessage(e.target.value); key.current = null; }} minLength={2} maxLength={2000} rows={3} required disabled={busy} /></label><div className="button-row"><button className="primary-button" disabled={busy}>Guardar mensaje</button><button className="secondary-button" type="button" disabled={busy} onClick={() => send("close")}>Cerrar consulta</button></div></form>}<ErrorMessage text={error} /></details>;
}
export function Support({ orderId = "" }: { orderId?: string }) {
  const { ready } = useStore(), resource = useResource<{ tickets: Ticket[] }>("/api/store/support", ready);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const key = useRef<string | null>(null);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; setBusy(true); setError(""); setNotice(""); key.current ||= crypto.randomUUID();
    try { await api("/api/store/support", Object.fromEntries(new FormData(form).entries()), key.current); key.current = null; form.reset(); resource.refresh(); setNotice("Consulta guardada. Puedes seguirla en Mis consultas. No se ha enviado por Telegram ni por correo."); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <><PageHeading eyebrow="ESTAMOS PARA AYUDARTE" title="Centro de ayuda" /><div className="support-grid"><section><div className="faq-list">{faqs.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div><section className="support-history"><div className="section-heading"><h2>Mis consultas</h2><button className="text-button" onClick={resource.refresh}>Actualizar</button></div><ErrorMessage text={resource.error} />{resource.loading ? <p className="loading-state">Consultando…</p> : resource.data?.tickets.length ? resource.data.tickets.map(t => <TicketConversation key={t.id} ticket={t} refresh={resource.refresh} />) : <Empty title="Aún no tienes consultas"><p>Abre una consulta y conserva la conversación aquí.</p></Empty>}</section></section><section className="surface support-form"><h2>Abrir una consulta</h2><p className="muted">Las consultas se guardan en esta tienda de pruebas. No incluyas contraseñas, claves, códigos de canje ni datos de pago.</p><form className="form-stack" onSubmit={create} onChange={() => { key.current = null; }}><label>Asunto<input name="subject" minLength={5} maxLength={100} required disabled={busy} placeholder="¿En qué podemos ayudarte?" /></label><label>Referencia del pedido (opcional)<input name="orderId" defaultValue={orderId} maxLength={80} disabled={busy} placeholder="DEMO-…" /></label><label>Mensaje<textarea name="message" minLength={10} maxLength={2000} rows={6} required disabled={busy} placeholder="Cuéntanos qué necesitas revisar." /></label><ErrorMessage text={error} /><button className="primary-button full-width" disabled={busy || !ready}>{busy ? "Guardando…" : "Guardar consulta"}</button></form><div aria-live="polite">{notice && <p className="success-message">{notice}</p>}</div></section></div></>;
}
export function Information() {
  return <><PageHeading eyebrow="INFORMACIÓN CLARA" title="Sobre esta tienda" /><div className="information-page surface"><h2>Una tienda en desarrollo</h2><p>Esta versión de AYALANET es una prueba funcional. Los productos, precios, regiones y existencias son ejemplos. Guardar un pedido no constituye una compra, reserva de stock ni cobro.</p><h2>Pagos y entregas</h2><p>AyalaPay será el medio de pago cuando se complete y verifique la integración. Hoy no se muestran instrucciones para enviar fondos. Los proveedores de productos y Telegram todavía no están conectados.</p><h2>Datos que se guardan en esta prueba</h2><p>El servidor conserva el usuario y nombre que elijas, una representación protegida de tu contraseña, los pedidos, las consultas, el historial de saldo ficticio y las solicitudes de recarga. Los códigos de inventario se guardan cifrados. La clave de recuperación se muestra al crear o recuperar la cuenta; el servidor guarda su huella, no el texto de la clave.</p><p>Usamos una cookie de sesión necesaria para reconocer tu acceso. El carrito se guarda en este navegador. No hemos añadido publicidad, rastreadores ni analítica de terceros. Los administradores autorizados pueden consultar pedidos y conversaciones para gestionar la tienda.</p><h2>Antes de abrir al público</h2><p>La identidad del vendedor, contacto, condiciones de venta, tratamiento y conservación de datos, garantías y política de reembolsos se completarán y revisarán antes del lanzamiento. Esta página describe el funcionamiento de la prueba; no sustituye esas condiciones comerciales.</p><Link href="/ayuda" className="secondary-button">Ir al centro de ayuda</Link></div></>;
}
