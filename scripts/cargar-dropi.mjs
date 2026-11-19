// Carga al Centro de Control los Excel de Dropi «ordenes_*.xlsx» y «ordenes_productos_*.xlsx» sin abrir Cargar archivos.
// Usa la misma lectura de la web (web/src/lib/cargas.ts) y el mismo guardado (app_cargar, vía rpc app_cargar_sistema con el
// token de sincronización), que revisa que las órdenes sean de esa tienda. Primero las órdenes y después los productos.
//
// Uso (desde la carpeta del proyecto):
//   node --no-warnings --env-file=.env scripts/cargar-dropi.mjs TIENDA_CO "ordenes_….xlsx" "ordenes_productos_….xlsx" [--prueba]
// Nunca imprime datos de clientes.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(raiz, 'web', 'package.json'));
const { readSheet } = require('read-excel-file/node');
const { leerTabla } = await import(path.join(raiz, 'web/src/lib/cargas.ts'));

const args = process.argv.slice(2);
const prueba = args.includes('--prueba');
const [cuenta, ...archivos] = args.filter((a) => !a.startsWith('--'));
if (!cuenta || !archivos.length) { console.error('Uso: node --env-file=.env scripts/cargar-dropi.mjs TIENDA_CO archivo1.xlsx [archivo2.xlsx] [--prueba]'); process.exit(1); }
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, sync = process.env.EFFI_SYNC_TOKEN;
if (!url || !anon || !sync) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY o EFFI_SYNC_TOKEN en el .env'); process.exit(1); }

// Dropi: órdenes y luego productos. Drop (A un clic HN/SV): órdenes y luego billetera; al final se concilia con icomfly.
const ORDEN = { dropi_ordenes: 1, dropi_productos: 2, drop_ordenes: 1, drop_billetera: 2 };
const lecturas = [];
for (const a of archivos) {
  const archivo = path.resolve(a);
  if (!fs.existsSync(archivo)) { console.error(`No existe ${archivo}`); process.exit(1); }
  const l = await leerTabla(await readSheet(archivo));
  if (!ORDEN[l.tipo]) { console.error(`«${path.basename(archivo)}» no es de órdenes/productos de Dropi ni de órdenes/billetera de Drop (parece ${l.tipo ?? 'otro archivo'}).`); process.exit(1); }
  if (l.cuenta && l.cuenta !== cuenta) { console.error(`«${path.basename(archivo)}» parece de ${l.cuenta}, no de ${cuenta}. No se cargó nada.`); process.exit(1); }
  lecturas.push({ archivo, l });
}
lecturas.sort((a, b) => ORDEN[a.l.tipo] - ORDEN[b.l.tipo]);

for (const { archivo, l } of lecturas) {
  console.log(`📄 ${path.basename(archivo)} · ${l.tipo} · ${l.filas.length} filas${l.desde ? ` · ${l.desde} → ${l.hasta}` : ''}`);
  for (const t of l.totales ?? []) console.log(`   ${t.etiqueta}: ${t.moneda ? t.valor.toLocaleString('es-CO', { maximumFractionDigits: 2 }) : t.valor}`);
}
if (prueba) { console.log('(prueba: no se guardó nada)'); process.exit(0); }

const BLOQUE = 1000;
for (const { archivo, l } of lecturas) {
  let carga = null, filas = 0, omitidas = 0, suyas = 0, otras = 0;
  for (let i = 0; i < l.filas.length; i += BLOQUE) {
    const r = await fetch(`${url}/rest/v1/rpc/app_cargar_sistema`, {
      method: 'POST',
      headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_sync: sync, p_tipo: l.tipo, p_cuenta: cuenta, p_archivo: path.basename(archivo), p_filas: l.filas.slice(i, i + BLOQUE),
        p_carga: carga, p_resumen: { desde: l.desde, hasta: l.hasta, totales: l.totales } }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { console.error(`✗ ${path.basename(archivo)} no se guardó (bloque ${i / BLOQUE + 1}): ${d.message ?? r.status}`); process.exit(1); }
    carga = d.carga; filas += d.filas; omitidas += d.omitidas ?? 0; suyas += d.ordenes_suyas ?? 0; otras += d.ordenes_otras ?? 0;
  }
  console.log(`✓ ${path.basename(archivo)} → ${cuenta}: ${filas} filas (carga ${carga}; ya eran de la tienda ${suyas}, de otra ${otras}${omitidas ? `, omitidas ${omitidas}` : ''}).`);
}

// Drop: cruzar producto con icomfly y recalcular costo (venta − abono), como Cargar archivos.
if (lecturas.some(({ l }) => l.tipo.startsWith('drop_'))) {
  const r = await fetch(`${url}/rest/v1/rpc/drop_conciliar_script`, {
    method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_sync: sync, p_cuenta: cuenta }),
  });
  const d = await r.json().catch(() => ({}));
  console.log(r.ok ? `✓ Conciliado: ${JSON.stringify(d).slice(0, 400)}` : `✗ No se concilió: ${d.message ?? r.status}`);
}
