import { products } from "./catalog.ts";
import { parseUsdt } from "./finance.ts";
import { OrderError } from "./order-domain.ts";

export const licenseProductIds = ["steam-20", "xbox-10", "roblox-400", "playstation-10"];
export type ImportBatch = { productId: string; label: string; supplier: string; unitCostMicros: number; region: string; instructions: string; rows: { code: string; expiresOn: string | null }[] };
function field(value: unknown, name: string, max: number) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new OrderError(`Revisa ${name} (máximo ${max} caracteres).`);
  return value.trim();
}
// CSV with quoted fields, escaped quotes, CRLF/BOM and either comma or semicolon.
// No multiline fields: each physical line is a unit, so error rows stay unambiguous.
function csvLine(line: string, delimiter: string, row: number) {
  const fields: string[] = []; let i = 0;
  while (true) {
    let value = "";
    if (line[i] === '"') {
      i++; let closed = false;
      while (i < line.length) {
        if (line[i] === '"') { if (line[i + 1] === '"') { value += '"'; i += 2; } else { i++; closed = true; break; } }
        else value += line[i++];
      }
      if (!closed || (i < line.length && line[i] !== delimiter)) throw new OrderError(`CSV incorrecto en la fila ${row}.`);
    } else {
      while (i < line.length && line[i] !== delimiter) { if (line[i] === '"') throw new OrderError(`CSV incorrecto en la fila ${row}.`); value += line[i++]; }
    }
    fields.push(value.trim()); if (i >= line.length) break; i++;
    if (i === line.length) { fields.push(""); break; }
  }
  return fields;
}
export function parseInventoryImport(input: Record<string, unknown>, today = new Date().toISOString().slice(0, 10)): ImportBatch {
  if (Object.keys(input).some(k => !["productId", "label", "supplier", "unitCost", "region", "instructions", "csv"].includes(k))) throw new OrderError("Datos del lote no válidos.");
  const product = products.find(p => p.id === input.productId && licenseProductIds.includes(p.id));
  if (!product) throw new OrderError("Selecciona un producto de códigos; las recargas requieren su proveedor.");
  if (input.region !== product.region) throw new OrderError("La región del lote debe coincidir con la del producto.");
  const label = field(input.label, "el nombre del lote", 80), supplier = field(input.supplier, "el proveedor", 100), instructions = field(input.instructions, "las instrucciones de canje", 2000);
  const unitCostMicros = parseUsdt(input.unitCost);
  if (unitCostMicros > 1_000_000_000_000) throw new OrderError("El coste unitario supera el límite.");
  if (typeof input.csv !== "string" || Buffer.byteLength(input.csv) > 240_000) throw new OrderError("El archivo debe ocupar como máximo 240 KB.");
  const lines = input.csv.replace(/^\uFEFF/, "").split(/\r?\n/);
  const delimiter = lines[0]?.includes(";") ? ";" : ",";
  const header = csvLine(lines[0] || "", delimiter, 1).map(v => v.toLowerCase());
  const hasHeader = header[0] === "code";
  if (hasHeader && (header.length > 2 || (header.length === 2 && header[1] !== "expires_on"))) throw new OrderError("Cabecera admitida: code,expires_on.");
  const rows: ImportBatch["rows"] = [], seen = new Set<string>();
  for (let i = hasHeader ? 1 : 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = csvLine(lines[i], delimiter, i + 1);
    if (values.length > (hasHeader ? header.length : 1)) throw new OrderError(`Número de columnas incorrecto en la fila ${i + 1}.`);
    const [code, expires = ""] = values;
    // Sandbox is deliberately enforced on the server, not only in the UI.
    if (!/^DEMO-[A-Za-z0-9_-]{4,180}$/.test(code)) throw new OrderError(`Fila ${i + 1}: usa un código ficticio DEMO- de 4 a 180 caracteres adicionales.`);
    if (seen.has(code.toUpperCase())) throw new OrderError(`Código duplicado en la fila ${i + 1}.`);
    seen.add(code.toUpperCase());
    if (expires && (!/^\d{4}-\d{2}-\d{2}$/.test(expires) || !Number.isFinite(Date.parse(`${expires}T00:00:00Z`)) || new Date(`${expires}T00:00:00Z`).toISOString().slice(0, 10) !== expires || expires < today)) throw new OrderError(`Caducidad no válida o vencida en la fila ${i + 1}.`);
    rows.push({ code, expiresOn: expires || null });
    if (rows.length > 500) throw new OrderError("Importa como máximo 500 códigos por lote.");
  }
  if (!rows.length) throw new OrderError("Añade al menos un código de prueba.");
  return { productId: product.id, label, supplier, unitCostMicros, region: product.region, instructions, rows };
}
