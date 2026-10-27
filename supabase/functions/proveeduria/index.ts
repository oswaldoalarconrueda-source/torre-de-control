// proveeduria: trae de Effi los indicadores ya calculados de cada proveeduría (Distrilatam) y los guarda en
// prov_indicadores para el tablero. Usa el MCP de Effi (herramienta "indicadores") con la API key de cada empresa.
//
// POST /functions/v1/proveeduria   (cabecera x-sync-token)   ← cron cada 30 min (prov_refrescar)
//   Periodos (día local de cada empresa): hoy, ayer, últimos 7 días, este mes y mes anterior.
//   Ventas, compras, wallet y clientes van por periodo; inventario, cartera, tesorería y alertas son una foto de hoy
//   (se guardan solo con el periodo "mes").
// Las empresas van en paralelo y dentro de cada una las consultas una tras otra (Effi limita las peticiones por llave).
// Además trae sus remisiones de venta (prov_remisiones) por la API, para "Datos" de la proveeduría: las de los últimos
// 2 días en cada pasada y, de a 20 días, el historial desde el 1 de enero (prov_sync.avance).
// POST ...?solo=ventas  ← cron cada 10 min: solo las remisiones (sin indicadores).

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MCP = 'https://effi.com.co/mcp';
const DAY_MS = 86_400_000;
const POR_PERIODO = ['ventas', 'compras', 'wallets', 'clientes'];
const FOTO = ['inventario', 'cartera', 'tesoreria', 'alertas'];

async function rpc(fn: string, body: unknown) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`supabase ${fn} HTTP ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
async function sb(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init, headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`supabase ${path.split('?')[0]} HTTP ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Cliente MCP mínimo (HTTP "streamable"): una sesión por empresa; reintenta si Effi pide esperar (429).
class Mcp {
  sid: string | null = null;
  id = 1;
  constructor(private key: string) {}
  async rpc(method: string, params?: unknown, notificacion = false) {
    for (let intento = 0; ; intento++) {
      const h: Record<string, string> = { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
      if (this.sid) h['Mcp-Session-Id'] = this.sid;
      const body = notificacion ? { jsonrpc: '2.0', method, params } : { jsonrpc: '2.0', id: this.id++, method, params };
      const res = await fetch(MCP, { method: 'POST', headers: h, body: JSON.stringify(body) });
      if (res.status === 429 && intento < 4) { await sleep(Number(res.headers.get('retry-after') ?? 10) * 1000); continue; }
      this.sid = res.headers.get('Mcp-Session-Id') ?? this.sid;
      const txt = await res.text();
      if (!res.ok) throw new Error(`MCP ${method} HTTP ${res.status}: ${txt.slice(0, 200)}`);
      if (notificacion || !txt.trim()) return null;
      const datos = txt.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim());
      return JSON.parse(datos.length ? datos[datos.length - 1] : txt);
    }
  }
  async iniciar() {
    await this.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'torre-proveeduria', version: '1' } });
    await this.rpc('notifications/initialized', undefined, true).catch(() => {});
  }
  async indicadores(bloque: string, desde: string, hasta: string) {
    const r = await this.rpc('tools/call', { name: 'indicadores', arguments: { bloque, desde, hasta } });
    const texto = r?.result?.content?.[0]?.text;
    if (r?.result?.isError || !texto) throw new Error(`indicadores ${bloque}: ${String(texto ?? JSON.stringify(r?.error ?? r)).slice(0, 200)}`);
    return JSON.parse(texto);
  }
}

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
function periodos(tzMin: number) {
  const hoy = iso(Date.now() + tzMin * 60_000);
  const d = new Date(`${hoy}T12:00:00Z`);
  const inicioMes = `${hoy.slice(0, 8)}01`;
  const finMesAnt = iso(Date.parse(`${inicioMes}T12:00:00Z`) - DAY_MS);
  return {
    hoy: [hoy, hoy], ayer: [iso(d.getTime() - DAY_MS), iso(d.getTime() - DAY_MS)], '7d': [iso(d.getTime() - 6 * DAY_MS), hoy],
    mes: [inicioMes, hoy], mes_ant: [`${finMesAnt.slice(0, 8)}01`, finMesAnt],
  } as Record<string, [string, string]>;
}

// ───────── Remisiones de venta (API de Effi) ─────────
const EFFI_API = 'https://effi.com.co/api';
// Instante UTC → "YYYY-MM-DD HH:MM:SS" en la hora de la empresa (formato de los filtros de Effi).
const local = (ms: number, off: number) => new Date(Math.floor(ms / 1000) * 1000 + off * 60_000).toISOString().slice(0, 19).replace('T', ' ');
const utc = (s: string | null) => (s ? `${s.replace(' ', 'T')}Z` : null); // Effi devuelve las fechas en UTC

