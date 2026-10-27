// meta-gasto: trae de la API de Meta (Marketing API, insights) el gasto publicitario por día, campaña y país de entrega
// de todas las cuentas publicitarias que ve el token del usuario del sistema, y lo guarda con meta_guardar en las mismas
// tablas que la carga del CSV del BM (app_publicidad_campanas → app_publicidad_diaria).
//
// POST /functions/v1/meta-gasto   (cabecera x-sync-token)   ← cron cada hora (meta_refrescar): los últimos 3 días
// POST ...?desde=2026-09-01&hasta=2026-10-26                  ← historial (de a 31 días por llamada)
// POST ...?accion=token  body {"nombre": "meta_access_token_x", "token": "..."}  ← scripts/push-meta.mjs: guarda el token
//   en el Vault. Nunca devuelve el token. Un token por portafolio comercial (cada uno con su app y su usuario del sistema);
//   las cuentas que ve cada token se traen con ese token.
// El país de entrega decide la tienda; si Meta lo da como "unknown", la etiqueta de la campaña: (COL), (EC), (GT)…
// Las cuentas en otra divisa se pasan a COP con la TRM del mes (app_trm_mes).

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GRAPH = 'https://graph.facebook.com/v21.0';
const DAY_MS = 86_400_000;

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
const dia = (d: Date) => d.toISOString().slice(0, 10);

// GET a Graph con reintento si Meta pide esperar (límite de llamadas). El token nunca sale en los errores.
async function graph(url: string, token: string): Promise<{ data?: Record<string, unknown>[]; paging?: { next?: string } }> {
  for (let intento = 0; ; intento++) {
    const u = new URL(url);
    u.searchParams.set('access_token', token);
    const res = await fetch(u);
    const body = await res.json().catch(() => ({}));
    if (res.ok) return body;
    const e = body?.error ?? {};
    if ([4, 17, 32, 613, 80004].includes(e.code) && intento < 3) { await sleep(20_000 * (intento + 1)); continue; }
    throw new Error(`Meta ${e.code ?? res.status}${e.error_subcode ? '/' + e.error_subcode : ''}: ${String(e.message ?? '').replaceAll(token, '***').slice(0, 200)}`);
  }
}
async function todo(url: string, token: string) {
  const filas: Record<string, unknown>[] = [];
  let next: string | undefined = url;
  while (next) {
    const r = await graph(next, token);
    filas.push(...(r.data ?? []));
    next = r.paging?.next ? (() => { const u = new URL(r.paging!.next!); u.searchParams.delete('access_token'); return u.toString(); })() : undefined;
  }
  return filas;
}

function paisMeta(pais: string, campana: string) {
  const p = (pais ?? '').toUpperCase();
  if (/^[A-Z]{2}$/.test(p)) return p;
  if (/\((COL|CO)\)/i.test(campana)) return 'CO';
  if (/\((ECU|EC)\)/i.test(campana)) return 'EC';
  if (/\((GUA|GUATE|GT)\)/i.test(campana)) return 'GT';
  return null;
}

