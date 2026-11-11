// agente-acciones: lo que una persona pide sobre una orden desde la lista del agente (11-nov-2026). Va aparte de
// auto-convertir (que crea remisiones y guías) para no tocarlo.
//
// POST /functions/v1/agente-acciones?cuenta=SLUG&accion=ID   (cabecera x-sync-token) → hace la acción de auto_acciones:
//   - direccion: PUT api/orden_v con país, departamento, ciudad, dirección y referencia (Effi no cambia conceptos ni totales).
//   - anular:    DELETE api/orden_v con la observación de anulación (el motivo que escribió la persona).
// POST /functions/v1/agente-acciones?cuenta=SLUG&catalogo=1  → carga el catálogo de ciudades del país (provincias y ciudades).
//
// Una a la vez; el resultado queda en auto_acciones y en la bitácora (auto_accion_resultado).

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EFFI_API = 'https://effi.com.co/api';
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

async function tabla(path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
  if (!res.ok) throw new Error(`supabase ${path.split('?')[0]} HTTP ${res.status}`);
  return res.json();
}

async function llave(cuenta: string) {
  const keys: { slug: string; api_key: string }[] = await rpc('effi_get_api_keys', {});
  return keys.find((k) => k.slug === cuenta)?.api_key ?? null;
}

// Effi: 120 peticiones por minuto por llave; con 429 se espera lo que pida y se reintenta.
async function effi(key: string, metodo: 'GET' | 'PUT' | 'DELETE', recurso: string, datos: Json) {
  for (let intento = 0; ; intento++) {
    const url = metodo === 'GET' ? `${EFFI_API}/${recurso}?${new URLSearchParams(Object.entries(datos).map(([k, v]) => [k, String(v)]))}` : `${EFFI_API}/${recurso}`;
    const res = await fetch(url, {
      method: metodo,
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json', ...(metodo === 'GET' ? {} : { 'Content-Type': 'application/json' }) },
      ...(metodo === 'GET' ? {} : { body: JSON.stringify(datos) }),
    });
    if (res.status === 429 && intento < 4) { await sleep(1000 * Math.min(30, Number(res.headers.get('retry-after')) || 8)); continue; }
    const texto = await res.text();
    let j: Json | null = null;
    try { j = JSON.parse(texto); } catch { j = { texto: texto.slice(0, 500) }; }
    return { status: res.status, ok: res.ok && j?.ok === true, j };
  }
}

async function accionOrden(cuenta: string, idAccion: number) {
  const [a] = await tabla(`auto_acciones?id=eq.${idAccion}&cuenta=eq.${cuenta}&estado=eq.pendiente&select=*`);
  if (!a) return { ok: false, motivo: 'Acción no encontrada o ya hecha' };
  const fin = (ok: boolean, mensaje: string | null) => rpc('auto_accion_resultado', { p_id: idAccion, p_ok: ok, p_mensaje: mensaje });
  const key = await llave(cuenta);
  if (!key) { await fin(false, 'Sin llave de Effi'); return { ok: false }; }
  const d = a.datos ?? {};
  const r = a.tipo === 'direccion'
    ? await effi(key, 'PUT', 'orden_v', {
        sucursal: a.sucursal, id: a.orden_id, id_pais_cliente: Number(d.pais_id), id_provincia_cliente: Number(d.provincia_id),
        id_ciudad_cliente: Number(d.ciudad_id), direccion_cliente: String(d.direccion).slice(0, 255),
        ...(d.referencia ? { referencia_cliente: String(d.referencia).slice(0, 255) } : {}),
      })
    : await effi(key, 'DELETE', 'orden_v', {
        sucursal: a.sucursal, id: a.orden_id, observacion_anular: `${String(d.motivo)} (desde el agente, ${a.por ?? 'una persona'})`.slice(0, 255),
      });
  if (!r.ok) {
    const m = r.j?.mensaje ?? r.j?.texto ?? `HTTP ${r.status}`;
    await fin(false, `Effi no dejó: ${typeof m === 'string' ? m.slice(0, 300) : JSON.stringify(m).slice(0, 300)}`);
    return { ok: false };
  }
  await fin(true, null);
  return { ok: true };
}

// Catálogo de ciudades del país de la tienda (tabla global de Effi): provincias del país y ciudades de cada provincia.
async function cargarCiudades(cuenta: string) {
  const key = await llave(cuenta);
  if (!key) return { ok: false, motivo: 'Sin llave' };
  const [o] = await tabla(`auto_ordenes?cuenta=eq.${cuenta}&pais_id=not.is.null&select=pais_id&order=fecha_orden.desc&limit=1`);
  if (!o) return { ok: false, motivo: 'Todavía no hay órdenes con país' };
  const todas = async (recurso: string, filtros: Json, max: number) => {
    const out: Json[] = [];
    for (let p = 1; p <= max; p++) {
      const r = await effi(key, 'GET', recurso, { ...filtros, por_pagina: 100, pagina: p });
      if (!r.ok) throw new Error(`${recurso} HTTP ${r.status}: ${r.j?.mensaje ?? ''}`);
      out.push(...(r.j?.data ?? []));
      await sleep(550);
      if (p >= Number(r.j?.paginacion?.total_paginas ?? 1)) break;
    }
    return out;
  };
  const provincias = await todas('provincia', { pais: o.pais_id }, 5);
  let n = 0;
  for (const p of provincias) {
    const ciudades = await todas('ciudad', { provincia: p.id }, 60);
    const filas = ciudades.map((c) => ({ pais_id: o.pais_id, provincia_id: Number(p.id), provincia: p.nombre, ciudad_id: Number(c.id), ciudad: c.nombre }));
    if (filas.length) n += await rpc('effi_ciudades_cargar', { p_filas: filas });
  }
  return { ok: true, provincias: provincias.length, ciudades: n };
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, mensaje: 'Solo POST' });
  const token = req.headers.get('x-sync-token') || '';
  if (!token || !(await rpc('effi_check_sync_token', { p_token: token }))) return json(401, { ok: false, mensaje: 'Token inválido' });
  const url = new URL(req.url);
  const cuenta = url.searchParams.get('cuenta') ?? '';
  if (!/^[A-Z0-9_]+$/.test(cuenta)) return json(400, { ok: false, mensaje: 'Falta cuenta' });
  const accion = Number(url.searchParams.get('accion') ?? 0);
  if (accion) {
    try {
      return json(200, await accionOrden(cuenta, accion));
    } catch (e) {
      await rpc('auto_accion_resultado', { p_id: accion, p_ok: false, p_mensaje: `Falla inesperada: ${String(e).slice(0, 300)}` }).catch(() => {});
      return json(500, { ok: false, mensaje: String(e) });
    }
  }
  if (url.searchParams.get('catalogo') === '1') {
    // @ts-ignore EdgeRuntime existe en Supabase Edge Functions
    EdgeRuntime.waitUntil(cargarCiudades(cuenta).then((r) => console.log('catalogo', cuenta, JSON.stringify(r))).catch((e) => console.error('catalogo', cuenta, String(e))));
    return json(202, { ok: true, mensaje: 'Cargando ciudades' });
  }
  return json(400, { ok: false, mensaje: 'Nada que hacer' });
});
