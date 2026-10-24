// Saca del Dashboard Joalix (HTML) la publicidad de Meta, la TRM, los gastos mensuales y el ajuste
// Vitalcom, y escribe un .sql de carga (upsert) para Supabase.
// Uso: node scripts/joalix-a-sql.mjs <Dashboard_Joalix.html> > supabase/seed/joalix_publicidad_gastos.sql
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(process.argv[2], "utf8");
const CUENTA = { CO: "TIENDA_CO", EC: "TIENDA_EC", GT: "TIENDA_GT" };

// Toma el literal { ... } o [ ... ] que sigue a "const NOMBRE =" (llaves balanceadas, respetando strings).
function literal(nombre) {
  const m = new RegExp(`\\bconst\\s+${nombre}\\s*=\\s*`).exec(html);
  if (!m) throw new Error(`No encontré ${nombre}`);
  let i = m.index + m[0].length, prof = 0, str = null;
  const ini = i;
  for (; i < html.length; i++) {
    const ch = html[i];
    if (str) { if (ch === "\\") i++; else if (ch === str) str = null; continue; }
    if (ch === '"' || ch === "'" || ch === "`") str = ch;
    else if (ch === "/" && html[i + 1] === "/") i = html.indexOf("\n", i);
    else if (ch === "{" || ch === "[") prof++;
    else if (ch === "}" || ch === "]") { if (--prof === 0) break; }
  }
  // Solo datos: se evalúa aislado, sin acceso a nada, con límite de tiempo.
  return vm.runInNewContext(`(${html.slice(ini, i + 1)})`, Object.create(null), { timeout: 1000 });
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const n = (v) => (Number.isFinite(+v) ? String(+v) : "null");
const out = ["-- Generado por scripts/joalix-a-sql.mjs desde el Dashboard Joalix. Se puede volver a correr: hace upsert.", "begin;"];

const diario = literal("ADS_SPEND_DAILY");
const filas = [];
for (const [pais, dias] of Object.entries(diario))
  for (const [fecha, cuentas] of Object.entries(dias))
    for (const [ads, cop] of Object.entries(cuentas)) filas.push(`(${q(CUENTA[pais])},${q(fecha)},${q(ads)},${n(cop)})`);
out.push(`insert into public.app_publicidad_diaria (cuenta, fecha, cuenta_ads, monto_cop) values\n${filas.join(",\n")}\non conflict (cuenta, fecha, cuenta_ads) do update set monto_cop = excluded.monto_cop, actualizado_en = now();`);

const lump = literal("ADS_INVERSION_BY_COUNTRY");
const fl = Object.entries(lump).flatMap(([p, ms]) => Object.entries(ms).map(([mes, v]) => `(${q(CUENTA[p])},${q(mes + "-01")},${n(v)})`));
out.push(`insert into public.app_publicidad_mensual (cuenta, mes, monto) values\n${fl.join(",\n")}\non conflict (cuenta, mes) do update set monto = excluded.monto, actualizado_en = now();`);

const trm = literal("TRM_PROMEDIO_MES");
const ft = Object.entries(trm).map(([mes, t]) => `(${q(mes + "-01")},${n(t.USD_COP)},${n(t.GTQ_COP)},${t.estimada ? "true" : "false"})`);
out.push(`insert into public.app_trm_mes (mes, usd_cop, gtq_cop, estimada) values\n${ft.join(",\n")}\non conflict (mes) do update set usd_cop = excluded.usd_cop, gtq_cop = excluded.gtq_cop, estimada = excluded.estimada, actualizado_en = now();`);

const gastos = [];
for (const [tipo, nombre] of [["apps", "APP_EXPENSES_BY_COUNTRY"], ["admin", "ADMIN_EXPENSES_BY_COUNTRY"], ["operativo", "OPERATIVO_EXPENSES_BY_COUNTRY"]])
  for (const [p, meses] of Object.entries(literal(nombre)))
    for (const [mes, conceptos] of Object.entries(meses))
      for (const [c, v] of Object.entries(conceptos)) if (+v) gastos.push(`(${q(CUENTA[p])},${q(mes + "-01")},${q(tipo)},${q(c)},${n(v)})`);
out.push(`insert into public.app_gastos_mensuales (cuenta, mes, tipo, concepto, monto) values\n${gastos.join(",\n")}\non conflict (cuenta, mes, tipo, concepto) do update set monto = excluded.monto, actualizado_en = now();`);

// Ajuste Vitalcom (Colombia): costo de 92 guías que Effi trajo en cero; línea fija del PyG por día de la guía.
const pygCO = [...html.matchAll(/"PYG": \[/g)].map((m) => m.index).find((i) => html.lastIndexOf('"CO": {"', i) > html.lastIndexOf('"EC": {"', i));
if (pygCO != null) {
  const ini = html.indexOf("[", pygCO);
  let prof = 0, i = ini;
  for (; i < html.length; i++) { if (html[i] === "[") prof++; else if (html[i] === "]" && --prof === 0) break; }
  const vit = JSON.parse(html.slice(ini, i + 1)).filter((r) => /Vitalcom/.test(r.Concepto));
  if (vit.length) out.push(`insert into public.app_ajustes_pyg (cuenta, fecha, concepto, monto, n) values\n${vit.map((r) => `('TIENDA_CO',${q(r.Fecha_dia)},${q(r.Concepto)},${n(r.monto)},${n(r.n)})`).join(",\n")}\non conflict (cuenta, fecha, concepto) do update set monto = excluded.monto, n = excluded.n;`);
}
out.push("commit;");
console.log(out.join("\n\n"));
console.error(`publicidad diaria: ${filas.length} · mensual: ${fl.length} · TRM: ${ft.length} · gastos: ${gastos.length}`);
