// Prueba la conexión a la API de Effi de cada cuenta configurada en .env.
// Uso: node --env-file=.env scripts/effi-check.mjs
// Nunca imprime las API keys. Hace 3 peticiones por cuenta (límite de Effi: 120/min por key).

const BASE = (process.env.EFFI_API_BASE || 'https://effi.com.co/api').replace(/\/$/, '');
const slugs = (process.env.EFFI_ACCOUNTS || '').split(',').map((s) => s.trim()).filter(Boolean);

const ymd = (d) => d.toISOString().slice(0, 10);
const today = new Date();
const daysAgo = (n) => new Date(today.getTime() - n * 86400000);

async function effi(key, path, params) {
  const url = `${BASE}/${path}?${new URLSearchParams(params)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } });
  let body;
  try {
    body = await res.json();
  } catch {
    body = { ok: false, mensaje: `respuesta no JSON (HTTP ${res.status})` };
  }
  if (res.status === 429) body.mensaje = `rate limit, reintentar en ${res.headers.get('retry-after')}s`;
  return { status: res.status, body };
}

async function checkAccount(slug) {
  const env = (k) => process.env[`EFFI_${slug}_${k}`] || '';
  const key = env('API_KEY');
  const label = `${slug} (${env('NOMBRE') || 'sin nombre'}, ${env('PAIS') || '?'}, ${env('TIPO') || '?'})`;
  if (!key) return { label, estado: 'SIN API KEY' };

  // 1) Valida la key y trae el país de la sucursal principal.
  const suc = await effi(key, 'sucursal', { por_pagina: 100 });
  if (!suc.body.ok) return { label, estado: `ERROR HTTP ${suc.status}: ${suc.body.mensaje}` };
  const sucursales = suc.body.data || [];
  const principal = sucursales.find((s) => s.principal === '1') || sucursales[0] || {};

  // 2) Guías de los últimos 30 días agrupadas por estado global Effi.
  const guias = await effi(key, 'guia_transporte', {
    agrupar_por: 'est_guia_efficommerce',
    desde: ymd(daysAgo(30)),
    hasta: ymd(today),
  });
  const porEstado = guias.body.ok
    ? Object.fromEntries((guias.body.data || []).map((r) => [r.nombre, Number(r.cantidad)]))
    : { error: `HTTP ${guias.status}: ${guias.body.mensaje}` };

  // 3) Un movimiento de wallet reciente: nombre de la empresa y unidad de los montos.
  const wallet = await effi(key, 'movimiento_dinero_effi', {
    fecha_desde: ymd(daysAgo(7)),
    fecha_hasta: ymd(today),
    por_pagina: 1,
  });
  const mov = wallet.body.ok ? (wallet.body.data || [])[0] : null;

  return {
    label,
    estado: 'OK',
    empresa: mov?.nombre_empresa || '(sin movimientos de wallet en 7 días)',
    pais: principal.nombre_pais || '?',
    sucursales: sucursales.length,
    guias_30d: porEstado,
    wallet_7d_total: wallet.body.ok ? wallet.body.paginacion?.total : `HTTP ${wallet.status}: ${wallet.body.mensaje}`,
    wallet_ejemplo: mov ? `${mov.tipo_movimiento}: ${mov.valor} ${mov.divisa} (guía ${mov.guia_inicial ?? '-'})` : null,
  };
}

if (!slugs.length) {
  console.error('EFFI_ACCOUNTS está vacío. ¿Corriste con --env-file=.env?');
  process.exit(1);
}

let ok = 0;
for (const slug of slugs) {
  let r;
  try {
    r = await checkAccount(slug);
  } catch (err) {
    r = { label: slug, estado: `ERROR de red: ${err.message}` };
  }
  if (r.estado === 'OK') ok++;
  console.log(`\n■ ${r.label} → ${r.estado}`);
  for (const [k, v] of Object.entries(r)) {
    if (k === 'label' || k === 'estado') continue;
    console.log(`   ${k}: ${typeof v === 'object' && v !== null ? JSON.stringify(v) : v}`);
  }
}
console.log(`\n${ok}/${slugs.length} cuentas conectadas.`);
