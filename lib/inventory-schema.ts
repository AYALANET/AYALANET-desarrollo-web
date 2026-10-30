import type { DatabaseSync } from "node:sqlite";

export function inventorySchema(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory_meta (id INTEGER PRIMARY KEY CHECK(id=1),key_fingerprint TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS inventory_batches (
      id TEXT PRIMARY KEY,product_id TEXT NOT NULL,label TEXT NOT NULL,supplier TEXT NOT NULL,
      unit_cost_micros INTEGER NOT NULL,region TEXT NOT NULL,instructions TEXT NOT NULL,created_at TEXT NOT NULL,
      request_key TEXT UNIQUE NOT NULL,fingerprint TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS inventory_units (
      id TEXT PRIMARY KEY,batch_id TEXT NOT NULL REFERENCES inventory_batches(id),product_id TEXT NOT NULL,
      code_hash TEXT UNIQUE NOT NULL,ciphertext TEXT NOT NULL,expires_on TEXT,
      status TEXT NOT NULL CHECK(status IN ('available','delivered','blocked')),order_id TEXT,delivered_at TEXT);
    CREATE INDEX IF NOT EXISTS inventory_available ON inventory_units(product_id,status,expires_on);
    CREATE INDEX IF NOT EXISTS inventory_order ON inventory_units(order_id);
    CREATE TABLE IF NOT EXISTS wallet_entries (
      id INTEGER PRIMARY KEY,owner_hash TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('demo_credit','demo_purchase','demo_refund')),
      reference TEXT NOT NULL,amount_micros INTEGER NOT NULL CHECK(amount_micros != 0),created_at TEXT NOT NULL,
      UNIQUE(owner_hash,kind,reference));
    CREATE TABLE IF NOT EXISTS wallet_topups (
      id TEXT PRIMARY KEY,owner_hash TEXT NOT NULL,amount_micros INTEGER NOT NULL,created_at TEXT NOT NULL,
      request_key TEXT NOT NULL,UNIQUE(owner_hash,request_key));
  `);
}
export function managedStock(db: DatabaseSync, productId: string, today = new Date().toISOString().slice(0, 10)): number | null {
  if (!db.prepare("SELECT 1 FROM inventory_batches WHERE product_id=? LIMIT 1").get(productId)) return null;
  return (db.prepare("SELECT count(*) AS n FROM inventory_units WHERE product_id=? AND status='available' AND (expires_on IS NULL OR expires_on>=?)").get(productId, today) as { n: number }).n;
}
