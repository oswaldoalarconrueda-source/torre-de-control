// novedades: la bandeja de novedades de la Torre habla con Effi.
//
// POST /functions/v1/novedades?accion=enviar&id=123   (cabecera x-sync-token) ← novedad_enviar (pg_net)
//   Manda a Effi la solución guardada en novedad_envios (POST api/gestion_novedad_guia_transporte) y guarda lo que
//   respondió. Si Effi la acepta, la novedad sale de la bandeja de una vez (est_novedad de la respuesta).
// POST /functions/v1/novedades?accion=catalogo         ← cron diario
//   Aprende el catálogo de soluciones de cada transportadora (la API de Effi no lo trae) del historial de soluciones de
//   los últimos 60 días: id, nombre y si pide nueva entrega (fecha, quién recibe, dirección y teléfono).

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EFFI_API = 'https://effi.com.co/api';
const DAY_MS = 86_400_000;
const MIN_GAP_MS = 560;
const PAGINAS = 40;

type Json = Record<string, any>;

async function rpc(fn: string, body: unknown) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`supabase ${fn} HTTP ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
async function tabla(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`supabase ${path.split('?')[0]} HTTP ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const llave = async (cuenta: string) => {
  const keys: { slug: string; api_key: string }[] = await rpc('effi_get_api_keys', {});
  return keys.find((k) => k.slug === cuenta)?.api_key ?? null;
};

async function enviar(id: number) {
  const [e] = await tabla(`novedad_envios?id=eq.${id}&select=*`);
  if (!e || e.estado !== 'enviando') return { omitido: 'no está por enviar' };
  const guardar = (cambios: Json) => tabla(`novedad_envios?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(cambios) });
  const key = await llave(e.cuenta);
  if (!key) { await guardar({ estado: 'error', mensaje: 'Sin API key de Effi para esta tienda' }); return { ok: false }; }

  const cuerpo: Json = { id_novedad: Number(e.novedad), empresa_novedad: Number(e.empresa), gestion: e.gestion, id_solucion: e.id_solucion };
  if (e.fecha_nueva_entrega) Object.assign(cuerpo, { fecha_nueva_entrega: e.fecha_nueva_entrega, destinatario: e.destinatario, direccion: e.direccion, telefonos: e.telefonos });
  let status = 0, j: Json | null = null;
  try {
    const res = await fetch(`${EFFI_API}/gestion_novedad_guia_transporte`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
    status = res.status;
    const texto = await res.text();
    try { j = JSON.parse(texto); } catch { j = { texto: texto.slice(0, 2000) }; }
  } catch (err) {
    // Sin respuesta: no se sabe si Effi la creó (reintentar crearía otra). Se avisa para revisar en Effi.
    await guardar({ estado: 'error', mensaje: `Effi no respondió (${String(err)}). Revisa en Effi si quedó antes de reintentar.` });
    return { ok: false };
  }
  if (!(status >= 200 && status < 300 && j?.ok === true)) {
    const m = j?.mensaje ?? j?.texto ?? `HTTP ${status}`;
    await guardar({ estado: 'error', mensaje: typeof m === 'string' ? m : JSON.stringify(m), respuesta: { status, cuerpo: j, enviado: cuerpo } });
    return { ok: false };
  }
  const d = (j.data ?? {}) as Json;
  await guardar({ estado: 'enviada', enviado_en: new Date().toISOString(), mensaje: d.estado_gestion ?? null, respuesta: { status, cuerpo: j, enviado: cuerpo } });
  // La novedad queda como la dejó Effi (normalmente solucionada o pendiente de aprobación): sale de la bandeja ya.
  if (d.est_novedad) {
    await tabla(`effi_novedades?cuenta=eq.${e.cuenta}&empresa=eq.${e.empresa}&id=eq.${e.novedad}`, {
      method: 'PATCH',
      body: JSON.stringify({ est_novedad: Number(d.est_novedad), cant_gestion: Number(d.cant_gestion ?? 0) || null, actualizado_en: new Date().toISOString() }),
    });
  }
  return { ok: true };
}

async function catalogo() {
  const keys: { slug: string; api_key: string }[] = await rpc('effi_get_api_keys', {});
  const cuentas: { slug: string }[] = await tabla('effi_accounts?select=slug&tipo=eq.tienda&activa=eq.true');
  const hoy = Date.now();
  const desde = new Date(hoy - 60 * DAY_MS).toISOString().slice(0, 10), hasta = new Date(hoy + DAY_MS).toISOString().slice(0, 10);
  const resumen: Json = {};
  await Promise.all(cuentas.map(async ({ slug }) => {
    const key = keys.find((k) => k.slug === slug)?.api_key;
    if (!key) return;
    try {
      const vistos = new Map<string, Json>();
      for (let p = 1, total = 1; p <= total && p <= PAGINAS; p++) {
        if (p > 1) await sleep(MIN_GAP_MS);
        const qs = new URLSearchParams({ desde, hasta, por_pagina: '100', pagina: String(p) });
        const res = await fetch(`${EFFI_API}/gestion_novedad_guia_transporte?${qs}`, { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } });
        const j = await res.json().catch(() => null);
        if (!res.ok || !j?.ok) throw new Error(`HTTP ${res.status}: ${j?.mensaje ?? 'sin respuesta'}`);
        total = Number(j.paginacion?.total_paginas ?? 1);
        for (const g of j.data ?? []) {
          if (!g.id_solucion || !g.transportadora_efficommerce) continue;
          const k = `${g.transportadora_efficommerce}|${g.id_solucion}`;
          const v = vistos.get(k) ?? { cuenta: slug, transportadora_efficommerce: Number(g.transportadora_efficommerce), id_solucion: Number(g.id_solucion), nombre_solucion: String(g.nombre_solucion ?? `Solución ${g.id_solucion}`), pide_entrega: false, veces: 0, visto_en: new Date().toISOString() };
          v.veces++;
          if (g.fecha_nueva_entrega) v.pide_entrega = true;
          vistos.set(k, v);
        }
      }
      if (vistos.size) {
        await tabla('novedad_soluciones?on_conflict=cuenta,transportadora_efficommerce,id_solucion', {
          method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify([...vistos.values()]),
        });
      }
      resumen[slug] = vistos.size;
    } catch (err) {
      resumen[slug] = { error: String(err) };
    }
  }));
  return resumen;
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, mensaje: 'Solo POST' });
  const token = req.headers.get('x-sync-token') || '';
  if (!token || !(await rpc('effi_check_sync_token', { p_token: token }))) return json(401, { ok: false, mensaje: 'Token inválido' });
  const url = new URL(req.url);
  const accion = url.searchParams.get('accion');
  try {
    if (accion === 'enviar') {
      const id = Number(url.searchParams.get('id'));
      if (!id) return json(400, { ok: false, mensaje: 'Falta id' });
      return json(200, { ok: true, resultado: await enviar(id) });
    }
    if (accion === 'catalogo') return json(200, { ok: true, resultado: await catalogo() });
    return json(400, { ok: false, mensaje: 'accion=enviar|catalogo' });
  } catch (e) {
    return json(500, { ok: false, mensaje: String(e) });
  }
});
