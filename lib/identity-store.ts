import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { getDatabase } from "./database.ts";
import { OrderError } from "./order-domain.ts";

export type Account = { id: string; username: string; name: string; role: "customer" | "admin" };
export type Identity = { token: string; owner: string; account: Account | null };
type UserRow = Account & { password: string; recovery_hash: string };
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const token = () => randomBytes(32).toString("hex");
const username = (input: unknown) => {
  if (typeof input !== "string" || !/^[a-zA-Z0-9_.-]{3,32}$/.test(input.trim())) throw new OrderError("Usa un usuario de 3 a 32 letras, números, puntos, guiones o guiones bajos.");
  return input.trim().toLowerCase();
};
function passwordValue(input: unknown) {
  if (typeof input !== "string" || input.length < 12 || input.length > 128) throw new OrderError("La contraseña debe tener entre 12 y 128 caracteres.");
  return input;
}
const derive = (value: string, salt: string) => new Promise<Buffer>((resolve, reject) => scrypt(value, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)));
async function encodePassword(value: string) { const salt = token(); return `${salt}:${(await derive(value, salt)).toString("hex")}`; }
async function matches(value: string, stored: string) {
  const [salt, key] = stored.split(":");
  const derived = await derive(value, salt);
  const expected = Buffer.from(key, "hex");
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}
const safeAccount = (u: UserRow): Account => ({ id: u.id, username: u.username, name: u.name, role: u.role });