async function sincronizar(tokens: { nombre: string; token: string }[], desde: string, hasta: string) {
  // Cuentas de todos los portafolios; si una la ven dos tokens, se trae una sola vez. Las marcadas "excluir" en
  // meta_cuentas_ads (no son de la sociedad, p. ej. las Alma) no se traen.
  const excluidas = new Set(((await sb('meta_cuentas_ads?select=id&excluir=eq.true')) as { id: string }[]).map((x) => x.id));
  const cuentas: { c: Record<string, unknown>; token: string; portafolio: string }[] = [];
  const tokensConError: Record<string, string> = {};
  for (const t of tokens) {
    try {
      for (const c of await todo(`${GRAPH}/me/adaccounts?fields=account_id,name,currency,timezone_name,account_status&limit=200`, t.token)) {
        if (excluidas.has(String(c.account_id))) continue;
        if (!cuentas.some((x) => x.c.account_id === c.account_id)) cuentas.push({ c, token: t.token, portafolio: t.nombre });
      }
    } catch (e) { tokensConError[t.nombre] = (e as Error).message; }
  }
  const trm: { mes: string; usd_cop: number; gtq_cop: number }[] = await sb('app_trm_mes?select=mes,usd_cop,gtq_cop');
  const aCop = (divisa: string, fecha: string) => {
    if (divisa === 'COP') return 1;
    const t = trm.find((x) => x.mes.slice(0, 7) === fecha.slice(0, 7)) ?? trm.sort((a, b) => b.mes.localeCompare(a.mes))[0];
    if (divisa === 'USD') return Number(t?.usd_cop ?? 0);
    if (divisa === 'GTQ') return Number(t?.gtq_cop ?? 0);
    return 0;
  };
  const filas: { pais: string; fecha: string; cuenta_ads: string; campana: string; monto_cop: number }[] = [];
  const nombres: string[] = [];
  const resumen: Record<string, unknown> = {};
  const sinPais = new Set<string>();
  for (const { c, token, portafolio } of cuentas) {
    const id = String(c.account_id), nombre = String(c.name ?? id).trim(), divisa = String(c.currency ?? 'COP');
    try {
      const params = new URLSearchParams({
        level: 'campaign', breakdowns: 'country', time_increment: '1', fields: 'campaign_name,spend', limit: '500',
        time_range: JSON.stringify({ since: desde, until: hasta }),
      });
      const datos = await todo(`${GRAPH}/act_${id}/insights?${params}`, token);
      let total = 0;
      for (const r of datos) {
        const campana = String(r.campaign_name ?? '(sin nombre)');
        const fecha = String(r.date_start);
        const factor = aCop(divisa, fecha);
        const monto = Number(r.spend ?? 0) * factor;
        if (!monto) continue;
        const pais = paisMeta(String(r.country ?? ''), campana);
        if (!pais) { sinPais.add(campana); continue; }
        filas.push({ pais, fecha, cuenta_ads: nombre, campana, monto_cop: monto });
        total += monto;
      }
      if (divisa !== 'COP' && datos.length && !aCop(divisa, desde)) throw new Error(`Sin TRM para ${divisa}`);
      nombres.push(nombre);
      resumen[nombre] = Math.round(total);
      await sb(`meta_cuentas_ads?on_conflict=id`, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify([{ id, nombre, divisa, zona: c.timezone_name ?? null, estado: c.account_status ?? null, token: portafolio, ultima_sync: new Date().toISOString(), ultimo_error: null }]) });
    } catch (e) {
      resumen[nombre] = { error: (e as Error).message };
      await sb(`meta_cuentas_ads?on_conflict=id`, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify([{ id, nombre, divisa, zona: c.timezone_name ?? null, estado: c.account_status ?? null, token: portafolio, ultimo_error: (e as Error).message }]) });
    }
  }
  const guardado = nombres.length ? await rpc('meta_guardar', { p_filas: filas, p_cuentas_ads: nombres, p_desde: desde, p_hasta: hasta }) : null;
  return { desde, hasta, portafolios: tokens.map((t) => t.nombre), tokens_con_error: tokensConError, cuentas: resumen, guardado, sin_pais: [...sinPais].slice(0, 10) };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, mensaje: 'Solo POST' });
  const sync = req.headers.get('x-sync-token') || '';
  if (!sync || !(await rpc('effi_check_sync_token', { p_token: sync }))) return json(401, { ok: false, mensaje: 'Token inválido' });
  const url = new URL(req.url);
  try {
    if (url.searchParams.get('accion') === 'token') {
      const body = await req.json().catch(() => ({})) as { nombre?: string; token?: string };
      const nombre = (body.nombre ?? 'meta_access_token').toLowerCase();
      const t = (body.token ?? '').replace(/\s+/g, '');
      if (!/^meta_access_token(_[a-z0-9]+)?$/.test(nombre)) return json(400, { ok: false, mensaje: 'Nombre de token inválido' });
      if (!/^EA[A-Za-z0-9]{50,}$/.test(t)) return json(400, { ok: false, mensaje: 'Token de Meta inválido' });
      const prueba = await fetch(`${GRAPH}/me?fields=id,name&access_token=${encodeURIComponent(t)}`);
      if (!prueba.ok) return json(400, { ok: false, mensaje: `Meta rechazó el token (HTTP ${prueba.status})` });
      const quien = await prueba.json().catch(() => ({}));
      await rpc('app_guardar_secreto', { p_nombre: nombre, p_valor: t });
      return json(200, { ok: true, guardados: [nombre], portafolio: quien?.name ?? null });
    }
    const tokens: { nombre: string; token: string }[] = await rpc('meta_tokens', {});
    if (!tokens.length) return json(400, { ok: false, mensaje: 'No hay tokens de Meta en el Vault (scripts/push-meta.mjs)' });
    // Por defecto los últimos 3 días (hora Colombia). Con desde/hasta, máximo 31 días por llamada.
    const hoy = dia(new Date(Date.now() - 5 * 3_600_000));
    const hasta = url.searchParams.get('hasta') ?? hoy;
    let desde = url.searchParams.get('desde') ?? dia(new Date(Date.parse(hoy) - 2 * DAY_MS));
    if (![desde, hasta].every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)) || desde > hasta) return json(400, { ok: false, mensaje: 'Fechas inválidas (desde y hasta: AAAA-MM-DD)' });
    if (Date.parse(hasta) - Date.parse(desde) > 30 * DAY_MS) desde = dia(new Date(Date.parse(hasta) - 30 * DAY_MS));
    return json(200, { ok: true, ...(await sincronizar(tokens, desde, hasta)) });
  } catch (e) {
    return json(500, { ok: false, mensaje: String((e as Error).message ?? e).slice(0, 300) });
  }
});
