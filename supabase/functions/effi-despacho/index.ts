// effi-despacho: guarda cuántas guías de cada día tienen relación de despacho (effi_despacho_dia), para el "Despacho" del Inicio.
// Effi no avisa por webhook cuando una guía entra a una relación y puede pasar días después de creada, así que se pregunta el
// total por día a la API (una petición por día y cuenta; por_pagina=1, solo se lee la paginación).
//
// POST /functions/v1/effi-despacho?dias=5        (cabecera x-sync-token)  ← cron cada 15 min (dias=5) y de madrugada (dias=45)
// POST /functions/v1/effi-despacho?desde=2026-07-01                       ← historial: de esa fecha a hoy

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EFFI_API = 'https://effi.com.co/api';
const DAY_MS = 86_400_000;
const MIN_GAP_MS = 550;

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sb(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`supabase ${path.split('?')[0]} HTTP ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
const rpc = (fn: string, args: Record<string, unknown> = {}) => sb(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });

// Total de guías con relación de despacho creadas ese día (hora de la empresa).
async function totalDia(key: string, dia: string): Promise<number> {
  const qs = new URLSearchParams({ relacion_despacho: '1', desde: `${dia} 00:00:00`, hasta: `${dia} 23:59:59`, por_pagina: '1', pagina: '1' });
  for (let intento = 0; ; intento++) {
    const res = await fetch(`${EFFI_API}/guia_transporte?${qs}`, { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } });
    if ((res.status === 429 || res.status >= 500) && intento < 3) {
      await sleep(Math.min(Number(res.headers.get('retry-after') || 5), 20) * 1000);
      continue;
    }
    const d = await res.json().catch(() => null);
    if (!res.ok || !d?.ok) throw new Error(`guia_transporte HTTP ${res.status}: ${String(d?.mensaje ?? '').slice(0, 120)}`);
    return Number(d.paginacion?.total ?? 0);
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, mensaje: 'Solo POST' });
  const token = req.headers.get('x-sync-token') || '';
  if (!token || !(await rpc('effi_check_sync_token', { p_token: token }))) return json(401, { ok: false, mensaje: 'Token inválido' });
  const url = new URL(req.url);
  const desde = url.searchParams.get('desde');
  const dias = Math.max(1, Math.min(60, Number(url.searchParams.get('dias') ?? 5) || 5));
  if (desde && !/^\d{4}-\d{2}-\d{2}$/.test(desde)) return json(400, { ok: false, mensaje: 'desde inválido' });

  try {
    const keys: { slug: string; api_key: string }[] = await rpc('effi_get_api_keys');
    const cuentas: { slug: string; tz_offset_min: number }[] = await sb('effi_accounts?select=slug,tz_offset_min&activa=eq.true&tipo=eq.tienda');
    const limite = Date.now() + 130_000;
    const resumen: Record<string, unknown> = {};
    // Cuentas en paralelo: cada una tiene su propio límite de peticiones en Effi.
    await Promise.all(cuentas.map(async (c) => {
      const key = keys.find((k) => k.slug === c.slug)?.api_key;
      if (!key) return void (resumen[c.slug] = 'sin llave');
      const hoy = new Date(Date.now() + c.tz_offset_min * 60_000).toISOString().slice(0, 10);
      const inicio = desde ?? new Date(Date.parse(`${hoy}T12:00:00Z`) - (dias - 1) * DAY_MS).toISOString().slice(0, 10);
      let n = 0;
      try {
        // De lo más reciente a lo más viejo: si se acaba el tiempo, lo que falta es lo que menos cambia.
        for (let t = Date.parse(`${hoy}T12:00:00Z`); t >= Date.parse(`${inicio}T12:00:00Z`) && Date.now() < limite; t -= DAY_MS) {
          const fecha = new Date(t).toISOString().slice(0, 10);
          const guias = await totalDia(key, fecha);
          await sb('effi_despacho_dia?on_conflict=cuenta,fecha', {
            method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
            body: JSON.stringify({ cuenta: c.slug, fecha, guias, actualizado_en: new Date().toISOString() }),
          });
          n++;
          await sleep(MIN_GAP_MS);
        }
        resumen[c.slug] = n;
      } catch (e) {
        resumen[c.slug] = `error tras ${n} días: ${String(e).slice(0, 200)}`;
      }
    }));
    return json(200, { ok: true, resumen });
  } catch (e) {
    return json(500, { ok: false, mensaje: String((e as Error).message ?? e).slice(0, 300) });
  }
});
