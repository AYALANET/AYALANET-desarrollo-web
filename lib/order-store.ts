import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { OrderError, quoteDraft, type DraftOrder } from "./order-domain.ts";

type Row = { id: string; request_hash: string; lines_json: string; total_cents: number; created_at: string };
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

function publicOrder(row: Row): DraftOrder {
  return { id: row.id, lines: JSON.parse(row.lines_json), totalCents: row.total_cents, currency: "USDT", status: "draft", paymentStatus: "not_configured", createdAt: row.created_at };
}

export function createOrderStore(database: DatabaseSync) {
  database.exec(`PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS draft_orders (
      id TEXT PRIMARY KEY,
      owner_hash TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      lines_json TEXT NOT NULL,
      total_cents INTEGER NOT NULL CHECK(total_cents > 0),
      created_at TEXT NOT NULL,
      UNIQUE(owner_hash, idempotency_key)
    );
    CREATE INDEX IF NOT EXISTS draft_orders_owner_created ON draft_orders(owner_hash, created_at);`);
  return {
    create(owner: string, key: string, input: unknown): DraftOrder {
      if (!/^[a-f0-9]{64}$/.test(owner)) throw new OrderError("Abre una sesión de tienda.", 401);
      if (!/^[A-Za-z0-9-]{20,80}$/.test(key)) throw new OrderError("Falta la referencia de la solicitud.");
      const quote = quoteDraft(input);
      const fingerprint = digest(JSON.stringify(quote));
      const ownerHash = digest(owner);
      database.exec("BEGIN IMMEDIATE");
      try {
        const old = database.prepare("SELECT * FROM draft_orders WHERE owner_hash=? AND idempotency_key=?").get(ownerHash, key) as Row | undefined;
        if (old) {
          if (old.request_hash !== fingerprint) throw new OrderError("La solicitud ya se usó con otro carrito.", 409);
          database.exec("COMMIT");
          return publicOrder(old);
        }
        const since = new Date(Date.now() - 3600_000).toISOString();
        const count = database.prepare("SELECT COUNT(*) AS n FROM draft_orders WHERE owner_hash=? AND created_at>=?").get(ownerHash, since) as { n: number };
        if (count.n >= 12) throw new OrderError("Alcanzaste el límite de pedidos de prueba. Inténtalo más tarde.", 429);
        const row: Row = { id: `DEMO-${randomUUID()}`, request_hash: fingerprint, lines_json: JSON.stringify(quote.lines), total_cents: quote.totalCents, created_at: new Date().toISOString() };
        database.prepare("INSERT INTO draft_orders(id,owner_hash,idempotency_key,request_hash,lines_json,total_cents,created_at) VALUES(?,?,?,?,?,?,?)")
          .run(row.id, ownerHash, key, row.request_hash, row.lines_json, row.total_cents, row.created_at);
        database.exec("COMMIT");
        return publicOrder(row);
      } catch (error) { database.exec("ROLLBACK"); throw error; }
    },
    list(owner: string): DraftOrder[] {
      if (!/^[a-f0-9]{64}$/.test(owner)) return [];
      return (database.prepare("SELECT * FROM draft_orders WHERE owner_hash=? ORDER BY created_at DESC LIMIT 20").all(digest(owner)) as Row[]).map(publicOrder);
    },
  };
}

let store: ReturnType<typeof createOrderStore> | undefined;
export function getOrderStore() {
  if (!store) {
    // Runtime data is provisioned on the server, never bundled into a deployment.
    const path = resolve(/* turbopackIgnore: true */ process.env.STORE_DATABASE_PATH || ".data/store.sqlite");
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    store = createOrderStore(new DatabaseSync(path));
  }
  return store;
}
