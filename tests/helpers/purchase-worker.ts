import { parentPort, workerData } from "node:worker_threads";
import { DatabaseSync } from "node:sqlite";
import { createCommerceStore } from "../../lib/commerce-store.ts";
const db = new DatabaseSync(workerData.path); db.exec("PRAGMA busy_timeout=5000");
const store = createCommerceStore(db, Buffer.from(workerData.key, "hex"));
parentPort!.once("message", () => { try { store.purchase(workerData.owner, workerData.id); parentPort!.postMessage({ success: true }); } catch { parentPort!.postMessage({ success: false }); } finally { db.close(); parentPort!.close(); } });
parentPort!.postMessage("ready");
