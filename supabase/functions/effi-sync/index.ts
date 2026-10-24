// effi-sync: trae guías, historial de estados, novedades y wallet de Effi a Supabase.
//
// POST /functions/v1/effi-sync              (cabecera x-sync-token) → corrida en segundo plano, responde 202
// POST /functions/v1/effi-sync?esperar=1    → misma corrida, espera y devuelve el resumen (pruebas)
// POST /functions/v1/effi-sync?accion=set_keys  body {"TIENDA_CO": "<api key>", ...} → guarda keys en Vault
//
// Cada corrida (cron cada minuto): (1) sync incremental de cada recurso desde su cursor (10 min de
// solape) y (2) con el tiempo que sobre, avanza cargas históricas pendientes (tabla effi_sync_jobs).
//
// La respuesta de Effi se reenvía cruda a Postgres (rpc effi_ingest), que limpia, mapea y guarda:
// las Edge Functions tienen un límite de CPU por corrida y parsear miles de filas aquí lo agota.
//
// Particularidades de la API de Effi (ver docs/effi-api-map.md):
// - Filtros de fecha en hora de la empresa; datos devueltos en UTC.
// - hist_est_guia_transporte: la página 2+ llega vacía; novedades: las páginas se solapan.
//   Para esos dos recursos no se pagina: se parte el rango en ventanas de ≤100 filas.
// - 120 peticiones/min por API key: se espacian ≥550 ms por cuenta.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EFFI_API = 'https://effi.com.co/api';
const BUDGET_MS = 50_000;
const MAX_REQ_POR_CUENTA = 80;
const MIN_GAP_MS = 550;
const OVERLAP_MS = 10 * 60_000;
const DAY_MS = 86_400_000;
const PAGE = 100;

// ───────────────────────── Supabase (PostgREST con service role) ─────────────────────────

