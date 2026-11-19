// Carga al Centro de Control el «Historial de cartera» de Dropi que el dueño descarga (1-ago → hoy), sin abrir Cargar archivos.
// Usa la misma lectura de la web (web/src/lib/cargas.ts) y guarda por ID en dropi_cartera (rpc dropi_cartera_cargar_sistema):
// el archivo acumulado no duplica nada. Después mueve el Excel a tools/cartera-cargada/ (fuera del repo) para no repetirlo.
//
// Uso (desde la carpeta del proyecto):
//   node --env-file=.env scripts/cargar-dropi-cartera.mjs AUNCLIC_GT            ← busca el Excel más nuevo
//   node --env-file=.env scripts/cargar-dropi-cartera.mjs AUNCLIC_GT "archivo.xlsx"
//   … --prueba   solo lee y muestra el resumen, sin guardar
// Busca «historial de cartera*.xlsx» en la carpeta del proyecto y en Descargas. Nunca imprime datos de clientes.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(raiz, 'web', 'package.json'));
const { readSheet } = require('read-excel-file/node');
const { leerTabla } = await import(path.join(raiz, 'web/src/lib/cargas.ts'));

const args = process.argv.slice(2);
const prueba = args.includes('--prueba');
const [cuenta, archivoArg] = args.filter((a) => !a.startsWith('--'));
if (!cuenta) { console.error('Falta la tienda: node --env-file=.env scripts/cargar-dropi-cartera.mjs AUNCLIC_GT'); process.exit(1); }
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, sync = process.env.EFFI_SYNC_TOKEN;
if (!url || !anon || !sync) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY o EFFI_SYNC_TOKEN en el .env'); process.exit(1); }

// El Excel: el indicado o el más nuevo «historial de cartera*.xlsx» de la carpeta del proyecto o de Descargas.
let archivo = archivoArg && path.resolve(archivoArg);
if (!archivo) {
  const candidatos = [raiz, path.join(os.homedir(), 'Downloads')].flatMap((d) =>
    fs.existsSync(d) ? fs.readdirSync(d).filter((f) => /^historial de cartera.*\.xlsx$/i.test(f)).map((f) => path.join(d, f)) : []);
  archivo = candidatos.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
}
if (!archivo || !fs.existsSync(archivo)) { console.log('No hay Excel de cartera nuevo para cargar.'); process.exit(0); }

const tabla = await readSheet(archivo);
const l = await leerTabla(tabla);
if (l.tipo !== 'dropi_cartera') { console.error(`«${path.basename(archivo)}» no es un historial de cartera de Dropi (parece ${l.tipo ?? 'otro archivo'}).`); process.exit(1); }
console.log(`📄 ${path.basename(archivo)} · ${l.filas.length} movimientos · ${l.desde} → ${l.hasta}`);
for (const t of l.totales) console.log(`   ${t.etiqueta}: ${t.moneda ? t.valor.toLocaleString('es-CO', { maximumFractionDigits: 2 }) : t.valor}`);
if (prueba) { console.log('(prueba: no se guardó nada)'); process.exit(0); }

const BLOQUE = 1000;
let carga = null, filas = 0, suyas = 0, otras = 0;
for (let i = 0; i < l.filas.length; i += BLOQUE) {
  const r = await fetch(`${url}/rest/v1/rpc/dropi_cartera_cargar_sistema`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_sync: sync, p_cuenta: cuenta, p_archivo: path.basename(archivo), p_filas: l.filas.slice(i, i + BLOQUE), p_carga: carga,
      p_resumen: { desde: l.desde, hasta: l.hasta, totales: l.totales, origen: 'script' } }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { console.error(`✗ No se guardó (bloque ${i / BLOQUE + 1}): ${d.message ?? r.status}`); process.exit(1); }
  carga = d.carga; filas += d.filas; suyas += d.ordenes_suyas; otras += d.ordenes_otras;
}
console.log(`✓ Guardado en ${cuenta}: ${filas} movimientos (carga ${carga}; órdenes de la tienda ${suyas}, de otra ${otras}).`);

// Fuera del camino para que la próxima corrida no lo vuelva a subir.
const destino = path.join(raiz, 'tools', 'cartera-cargada');
fs.mkdirSync(destino, { recursive: true });
fs.renameSync(archivo, path.join(destino, `${cuenta}-${path.basename(archivo)}`));
console.log(`   El Excel quedó en tools/cartera-cargada/.`);
