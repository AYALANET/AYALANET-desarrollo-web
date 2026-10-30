import { OrderError } from "./order-domain.ts";
export const SESSION_COOKIE = "ayalanet_demo_session";
export function validSession(value: string | undefined): value is string { return !!value && /^[a-f0-9]{64}$/.test(value); }

export function hasAllowedOrigin(request: Request, configuredOrigin = process.env.STORE_ORIGIN) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || (!configuredOrigin && !host)) return false;
  try {
    // Next normalizes loopback URLs to localhost. Use the actual Host header
    // for local development; deployments behind a proxy should pin STORE_ORIGIN.
    const expected = configuredOrigin || `${new URL(request.url).protocol}//${host}`;
    const parsed = new URL(expected);
    return parsed.username === "" && parsed.password === "" && origin === parsed.origin;
  } catch { return false; }
}

export async function limitedJson(request: Request, maxBytes = 16_384) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new OrderError("Se requiere JSON.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new OrderError("Falta el pedido.");
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) { await reader.cancel(); throw new OrderError("Solicitud demasiado grande.", 413); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
  catch { throw new OrderError("JSON no válido."); }
}
