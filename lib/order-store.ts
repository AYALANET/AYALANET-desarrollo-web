import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { getDatabase } from "./database.ts";
import { products, type Product } from "./catalog.ts";
import { OrderError, quoteDraft, type DraftOrder } from "./order-domain.ts";

type Row = { id: string; request_hash: string; lines_json: string; total_cents: number; created_at: string; status: "draft" | "cancelled"; cancelled_at: string | null };
export type Ticket = { id: string; orderId: string | null; subject: string; status: "open" | "closed"; createdAt: string; messages: { author: "customer" | "admin"; text: string; createdAt: string }[] };
type TicketRow = { id: string; order_id: string | null; subject: string; status: "open" | "closed"; created_at: string; fingerprint: string };
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
function ownerHash(owner: string) { if (!/^[a-f0-9]{64}$/.test(owner)) throw new OrderError("Abre una sesión de tienda.", 401); return digest(owner); }
function requestKey(key: string) { if (!/^[A-Za-z0-9-]{20,80}$/.test(key)) throw new OrderError("Falta la referencia de la solicitud."); return key; }
function textValue(value: unknown, min: number, max: number, label: string) {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) throw new OrderError(`${label}: escribe entre ${min} y ${max} caracteres.`);
  return value.trim();
}
function publicOrder(row: Row): DraftOrder {
  return { id: row.id, lines: JSON.parse(row.lines_json), totalCents: row.total_cents, currency: "USDT", status: row.status, paymentStatus: "not_configured", createdAt: row.created_at, ...(row.cancelled_at ? { cancelledAt: row.cancelled_at } : {}) };
}