async function effiGet(key: string, path: string, params: Record<string, string | number>) {
  for (let intento = 0; ; intento++) {
    const res = await fetch(`${EFFI_API}/${path}?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
    });
    if ((res.status === 429 || res.status >= 500) && intento < 3) { await sleep(Number(res.headers.get('retry-after') ?? 5) * 1000); continue; }
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) throw new Error(`${path} HTTP ${res.status}: ${String(j?.mensaje ?? '').slice(0, 120)}`);
    return j as { data: Record<string, unknown>[]; paginacion?: { total_paginas?: number } };
  }
}

async function ventas(cuenta: { slug: string; tz_offset_min: number }, key: string, a: number, b: number) {
  let n = 0;
  for (let pagina = 1; ; pagina++) {
    const r = await effiGet(key, 'remision_v', { desde: local(a, cuenta.tz_offset_min), hasta: local(b, cuenta.tz_offset_min), por_pagina: 100, pagina });
    const filas = (r.data ?? []).map((x) => ({
      cuenta: cuenta.slug, sucursal: Number(x.sucursal), id: Number(x.id), fecha_trans: utc(x.fecha_trans as string),
      total: Number(x.total ?? 0), subtotal: Number(x.subtotal ?? 0), impuestos: Number(x.impuestos ?? 0), devolucion: Number(x.devolucion ?? 0),
      transaccion_dropshipping: x.transaccion_dropshipping ? Number(x.transaccion_dropshipping) : null,
      empresa_distribuidor: x.empresa_distribuidor ? Number(x.empresa_distribuidor) : null, distribuidor: x.nombre_empresa_distribuidor ?? null,
      cliente: x.nombre_cliente ?? null, ciudad: x.nombre_ciudad ?? null, provincia: x.nombre_provincia ?? null,
      estado: x.estado ?? null, estado_dropshipping: x.estado_dropshipping ?? null, vigente: String(x.vigente) !== '0', actualizado_en: new Date().toISOString(),
    }));
    if (filas.length) await sb('prov_remisiones?on_conflict=cuenta,sucursal,id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(filas) });
    n += filas.length;
    if (pagina >= Number(r.paginacion?.total_paginas ?? 1) || !filas.length) break;
    await sleep(600);
  }
  return n;
}

async function cargarVentas(cuenta: { slug: string; tz_offset_min: number }, key: string) {
  const ahora = Date.now(), reciente = ahora - 2 * DAY_MS;
  const nuevas = await ventas(cuenta, key, reciente, ahora);
  const [st] = await sb(`prov_sync?cuenta=eq.${cuenta.slug}&select=avance`);
  let historial = 0;
  if (st && Date.parse(st.avance) < reciente) {
    const a = Date.parse(st.avance), b = Math.min(a + 20 * DAY_MS, reciente);
    historial = await ventas(cuenta, key, a, b);
    await sb(`prov_sync?cuenta=eq.${cuenta.slug}`, { method: 'PATCH', body: JSON.stringify({ avance: new Date(b).toISOString() }) });
  }
  return { nuevas, historial };
}

async function refrescar(cuenta: { slug: string; tz_offset_min: number }, key: string) {
  const mcp = new Mcp(key);
  await mcp.iniciar();
  const filas: unknown[] = [], errores: string[] = [];
  for (const [periodo, [desde, hasta]] of Object.entries(periodos(cuenta.tz_offset_min))) {
    for (const bloque of periodo === 'mes' ? [...POR_PERIODO, ...FOTO] : POR_PERIODO) {
      try {
        const datos = await mcp.indicadores(bloque, desde, hasta);
        filas.push({ cuenta: cuenta.slug, periodo, bloque, desde, hasta, datos, actualizado_en: new Date().toISOString() });
      } catch (e) { errores.push(`${periodo}/${bloque}: ${(e as Error).message}`); }
      await sleep(300);
    }
  }
  if (filas.length) await sb('prov_indicadores?on_conflict=cuenta,periodo,bloque', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(filas) });
  return { guardados: filas.length, errores };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, mensaje: 'Solo POST' });
  const token = req.headers.get('x-sync-token') || '';
  if (!token || !(await rpc('effi_check_sync_token', { p_token: token }))) return json(401, { ok: false, mensaje: 'Token inválido' });
  try {
    const keys: { slug: string; api_key: string }[] = await rpc('effi_get_api_keys', {});
    const cuentas: { slug: string; tz_offset_min: number }[] = await sb('effi_accounts?select=slug,tz_offset_min&tipo=eq.proveeduria&activa=eq.true');
    const soloVentas = new URL(req.url).searchParams.get('solo') === 'ventas';
    const resumen: Record<string, unknown> = {};
    await Promise.all(cuentas.map(async (c) => {
      const key = keys.find((k) => k.slug === c.slug)?.api_key;
      if (!key) { resumen[c.slug] = 'sin API key en el Vault (scripts/push-effi-keys.mjs)'; return; }
      const r: Record<string, unknown> = (resumen[c.slug] = {});
      try { r.ventas = await cargarVentas(c, key); } catch (e) { r.ventas = { error: (e as Error).message }; }
      if (!soloVentas) { try { r.indicadores = await refrescar(c, key); } catch (e) { r.indicadores = { error: (e as Error).message }; } }
    }));
    return json(200, { ok: true, resumen });
  } catch (e) {
    return json(500, { ok: false, mensaje: String((e as Error).message ?? e).slice(0, 300) });
  }
});
