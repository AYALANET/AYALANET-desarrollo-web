import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname, resolve } from "node:path";

let database: DatabaseSync | undefined;
export function getDatabase() {
  if (!database) {
    const path = resolve(/* turbopackIgnore: true */ process.env.STORE_DATABASE_PATH || ".data/store.sqlite");
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    database = new DatabaseSync(path);
    chmodSync(path, 0o600);
    database.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;");
  }
  return database;
}