export function createOrderStore(db: DatabaseSync) {
  db.exec(`PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS draft_orders (id TEXT PRIMARY KEY,owner_hash TEXT NOT NULL,idempotency_key TEXT NOT NULL,request_hash TEXT NOT NULL,lines_json TEXT NOT NULL,total_cents INTEGER NOT NULL CHECK(total_cents > 0),created_at TEXT NOT NULL,UNIQUE(owner_hash,idempotency_key));
    CREATE INDEX IF NOT EXISTS draft_orders_owner_created ON draft_orders(owner_hash,created_at);
    CREATE TABLE IF NOT EXISTS catalog (id TEXT PRIMARY KEY,price_cents INTEGER NOT NULL CHECK(price_cents>0),stock INTEGER NOT NULL CHECK(stock>=0),active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS support_tickets (id TEXT PRIMARY KEY,owner_hash TEXT NOT NULL,order_id TEXT,subject TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',created_at TEXT NOT NULL,idempotency_key TEXT NOT NULL,fingerprint TEXT NOT NULL,UNIQUE(owner_hash,idempotency_key));
    CREATE TABLE IF NOT EXISTS support_messages (id TEXT PRIMARY KEY,ticket_id TEXT NOT NULL,author TEXT NOT NULL,text TEXT NOT NULL,created_at TEXT NOT NULL,idempotency_key TEXT NOT NULL,UNIQUE(ticket_id,author,idempotency_key));
    CREATE TABLE IF NOT EXISTS store_audit (id INTEGER PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL,created_at TEXT NOT NULL);`);
  const columns = db.prepare("PRAGMA table_info(draft_orders)").all() as { name: string }[];
  if (!columns.some(c => c.name === "status")) db.exec("ALTER TABLE draft_orders ADD COLUMN status TEXT NOT NULL DEFAULT 'draft'");
  if (!columns.some(c => c.name === "cancelled_at")) db.exec("ALTER TABLE draft_orders ADD COLUMN cancelled_at TEXT");
  for (const p of products) db.prepare("INSERT OR IGNORE INTO catalog(id,price_cents,stock) VALUES(?,?,?)").run(p.id, p.priceCents, p.stock);
  function atomic<T>(run: () => T): T {
    db.exec("BEGIN IMMEDIATE");
    try { const result = run(); db.exec("COMMIT"); return result; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  }
  function catalog(): Product[] {
    return products.map(p => {
      const r = db.prepare("SELECT * FROM catalog WHERE id=?").get(p.id) as { price_cents: number; stock: number; active: number };
      return { ...p, priceCents: r.price_cents, stock: r.stock, active: !!r.active };
    });
  }
  function get(owner: string, id: string) {
    const row = db.prepare("SELECT * FROM draft_orders WHERE owner_hash=? AND id=?").get(ownerHash(owner), id) as Row | undefined;
    if (!row) throw new OrderError("Pedido no encontrado.", 404);
    return publicOrder(row);
  }
  function publicTicket(row: TicketRow): Ticket {
    return { id: row.id, orderId: row.order_id, subject: row.subject, status: row.status, createdAt: row.created_at, messages: db.prepare("SELECT author,text,created_at AS createdAt FROM support_messages WHERE ticket_id=? ORDER BY rowid").all(row.id) as Ticket["messages"] };
  }
  function ticket(owner: string, id: string, admin = false) {
    const row = (admin ? db.prepare("SELECT * FROM support_tickets WHERE id=?").get(id) : db.prepare("SELECT * FROM support_tickets WHERE id=? AND owner_hash=?").get(id, ownerHash(owner))) as TicketRow | undefined;
    if (!row) throw new OrderError("Consulta no encontrada.", 404);
    return publicTicket(row);
  }
  function audit(actor: string, action: string, target: string) { db.prepare("INSERT INTO store_audit(actor,action,target,created_at) VALUES(?,?,?,?)").run(ownerHash(actor), action, target, new Date().toISOString()); }
  return {
    catalog, get, ticket,
    create(owner: string, key: string, input: unknown): DraftOrder {
      const ownerId = ownerHash(owner); requestKey(key);
      return atomic(() => {
        const old = db.prepare("SELECT * FROM draft_orders WHERE owner_hash=? AND idempotency_key=?").get(ownerId, key) as Row | undefined;
        if (old) {
          // Replays compare the original snapshot, including after catalog changes.
          const oldProducts = catalog().map(p => {
            const line = (JSON.parse(old.lines_json) as DraftOrder["lines"]).find(l => l.productId === p.id);
            return line ? { ...p, priceCents: line.unitPriceCents, stock: 10, active: true } : p;
          });
          const quote = quoteDraft(input, oldProducts);
          const fingerprint = digest(JSON.stringify({ ...quote, method: "usdt_bep20" }));
          if (old.request_hash !== fingerprint) throw new OrderError("La solicitud ya se usó con otro carrito.", 409);
          return publicOrder(old);
        }
        const quote = quoteDraft(input, catalog());
        const count = db.prepare("SELECT COUNT(*) AS n FROM draft_orders WHERE owner_hash=? AND created_at>=?").get(ownerId, new Date(Date.now() - 3600_000).toISOString()) as { n: number };
        if (count.n >= 12) throw new OrderError("Alcanzaste el límite de pedidos de prueba. Inténtalo más tarde.", 429);
        const row: Row = { id: `DEMO-${randomUUID()}`, request_hash: digest(JSON.stringify({ ...quote, method: "usdt_bep20" })), lines_json: JSON.stringify(quote.lines), total_cents: quote.totalCents, created_at: new Date().toISOString(), status: "draft", cancelled_at: null };
        db.prepare("INSERT INTO draft_orders(id,owner_hash,idempotency_key,request_hash,lines_json,total_cents,created_at) VALUES(?,?,?,?,?,?,?)").run(row.id, ownerId, key, row.request_hash, row.lines_json, row.total_cents, row.created_at);
        return publicOrder(row);
      });
    },
    list(owner: string): DraftOrder[] {
      if (!/^[a-f0-9]{64}$/.test(owner)) return [];
      return (db.prepare("SELECT * FROM draft_orders WHERE owner_hash=? ORDER BY created_at DESC LIMIT 100").all(ownerHash(owner)) as Row[]).map(publicOrder);
    },
    cancel(owner: string, id: string) {
      return atomic(() => { get(owner, id); db.prepare("UPDATE draft_orders SET status='cancelled',cancelled_at=? WHERE owner_hash=? AND id=? AND status='draft'").run(new Date().toISOString(), ownerHash(owner), id); return get(owner, id); });
    },
    tickets(owner: string): Ticket[] { return (db.prepare("SELECT * FROM support_tickets WHERE owner_hash=? ORDER BY created_at DESC LIMIT 50").all(ownerHash(owner)) as TicketRow[]).map(publicTicket); },
    createTicket(owner: string, key: string, input: Record<string, unknown>) {
      const ownerId = ownerHash(owner); requestKey(key);
      const subject = textValue(input.subject, 5, 100, "Asunto"), message = textValue(input.message, 10, 2000, "Mensaje");
      const orderId = input.orderId === undefined || input.orderId === "" ? null : textValue(input.orderId, 1, 80, "Pedido");
      if (orderId) get(owner, orderId);
      const fingerprint = digest(JSON.stringify({ subject, message, orderId }));
      return atomic(() => {
        const old = db.prepare("SELECT * FROM support_tickets WHERE owner_hash=? AND idempotency_key=?").get(ownerId, key) as TicketRow | undefined;
        if (old) { if (old.fingerprint !== fingerprint) throw new OrderError("La solicitud ya se usó con otra consulta.", 409); return publicTicket(old); }
        const count = db.prepare("SELECT COUNT(*) AS n FROM support_tickets WHERE owner_hash=? AND created_at>=?").get(ownerId, new Date(Date.now() - 86400_000).toISOString()) as { n: number };
        if (count.n >= 5) throw new OrderError("Puedes abrir hasta cinco consultas por día.", 429);
        const id = `AYU-${randomUUID()}`, now = new Date().toISOString();
        db.prepare("INSERT INTO support_tickets(id,owner_hash,order_id,subject,created_at,idempotency_key,fingerprint) VALUES(?,?,?,?,?,?,?)").run(id, ownerId, orderId, subject, now, key, fingerprint);
        db.prepare("INSERT INTO support_messages VALUES(?,?,?,?,?,?)").run(randomUUID(), id, "customer", message, now, key);
        return ticket(owner, id);
      });
    },
    reply(owner: string, id: string, key: string, message: unknown, admin = false) {
      requestKey(key); const text = textValue(message, 2, 2000, "Mensaje"), author = admin ? "admin" : "customer";
      return atomic(() => {
        const current = ticket(owner, id, admin);
        const old = db.prepare("SELECT text FROM support_messages WHERE ticket_id=? AND author=? AND idempotency_key=?").get(id, author, key) as { text: string } | undefined;
        if (old) { if (old.text !== text) throw new OrderError("La solicitud ya se usó con otro mensaje.", 409); return current; }
        if (current.status === "closed") throw new OrderError("La consulta está cerrada.", 409);
        if (current.messages.length >= 50) throw new OrderError("Esta consulta alcanzó el límite de mensajes.", 429);
        db.prepare("INSERT INTO support_messages VALUES(?,?,?,?,?,?)").run(randomUUID(), id, author, text, new Date().toISOString(), key);
        if (admin) audit(owner, "support.reply", id);
        return ticket(owner, id, admin);
      });
    },
    closeTicket(owner: string, id: string, admin = false) {
      return atomic(() => { ticket(owner, id, admin); db.prepare("UPDATE support_tickets SET status='closed' WHERE id=?").run(id); if (admin) audit(owner, "support.close", id); return ticket(owner, id, admin); });
    },
    adminSummary() {
      return { orders: (db.prepare("SELECT * FROM draft_orders ORDER BY created_at DESC LIMIT 100").all() as Row[]).map(publicOrder), tickets: (db.prepare("SELECT * FROM support_tickets ORDER BY created_at DESC LIMIT 100").all() as TicketRow[]).map(publicTicket), products: catalog(), audit: db.prepare("SELECT action,target,created_at AS createdAt FROM store_audit ORDER BY id DESC LIMIT 20").all() };
    },
    updateProduct(actor: string, id: string, input: Record<string, unknown>) {
      if (!products.some(p => p.id === id)) throw new OrderError("Producto no encontrado.", 404);
      if (Object.keys(input).some(k => !["priceCents", "stock", "active"].includes(k)) || !Number.isSafeInteger(input.priceCents) || (input.priceCents as number) < 1 || (input.priceCents as number) > 1000000 || !Number.isSafeInteger(input.stock) || (input.stock as number) < 0 || (input.stock as number) > 10000 || typeof input.active !== "boolean") throw new OrderError("Revisa el precio, las existencias y la visibilidad.");
      return atomic(() => { db.prepare("UPDATE catalog SET price_cents=?,stock=?,active=? WHERE id=?").run(input.priceCents as number, input.stock as number, Number(input.active), id); audit(actor, "catalog.update", id); return catalog(); });
    },
  };
}
let store: ReturnType<typeof createOrderStore> | undefined;
export function getOrderStore() { return store ||= createOrderStore(getDatabase()); }
