import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";

export function inventoryCipher(key: Buffer) {
  if (key.length !== 32) throw new Error("Invalid inventory key");
  const encryptionKey = Buffer.from(hkdfSync("sha256", key, "ayalanet-v1", "inventory-encryption", 32));
  const hashKey = Buffer.from(hkdfSync("sha256", key, "ayalanet-v1", "inventory-deduplication", 32));
  return {
    fingerprint: createHmac("sha256", hashKey).update("inventory-key-v1").digest("hex"),
    hash(code: string) { return createHmac("sha256", hashKey).update(code).digest("hex"); },
    encrypt(code: string, context: string) {
      const nonce = randomBytes(12), cipher = createCipheriv("aes-256-gcm", encryptionKey, nonce);
      cipher.setAAD(Buffer.from(context));
      const data = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
      return ["v1", nonce.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
    },
    decrypt(value: string, context: string) {
      const [version, nonce, tag, data, extra] = value.split(":");
      if (version !== "v1" || !nonce || !tag || !data || extra !== undefined) throw new Error("Invalid encrypted unit");
      const decipher = createDecipheriv("aes-256-gcm", encryptionKey, Buffer.from(nonce, "base64"));
      decipher.setAAD(Buffer.from(context)); decipher.setAuthTag(Buffer.from(tag, "base64"));
      return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
    },
  };
}
export function loadInventoryKey(db: DatabaseSync) {
  const path = resolve(/* turbopackIgnore: true */ process.env.INVENTORY_KEY_FILE || `${process.env.STORE_DATABASE_PATH || ".data/store.sqlite"}.inventory.key`);
  if (!existsSync(path)) {
    if (db.prepare("SELECT 1 FROM inventory_meta LIMIT 1").get() || db.prepare("SELECT 1 FROM inventory_units LIMIT 1").get()) throw new Error("Inventory key missing; restore the original key backup");
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    try { writeFileSync(path, randomBytes(32), { flag: "wx", mode: 0o600 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  }
  const key = readFileSync(path); chmodSync(path, 0o600);
  if (key.length !== 32) throw new Error("Invalid inventory key file");
  return key;
}