async function sb(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`supabase ${path.split('?')[0]} HTTP ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
const rpc = (fn: string, args: Record<string, unknown> = {}) =>
  sb(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });

// Guarda una respuesta cruda de Effi sin parsear sus filas (se arma el cuerpo por concatenación).
const ingest = (cuenta: string, recurso: string, rawEffi: string): Promise<number> =>
  sb('rpc/effi_ingest', {
    method: 'POST',
    body: `{"p_cuenta":${JSON.stringify(cuenta)},"p_recurso":${JSON.stringify(recurso)},"p_payload":${rawEffi}}`,
  }).then((n) => n ?? 0);

// ───────────────────────── Cliente Effi ─────────────────────────

class BudgetExceeded extends Error {}

type Account = { slug: string; tz_offset_min: number; key: string };
type Pagina = { raw: string; total: number; paginas: number };

class Effi {
  private last = 0;
  requests = 0;
  constructor(private acc: Account, private deadline: number) {}

  async get(path: string, params: Record<string, string | number>): Promise<Pagina> {
    for (let intento = 0; ; intento++) {
      if (Date.now() > this.deadline || this.requests >= MAX_REQ_POR_CUENTA) throw new BudgetExceeded();
      const wait = this.last + MIN_GAP_MS - Date.now();
      if (wait > 0) await sleep(wait);
      this.last = Date.now();
      this.requests++;
      const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
      const res = await fetch(`${EFFI_API}/${path}?${qs}`, {
        headers: { Authorization: `Bearer ${this.acc.key}`, Accept: 'application/json' },
      });
      const raw = await res.text();
      if (res.status === 429 && intento < 3) {
        await sleep(Math.min(Number(res.headers.get('retry-after') || 5), 20) * 1000);
        continue;
      }
      if (res.status >= 500 && intento < 2) {
        await sleep(2000);
        continue;
      }
      if (!res.ok || !/^\s*\{\s*"ok"\s*:\s*true/.test(raw)) {
        const mensaje = raw.match(/"mensaje"\s*:\s*"([^"]*)"/)?.[1] ?? raw.slice(0, 120);
        throw new Error(`${path} HTTP ${res.status}: ${mensaje}`);
      }
      // Solo se lee la paginación (al final del cuerpo), no las filas.
      const pag = raw.match(/"paginacion"\s*:\s*(\{[^}]*\})/)?.[1];
      const p = pag ? JSON.parse(pag) : { total: 0, total_paginas: 1 };
      return { raw, total: Number(p.total), paginas: Number(p.total_paginas) };
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Instante UTC → "YYYY-MM-DD HH:MM:SS" en la hora de la empresa (formato que esperan los filtros).
const local = (ms: number, off: number) =>
  new Date(Math.floor(ms / 1000) * 1000 + off * 60_000).toISOString().slice(0, 19).replace('T', ' ');

// ───────────────────────── Recursos ─────────────────────────

type Recurso = {
  path: string;
  desde: string;
  hasta: string;
  paginable: boolean; // false → ventanas de ≤100 filas (paginación de Effi poco fiable)
  extra?: Record<string, string>;
  tramoJobMs: number; // tamaño de tramo al avanzar una carga histórica
};

const RECURSOS: Record<string, Recurso> = {
  hist: { path: 'hist_est_guia_transporte', desde: 'cambio_estado_desde', hasta: 'cambio_estado_hasta', paginable: false, tramoJobMs: DAY_MS / 2 },
  wallet: { path: 'movimiento_dinero_effi', desde: 'fecha_desde', hasta: 'fecha_hasta', paginable: true, tramoJobMs: DAY_MS },
  guias: { path: 'guia_transporte', desde: 'desde', hasta: 'hasta', paginable: true, tramoJobMs: 2 * DAY_MS },
  novedades_1: { path: 'novedad_guia_transporte', desde: 'desde', hasta: 'hasta', paginable: false, extra: { t_novedad: '1' }, tramoJobMs: DAY_MS },
  novedades_2: { path: 'novedad_guia_transporte', desde: 'desde', hasta: 'hasta', paginable: false, extra: { t_novedad: '2' }, tramoJobMs: 7 * DAY_MS },
};
const INCREMENTALES = ['hist', 'wallet', 'guias', 'novedades_1', 'novedades_2'];

// Trae y guarda todo lo del rango [a, b] (ms UTC). Devuelve filas guardadas.
async function syncRange(api: Effi, acc: Account, nombre: string, a: number, b: number, avisos: string[]): Promise<number> {
  let total = 0;
  // La API acepta rangos de hasta 31 días: se recorre en tramos de 30.
  for (let t = a; t < b; t += 30 * DAY_MS) total += await syncWindow(api, acc, nombre, t, Math.min(t + 30 * DAY_MS, b), avisos);
  return total;
}

async function syncWindow(api: Effi, acc: Account, nombre: string, a: number, b: number, avisos: string[]): Promise<number> {
  const rec = RECURSOS[nombre];
  const params = { ...rec.extra, [rec.desde]: local(a, acc.tz_offset_min), [rec.hasta]: local(b, acc.tz_offset_min), por_pagina: PAGE };
  const first = await api.get(rec.path, { ...params, pagina: 1 });
  if (first.total <= PAGE) return first.total ? ingest(acc.slug, nombre, first.raw) : 0;

  if (rec.paginable) {
    let n = await ingest(acc.slug, nombre, first.raw);
    for (let p = 2; p <= first.paginas; p++) n += await ingest(acc.slug, nombre, (await api.get(rec.path, { ...params, pagina: p })).raw);
    return n;
  }

  if (b - a <= 60_000) {
    avisos.push(`${acc.slug}/${nombre}: ${first.total} filas en 1 minuto (${local(a, acc.tz_offset_min)}); se guardaron 100`);
    return ingest(acc.slug, nombre, first.raw);
  }
  // Partir en sub-ventanas que deberían caber en una página (los extremos son inclusivos: se separan 1 s).
  const partes = Math.min(10, Math.ceil(first.total / 80));
  const paso = Math.ceil((b - a) / partes / 1000) * 1000;
  let n = 0;
  for (let t = a; t <= b; t += paso) n += await syncWindow(api, acc, nombre, t, Math.min(t + paso - 1000, b), avisos);
  return n;
}

// ───────────────────────── Corrida ─────────────────────────

async function correr() {
  const inicio = Date.now();
  const deadline = inicio + BUDGET_MS;
  const resumen: Record<string, any> = {};

  if (!(await rpc('effi_sync_try_lock', { p_segundos: Math.ceil(BUDGET_MS / 1000) + 30 }))) return { omitida: 'otra corrida en curso' };
  const [run] = await sb('effi_sync_runs?select=id', { method: 'POST', headers: { Prefer: 'return=representation' }, body: '{}' });
  try {
    const keys: { slug: string; api_key: string }[] = await rpc('effi_get_api_keys');
    const cuentas: any[] = await sb('effi_accounts?select=slug,tz_offset_min&activa=eq.true');
    const accs: Account[] = cuentas
      .map((c) => ({ ...c, key: keys.find((k) => k.slug === c.slug)?.api_key }))
      .filter((c) => c.key);
    resumen.sin_key = cuentas.filter((c) => !keys.some((k) => k.slug === c.slug)).map((c) => c.slug);

    // Cuentas en paralelo (cada una tiene su propio límite de peticiones).
    await Promise.all(accs.map(async (acc) => {
      const api = new Effi(acc, deadline);
      const r: Record<string, any> = (resumen[acc.slug] = { incremental: {}, jobs: [], avisos: [] });
      try {
        await syncIncremental(api, acc, r);
        await avanzarJobs(api, acc, r);
      } catch (e) {
        if (e instanceof BudgetExceeded) r.tiempo_agotado = true;
        else r.error = String(e);
      }
      r.peticiones = api.requests;
    }));

    await sb(`effi_sync_runs?inicio=lt.${new Date(Date.now() - 7 * DAY_MS).toISOString()}`, { method: 'DELETE' });
  } finally {
    await rpc('effi_sync_unlock').catch(() => {});
    resumen.segundos = Math.round((Date.now() - inicio) / 1000);
    await sb(`effi_sync_runs?id=eq.${run.id}`, { method: 'PATCH', body: JSON.stringify({ fin: new Date().toISOString(), resumen }) }).catch(() => {});
  }
  return resumen;
}

async function syncIncremental(api: Effi, acc: Account, r: Record<string, any>) {
  const estados: any[] = await sb(`effi_sync_state?cuenta=eq.${acc.slug}&select=recurso,cursor_utc`);
  for (const nombre of INCREMENTALES) {
    const hasta = Date.now();
    const cursor = estados.find((s) => s.recurso === nombre)?.cursor_utc;
    // Primera vez: últimas 2 horas (la historia la traen los jobs). Máximo 30 días de atraso.
    const desde = Math.max(cursor ? Date.parse(cursor) - OVERLAP_MS : hasta - 2 * 3600_000, hasta - 30 * DAY_MS);
    const st: Record<string, unknown> = { cuenta: acc.slug, recurso: nombre };
    try {
      const n = await syncRange(api, acc, nombre, desde, hasta, r.avisos);
      Object.assign(st, { cursor_utc: new Date(hasta).toISOString(), ultimo_ok: new Date().toISOString(), filas_ultima: n, ultimo_error: null });
      r.incremental[nombre] = n;
    } catch (e) {
      if (e instanceof BudgetExceeded) throw e;
      Object.assign(st, { ultimo_error: String(e).slice(0, 500) });
      r.incremental[nombre] = `error: ${e}`;
    }
    await sb('effi_sync_state?on_conflict=cuenta,recurso', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(st),
    });
  }
}

async function avanzarJobs(api: Effi, acc: Account, r: Record<string, any>) {
  const jobs: any[] = await sb(`effi_sync_jobs?cuenta=eq.${acc.slug}&estado=eq.pendiente&order=id&select=id,recurso,hasta_utc,avance_utc,filas`);
  for (const job of jobs) {
    const rec = RECURSOS[job.recurso];
    if (!rec) {
      await sb(`effi_sync_jobs?id=eq.${job.id}`, { method: 'PATCH', body: JSON.stringify({ estado: 'error', error: 'recurso desconocido' }) });
      continue;
    }
    let avance = Date.parse(job.avance_utc);
    const hasta = Date.parse(job.hasta_utc);
    let filas = Number(job.filas);
    try {
      while (avance < hasta) {
        const fin = Math.min(avance + rec.tramoJobMs, hasta);
        filas += await syncRange(api, acc, job.recurso, avance, fin, r.avisos);
        avance = fin;
        const listo = avance >= hasta;
        await sb(`effi_sync_jobs?id=eq.${job.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ avance_utc: new Date(avance).toISOString(), filas, error: null, ...(listo ? { estado: 'listo', terminado_en: new Date().toISOString() } : {}) }),
        });
      }
      r.jobs.push({ id: job.id, recurso: job.recurso, listo: true, filas });
    } catch (e) {
      r.jobs.push({ id: job.id, recurso: job.recurso, avance: new Date(avance).toISOString(), filas });
      if (e instanceof BudgetExceeded) throw e;
      await sb(`effi_sync_jobs?id=eq.${job.id}`, { method: 'PATCH', body: JSON.stringify({ error: String(e).slice(0, 500) }) });
    }
  }
}

// ───────────────────────── HTTP ─────────────────────────

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, mensaje: 'Solo POST' });
  const token = req.headers.get('x-sync-token') || '';
  if (!token || !(await rpc('effi_check_sync_token', { p_token: token }))) return json(401, { ok: false, mensaje: 'Token inválido' });

  const url = new URL(req.url);
  if (url.searchParams.get('accion') === 'set_keys') {
    const body = await req.json().catch(() => ({}));
    const guardadas: string[] = [];
    for (const [slug, key] of Object.entries(body)) {
      if (typeof key !== 'string' || key.length < 20) continue;
      await rpc('effi_set_api_key', { p_slug: slug, p_key: key });
      guardadas.push(slug);
    }
    return json(200, { ok: true, guardadas });
  }

  if (url.searchParams.get('esperar') === '1') return json(200, { ok: true, resumen: await correr() });

  // @ts-ignore EdgeRuntime existe en Supabase Edge Functions
  EdgeRuntime.waitUntil(correr().catch((e) => console.error('effi-sync', e)));
  return json(202, { ok: true, mensaje: 'Corrida iniciada' });
});
