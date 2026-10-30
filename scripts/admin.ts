import { getDatabase } from "../lib/database.ts";
import { createIdentityStore } from "../lib/identity-store.ts";

// Explicit, local administration; no HTTP route can grant this role.
const username = process.argv[2]?.toLowerCase();
const role = process.argv.includes("--revoke") ? "customer" : "admin";
if (!username || !/^[a-z0-9_.-]{3,32}$/.test(username)) {
  console.error("Uso: node scripts/admin.ts <usuario-existente> [--revoke]"); process.exitCode = 1;
} else {
  const db = getDatabase(); createIdentityStore(db);
  const result = db.prepare("UPDATE accounts SET role=? WHERE username=?").run(role, username);
  if (result.changes !== 1) { console.error("El usuario no existe. Primero crea la cuenta desde la tienda."); process.exitCode = 1; }
  else console.log(role === "admin" ? "Acceso administrativo asignado. Recarga tu sesión." : "Acceso administrativo retirado.");
  db.close();
}