export function createIdentityStore(db: DatabaseSync, clock = () => Date.now()) {
  db.exec(`CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('customer','admin')),
    password TEXT NOT NULL, recovery_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, account_id TEXT, expires INTEGER NOT NULL, FOREIGN KEY(account_id) REFERENCES accounts(id));
    CREATE TABLE IF NOT EXISTS auth_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, until INTEGER NOT NULL);`);

  function read(value?: string): Identity | null {
    if (!value || !/^[a-f0-9]{64}$/.test(value)) return null;
    const row = db.prepare("SELECT account_id FROM sessions WHERE hash=? AND expires>?").get(hash(value), clock()) as { account_id: string | null } | undefined;
    if (!row) return null;
    const account = row.account_id ? db.prepare("SELECT * FROM accounts WHERE id=?").get(row.account_id) as UserRow | undefined : undefined;
    if (row.account_id && !account) return null;
    return { token: value, owner: account?.id || value, account: account ? safeAccount(account) : null };
  }
  function issue(account: string | null, value = token()) {
    db.prepare("DELETE FROM sessions WHERE expires<=?").run(clock());
    db.prepare("INSERT INTO sessions(hash,account_id,expires) VALUES(?,?,?)").run(hash(value), account, clock() + 7 * 86400_000);
    return read(value)!;
  }
  function limit(key: string, max: number, window = 15 * 60_000) {
    db.prepare("DELETE FROM auth_limits WHERE until<=?").run(clock());
    const id = hash(key);
    db.prepare("INSERT INTO auth_limits(key,count,until) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1").run(id, clock() + window);
    const row = db.prepare("SELECT count FROM auth_limits WHERE key=?").get(id) as { count: number };
    if (row.count > max) throw new OrderError("Demasiados intentos. Espera unos minutos antes de volver a probar.", 429);
  }
  function attach(old: Identity, id: string) {
    // Only anonymous data can be claimed; logging into another account never moves its orders.
    if (!old.account) {
      for (const table of ["draft_orders", "support_tickets"]) {
        if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)) db.prepare(`UPDATE ${table} SET owner_hash=? WHERE owner_hash=?`).run(hash(id), hash(old.owner));
      }
    }
    db.prepare("DELETE FROM sessions WHERE hash=?").run(hash(old.token));
    return issue(id);
  }
  return {
    read,
    initialize(value?: string) {
      const known = read(value);
      if (known) return known;
      // Import pre-account anonymous sessions once, without ever restoring an expired authenticated session.
      if (value && /^[a-f0-9]{64}$/.test(value) && !db.prepare("SELECT hash FROM sessions WHERE hash=?").get(hash(value)) && !db.prepare("SELECT id FROM accounts WHERE id=?").get(value)) {
        const hasLegacyOrders = db.prepare("SELECT name FROM sqlite_master WHERE name='draft_orders'").get();
        if (hasLegacyOrders && db.prepare("SELECT id FROM draft_orders WHERE owner_hash=? LIMIT 1").get(hash(value))) return issue(null, value);
      }
      return issue(null);
    },
    async register(old: Identity, input: Record<string, unknown>) {
      if (old.account) throw new OrderError("Cierra tu sesión antes de crear otra cuenta.", 409);
      const user = username(input.username), password = passwordValue(input.password);
      const name = typeof input.name === "string" ? input.name.trim() : "";
      if (name.length < 2 || name.length > 60) throw new OrderError("Escribe un nombre de 2 a 60 caracteres.");
      limit(`register:${old.owner}`, 3, 86400_000); limit("register:global", 60);
      const encoded = await encodePassword(password), recoveryKey = randomBytes(24).toString("hex"), id = token();
      db.exec("BEGIN IMMEDIATE");
      try {
        if (db.prepare("SELECT id FROM accounts WHERE username=?").get(user)) throw new OrderError("Ese usuario no está disponible. Elige otro.", 409);
        db.prepare("INSERT INTO accounts(id,username,name,password,recovery_hash,created_at) VALUES(?,?,?,?,?,?)").run(id, user, name, encoded, hash(recoveryKey), clock());
        const identity = attach(old, id); db.exec("COMMIT"); return { identity, recoveryKey };
      } catch (error) { db.exec("ROLLBACK"); throw error; }
    },
    async login(old: Identity, input: Record<string, unknown>) {
      const user = username(input.username), password = passwordValue(input.password);
      limit(`login:${user}`, 10); limit("login:global", 120);
      const row = db.prepare("SELECT * FROM accounts WHERE username=?").get(user) as UserRow | undefined;
      // Do equivalent KDF work for unknown accounts.
      const valid = await matches(password, row?.password || `${"0".repeat(64)}:${"0".repeat(128)}`);
      if (!row || !valid) throw new OrderError("Usuario o contraseña incorrectos.", 401);
      db.exec("BEGIN IMMEDIATE");
      try {
        if (!db.prepare("SELECT id FROM accounts WHERE id=? AND password=?").get(row.id, row.password)) throw new OrderError("El acceso cambió. Inicia sesión de nuevo.", 401);
        const identity = attach(old, row.id); db.exec("COMMIT"); return { identity };
      }
      catch (error) { db.exec("ROLLBACK"); throw error; }
    },
    async recover(old: Identity, input: Record<string, unknown>) {
      const user = username(input.username), password = passwordValue(input.password);
      limit(`recover:${user}`, 5); limit("recover:global", 30);
      const row = db.prepare("SELECT * FROM accounts WHERE username=?").get(user) as UserRow | undefined;
      const key = typeof input.recoveryKey === "string" ? input.recoveryKey.replace(/\s/g, "") : "";
      if (!row || !/^[a-f0-9]{48}$/.test(key) || !timingSafeEqual(Buffer.from(hash(key), "hex"), Buffer.from(row.recovery_hash, "hex"))) throw new OrderError("Usuario o clave de recuperación incorrectos.", 401);
      const encoded = await encodePassword(password), recoveryKey = randomBytes(24).toString("hex");
      db.exec("BEGIN IMMEDIATE");
      try {
        const changed = db.prepare("UPDATE accounts SET password=?,recovery_hash=? WHERE id=? AND recovery_hash=?").run(encoded, hash(recoveryKey), row.id, hash(key));
        if (changed.changes !== 1) throw new OrderError("La clave de recuperación ya se utilizó.", 409);
        db.prepare("DELETE FROM sessions WHERE account_id=?").run(row.id);
        const identity = attach(old, row.id); db.exec("COMMIT"); return { identity, recoveryKey };
      } catch (error) { db.exec("ROLLBACK"); throw error; }
    },
    logout(old: Identity) { db.prepare("DELETE FROM sessions WHERE hash=?").run(hash(old.token)); return issue(null); },
    requireAdmin(identity: Identity) { if (identity.account?.role !== "admin") throw new OrderError("Acceso reservado a administración.", 403); },
  };
}
let store: ReturnType<typeof createIdentityStore> | undefined;
export function getIdentityStore() { return store ||= createIdentityStore(getDatabase()); }
