// auto-vigilancia: la Torre vigila las órdenes de venta (primero Guatemala). No crea nada en Effi.
//
// POST /functions/v1/auto-vigilancia         (cabecera x-sync-token, el mismo de effi-sync) → cron cada 2 minutos
// POST /functions/v1/auto-vigilancia?mes=1   → cron cada hora: trae todo el mes en curso (para los totales del mes)
//
// Por cada cuenta con modo distinto de "apagado" en auto_config: trae de Effi las órdenes de venta y las
// remisiones de venta creadas en los últimos 3 días y las reenvía crudas a Postgres (rpc auto_ingest), que
// cruza cada orden con su remisión y su guía. Las reglas y los estados se calculan en auto_lista.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EFFI_API = 'https://effi.com.co/api';
const DIAS = 3;
const MIN_GAP_MS = 550;
const DAY_MS = 86_400_000;

async function rpc(fn: string, body: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`supabase ${fn} HTTP ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function tabla(path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`supabase ${path.split('?')[0]} HTTP ${res.status}`);
  return res.json();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Todas las páginas de un recurso en el rango, como respuestas crudas (sin parsear las filas).
async function traer(key: string, recurso: string, desde: string, hasta: string): Promise<string[]> {
  const paginas: string[] = [];
  for (let pagina = 1, total = 1; pagina <= total && pagina <= 40; pagina++) {
    if (pagina > 1) await sleep(MIN_GAP_MS);
    const qs = new URLSearchParams({ desde, hasta, por_pagina: '100', pagina: String(pagina) });
    const res = await fetch(`${EFFI_API}/${recurso}?${qs}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
    });
    const raw = await res.text();
    if (!res.ok || !/^\s*\{\s*"ok"\s*:\s*true/.test(raw)) {
      throw new Error(`${recurso} HTTP ${res.status}: ${raw.match(/"mensaje"\s*:\s*"([^"]*)"/)?.[1] ?? raw.slice(0, 120)}`);
    }
    total = Number(raw.match(/"total_paginas"\s*:\s*(\d+)/)?.[1] ?? 1);
    paginas.push(raw);
  }
  return paginas;
}

async function correr(mes: boolean) {
  const config: { cuenta: string; modo: string }[] = await tabla('auto_config?select=cuenta,modo&modo=neq.apagado');
  if (!config.length) return { cuentas: 0 };
  const keys: { slug: string; api_key: string }[] = await rpc('effi_get_api_keys', '{}');
  const cuentas: { slug: string; tz_offset_min: number }[] = await tabla('effi_accounts?select=slug,tz_offset_min');
  const resumen: Record<string, unknown> = {};

  await Promise.all(config.map(async ({ cuenta }) => {
    try {
      const key = keys.find((k) => k.slug === cuenta)?.api_key;
      if (!key) throw new Error('Sin API key');
      const off = cuentas.find((c) => c.slug === cuenta)?.tz_offset_min ?? 0;
      // Fechas en la hora de la empresa (formato de los filtros de Effi). Effi toma "hasta=AAAA-MM-DD" como las
      // 00:00 de ese día, así que se pide hasta mañana para incluir las órdenes de hoy.
      const hoy = new Date(Date.now() + off * 60_000);
      const dia = (ms: number) => new Date(ms).toISOString().slice(0, 10);
      const manana = hoy.getTime() + DAY_MS;
      // El mes va por semanas (Ecuador hace unas 8.000 órdenes al mes y cada tramo admite 40 páginas de 100); con cada
      // semana se traen las remisiones de 3 días más, para cruzar las órdenes que se remisionaron al día siguiente.
      const tramos: [number, number][] = [];
      if (mes) {
        for (let d = Date.parse(`${hoy.toISOString().slice(0, 8)}01`); d < manana; d += 7 * DAY_MS) tramos.push([d, Math.min(d + 7 * DAY_MS, manana)]);
      } else {
        tramos.push([hoy.getTime() - DIAS * DAY_MS, manana]);
      }
      let n = 0;
      for (const [d, h] of tramos) {
        const ordenes = await traer(key, 'orden_v', dia(d), dia(h));
        await sleep(MIN_GAP_MS);
        const remisiones = await traer(key, 'remision_v', dia(d), dia(Math.min(h + 3 * DAY_MS, manana)));
        n += await rpc(
          'auto_ingest',
          `{"p_cuenta":${JSON.stringify(cuenta)},"p_ordenes":[${ordenes.join(',')}],"p_remisiones":[${remisiones.join(',')}]}`,
        );
        await sleep(MIN_GAP_MS);
      }
      resumen[cuenta] = { cambios: n, tramos: tramos.length };
    } catch (e) {
      resumen[cuenta] = { error: String(e) };
      await rpc('auto_error', JSON.stringify({ p_cuenta: cuenta, p_error: String(e) })).catch(() => {});
    }
  }));
  return resumen;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, mensaje: 'Solo POST' });
  const token = req.headers.get('x-sync-token') || '';
  if (!token || !(await rpc('effi_check_sync_token', JSON.stringify({ p_token: token })))) {
    return json(401, { ok: false, mensaje: 'Token inválido' });
  }
  // El mes completo tarda más que una petición normal: responde de una vez y trabaja en segundo plano.
  if (new URL(req.url).searchParams.get('mes') === '1') {
    // @ts-ignore EdgeRuntime existe en Supabase Edge Functions
    EdgeRuntime.waitUntil(correr(true).catch(() => {}));
    return json(202, { ok: true, mensaje: 'Mes en curso' });
  }
  return json(200, { ok: true, resumen: await correr(false) });
});
