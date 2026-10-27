// trm-diaria: guarda por día la TRM oficial de Colombia (pesos por dólar, Superfinanciera en datos.gov.co) y el tipo
// de cambio de referencia de Guatemala (quetzales por dólar, Banguat) en app_trm_dia. Con eso el gasto de Meta, que
// llega en COP, se pasa a la moneda de cada país con la tasa del mismo día: COP → USD (÷ TRM) → GTQ (× Banguat).
//
// POST /functions/v1/trm-diaria   (cabecera x-sync-token)   ← cron dos veces al día: los últimos 15 días
// POST ...?desde=2026-07-01                                  ← historial
// La TRM colombiana viene por rangos de vigencia (el fin de semana vale la del viernes): se reparte día por día. Si a
// un día le falta alguna tasa, se usa la del día anterior que sí la tenga.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
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
const masDias = (iso: string, n: number) => dia(new Date(Date.parse(`${iso}T12:00:00Z`) + n * DAY_MS));

// datos.gov.co a veces responde "Service unavailable": se reintenta.
async function conReintento<T>(f: () => Promise<T>, veces = 4): Promise<T> {
  for (let i = 0; ; i++) {
    try { return await f(); } catch (e) { if (i >= veces - 1) throw e; await sleep(3000 * (i + 1)); }
  }
}

async function trmColombia(desde: string, hasta: string) {
  const url = new URL('https://www.datos.gov.co/resource/32sa-8pi3.json');
  url.searchParams.set('$select', 'valor,vigenciadesde,vigenciahasta');
  url.searchParams.set('$where', `vigenciahasta >= '${desde}T00:00:00' and vigenciadesde <= '${hasta}T00:00:00'`);
  url.searchParams.set('$order', 'vigenciadesde');
  url.searchParams.set('$limit', '5000');
  const filas = await conReintento(async () => {
    const r = await fetch(url);
    const b = await r.json();
    if (!r.ok || !Array.isArray(b)) throw new Error(`TRM Colombia: ${r.status} ${JSON.stringify(b).slice(0, 120)}`);
    return b as { valor: string; vigenciadesde: string; vigenciahasta: string }[];
  });
  const porDia = new Map<string, number>();
  for (const f of filas) {
    for (let d = f.vigenciadesde.slice(0, 10); d <= f.vigenciahasta.slice(0, 10); d = masDias(d, 1)) porDia.set(d, Number(f.valor));
  }
  return porDia;
}

async function cambioGuatemala(desde: string, hasta: string) {
  const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  const xml = await conReintento(async () => {
    const r = await fetch('https://www.banguat.gob.gt/variables/ws/TipoCambio.asmx', {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '"http://www.banguat.gob.gt/variables/ws/TipoCambioRango"' },
      body: `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><TipoCambioRango xmlns="http://www.banguat.gob.gt/variables/ws/"><fechainit>${ddmmyyyy(desde)}</fechainit><fechafin>${ddmmyyyy(hasta)}</fechafin></TipoCambioRango></soap:Body></soap:Envelope>`,
    });
    if (!r.ok) throw new Error(`Banguat: HTTP ${r.status}`);
    return await r.text();
  });
  const porDia = new Map<string, number>();
  for (const m of xml.matchAll(/<fecha>(\d{2})\/(\d{2})\/(\d{4})<\/fecha><venta>([\d.]+)<\/venta>/g)) {
    porDia.set(`${m[3]}-${m[2]}-${m[1]}`, Number(m[4]));
  }
  return porDia;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, mensaje: 'Solo POST' });
  const sync = req.headers.get('x-sync-token') || '';
  if (!sync || !(await rpc('effi_check_sync_token', { p_token: sync }))) return json(401, { ok: false, mensaje: 'Token inválido' });
  const url = new URL(req.url);
  try {
    const hoy = dia(new Date(Date.now() - 5 * 3_600_000));
    const hasta = masDias(hoy, 1); // la TRM de mañana ya se publica hoy
    const desde = url.searchParams.get('desde') ?? masDias(hoy, -15);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || desde > hoy) return json(400, { ok: false, mensaje: 'desde inválido (AAAA-MM-DD)' });
    // Una semana antes para tener con qué rellenar los primeros días si les falta la tasa.
    const [cop, gtq] = await Promise.all([trmColombia(masDias(desde, -7), hasta), cambioGuatemala(masDias(desde, -7), hasta)]);
    const filas: { fecha: string; usd_cop: number; usd_gtq: number }[] = [];
    let ultCop: number | undefined, ultGtq: number | undefined;
    for (let d = masDias(desde, -7); d <= hasta; d = masDias(d, 1)) {
      ultCop = cop.get(d) ?? ultCop;
      ultGtq = gtq.get(d) ?? ultGtq;
      if (d >= desde && ultCop && ultGtq && (cop.has(d) || d <= hoy)) filas.push({ fecha: d, usd_cop: ultCop, usd_gtq: ultGtq });
    }
    if (filas.length) await sb('app_trm_dia?on_conflict=fecha', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(filas) });
    return json(200, { ok: true, desde, hasta: filas.at(-1)?.fecha ?? null, dias: filas.length, trm_colombia: cop.size, banguat: gtq.size });
  } catch (e) {
    return json(500, { ok: false, mensaje: String((e as Error).message ?? e).slice(0, 300) });
  }
});
