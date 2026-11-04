// informe-pendientes: cada mañana, un correo por país con las guías que siguen en "Generada" y sin relación de despacho, y
// un Excel por proveedor (proveedor, transportadora, guía, producto, valor a recaudar). Regla del dueño (4-nov):
// - Sale a las 8:00 a. m. hora Colombia, todos los días menos el domingo.
// - Corte: dos días atrás sin contar el domingo, hasta las 12 de la noche. Miércoles → lunes; lunes → viernes.
// - Un país sin pendientes no recibe correo.
// Los destinatarios están en informe_pendientes_destinos (por SQL, no en el repo, que es público). La guía se consulta en Effi
// porque la relación de despacho no se guarda aquí. Cada país corre aparte: si uno falla, los demás salen igual, y el resultado
// queda en su fila (ultimo_envio, ultimo_error).
//
// POST /functions/v1/informe-pendientes                         (cabecera x-sync-token) ← informe_pendientes_enviar (cron)
// POST /functions/v1/informe-pendientes?prueba=1&para=a@x.com   solo a ese correo, sin copia y con [Prueba] en el asunto
//   &cuenta=TIENDA_CO limita a un país.

import nodemailer from 'npm:nodemailer@6.9.16';
import * as XLSX from 'npm:xlsx@0.18.5';
import { Buffer } from 'node:buffer';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EFFI_API = 'https://effi.com.co/api';
const MIN_GAP_MS = 560;
const DESDE = '2026-07-01'; // primeras ventas de las tiendas
const PAISES: Record<string, string> = { TIENDA_CO: 'Colombia', TIENDA_EC: 'Ecuador', TIENDA_GT: 'Guatemala', TIENDA_CR: 'Costa Rica' };

type Json = Record<string, any>;
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

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
    ...init, headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`supabase ${path.split('?')[0]} HTTP ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Fechas como texto AAAA-MM-DD, en hora Colombia.
const hoyColombia = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
const diaSemana = (dia: string) => new Date(`${dia}T12:00:00Z`).getUTCDay(); // 0 = domingo
const restarDia = (dia: string) => new Date(Date.parse(`${dia}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
function corte(hoy: string) {
  let dia = hoy;
  for (let n = 2; n > 0;) {
    dia = restarDia(dia);
    if (diaSemana(dia) !== 0) n--;
  }
  return dia;
}
const fechaLarga = (dia: string, conSemana = false) => new Intl.DateTimeFormat('es-CO', {
  timeZone: 'UTC', day: 'numeric', month: 'long', ...(conSemana ? { weekday: 'long' } : {}),
}).format(new Date(`${dia}T12:00:00Z`));

// Guías en Generada, vigentes y sin relación de despacho hasta el corte. Effi interpreta "hasta" en la hora del país y
// devuelve fecha_trans en UTC: el día de cada guía se pasa a la hora del país.
async function pendientes(key: string, hasta: string) {
  const guias: Json[] = [];
  for (let pagina = 1; ; pagina++) {
    const qs = new URLSearchParams({ est_guia_efficommerce: '1', relacion_despacho: '0', vigente: '1', desde: DESDE, hasta: `${hasta} 23:59:59`, por_pagina: '100', pagina: String(pagina) });
    let res: Response;
    for (let intento = 0; ; intento++) {
      res = await fetch(`${EFFI_API}/guia_transporte?${qs}`, { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } });
      if (res.status !== 429 || intento >= 4) break;
      await sleep(1000 * Math.min(30, Number(res.headers.get('retry-after')) || 8));
    }
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) throw new Error(`guia_transporte HTTP ${res.status}: ${j?.mensaje ?? 'sin respuesta'}`);
    guias.push(...(j.data ?? []));
    if (pagina >= Number(j.paginacion?.total_paginas ?? 1)) break;
    await sleep(MIN_GAP_MS);
  }
  return guias.filter((g) => g.vigente !== '0' && String(g.est_guia_efficommerce) === '1' && !g.id_relacion_despacho);
}

const proveedorDe = (g: Json) => String(g.nombre_empresa_proveedor ?? '').trim() || 'Sin proveedor';
const transportadoraDe = (g: Json) => String(g.nombre_transportadora_efficommerce ?? g.nombre_transportadora ?? '').split('|')[0].trim();
const productoDe = (g: Json) => String(g.contenido ?? '').trim().replace(/\.$/, '');

function excel(guias: Json[]) {
  const hoja = XLSX.utils.aoa_to_sheet([
    ['Proveedor', 'Transportadora', 'Guía', 'Producto', 'Valor a recaudar'],
    ...guias.map((g) => [proveedorDe(g), transportadoraDe(g), String(g.guia ?? ''), productoDe(g), Number(g.valor_recaudo ?? 0)]),
  ]);
  hoja['!cols'] = [{ wch: 32 }, { wch: 20 }, { wch: 18 }, { wch: 46 }, { wch: 16 }];
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Pendientes');
  return Buffer.from(XLSX.write(libro, { type: 'array', bookType: 'xlsx' }));
}

function cuerpo(pais: string, hasta: string, guias: Json[], offsetMin: number) {
  const diaDe = (g: Json) => new Date(Date.parse(`${String(g.fecha_trans).replace(' ', 'T')}Z`) + offsetMin * 60_000).toISOString().slice(0, 10);
  const grupos = new Map<string, number>();
  for (const g of guias) {
    const k = `${diaDe(g)}|${proveedorDe(g)}`;
    grupos.set(k, (grupos.get(k) ?? 0) + 1);
  }
  const filas = [...grupos].sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => {
    const [dia, proveedor] = k.split('|');
    return `<tr><td style="padding:4px 12px 4px 0">Día ${esc(fechaLarga(dia))}</td><td style="padding:4px 12px;text-align:right"><b>${n}</b> ${n === 1 ? 'guía' : 'guías'}</td><td style="padding:4px 0 4px 12px">${esc(proveedor)}</td></tr>`;
  }).join('');
  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a">
<h2 style="font-size:18px;margin:0 0 4px">Guías pendientes por despacho · ${esc(pais)}</h2>
<p style="margin:0 0 16px;color:#555">En estado Generada y sin relación de despacho, creadas hasta el ${esc(fechaLarga(hasta, true))} a las 12 de la noche.</p>
<p style="margin:0 0 8px"><b>Pendientes: ${guias.length} ${guias.length === 1 ? 'guía' : 'guías'}</b></p>
<table style="border-collapse:collapse;font-size:14px">${filas}</table>
<p style="margin:16px 0 0;color:#555">Va un Excel por cada proveedor.</p>
</div>`;
}

async function enviarPais(destino: Json, opciones: { prueba: boolean; para: string[] }, cred: { user: string; pass: string }, key: string, offsetMin: number, hasta: string, hoy: string) {
  const pais = PAISES[destino.cuenta] ?? destino.cuenta;
  const guias = await pendientes(key, hasta);
  if (!guias.length) return { guias: 0, proveedores: 0, enviado: false };
  const porProveedor = new Map<string, Json[]>();
  for (const g of guias) porProveedor.set(proveedorDe(g), [...(porProveedor.get(proveedorDe(g)) ?? []), g]);
  const adjuntos = [...porProveedor].sort(([a], [b]) => a.localeCompare(b)).map(([proveedor, filas]) => ({
    filename: `Pendientes ${pais} - ${proveedor.replace(/[\\/:*?"<>|]/g, ' ').trim()} - ${hoy}.xlsx`,
    content: excel(filas),
  }));
  const transporte = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: cred.user, pass: cred.pass } });
  await transporte.sendMail({
    from: `Centro de Control <${cred.user}>`,
    to: (opciones.prueba ? opciones.para : destino.para).join(', '),
    ...(!opciones.prueba && destino.copia?.length ? { cc: destino.copia.join(', ') } : {}),
    subject: `${opciones.prueba ? '[Prueba] ' : ''}Guías pendientes por despacho · ${pais} · ${guias.length} · ${fechaLarga(hoy)}`,
    html: cuerpo(pais, hasta, guias, offsetMin),
    attachments: adjuntos,
  });
  return { guias: guias.length, proveedores: adjuntos.length, enviado: true };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, mensaje: 'Solo POST' });
  const token = req.headers.get('x-sync-token') || '';
  if (!token || !(await rpc('effi_check_sync_token', { p_token: token }))) return json(401, { ok: false, mensaje: 'Token inválido' });
  const url = new URL(req.url);
  const prueba = url.searchParams.get('prueba') === '1';
  const para = (url.searchParams.get('para') ?? '').split(',').map((x) => x.trim().toLowerCase()).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
  if (prueba && !para.length) return json(400, { ok: false, mensaje: 'La prueba necesita para=' });
  const hoy = hoyColombia();
  if (!prueba && diaSemana(hoy) === 0) return json(200, { ok: true, omitida: 'domingo' });
  const hasta = corte(hoy);
  const cuenta = url.searchParams.get('cuenta');
  if (cuenta && !/^[A-Z0-9_]+$/.test(cuenta)) return json(400, { ok: false, mensaje: 'Cuenta inválida' });

  const tarea = (async () => {
    const destinos: Json[] = await tabla(`informe_pendientes_destinos?activo=eq.true${cuenta ? `&cuenta=eq.${cuenta}` : ''}&select=*&order=cuenta`);
    const cred = await rpc('informe_credenciales', {}) as { user: string; pass: string };
    const keys: { slug: string; api_key: string }[] = await rpc('effi_get_api_keys', {});
    const cuentas: { slug: string; tz_offset_min: number }[] = await tabla('effi_accounts?select=slug,tz_offset_min');
    for (const d of destinos) {
      let resultado: Json;
      try {
        const key = keys.find((k) => k.slug === d.cuenta)?.api_key;
        if (!key) throw new Error('Sin llave de Effi');
        const offset = Number(cuentas.find((c) => c.slug === d.cuenta)?.tz_offset_min ?? -300);
        const r = await enviarPais(d, { prueba, para }, cred, key, offset, hasta, hoy);
        resultado = { ...(r.enviado ? { ultimo_envio: new Date().toISOString() } : {}), ultimo_error: null, ultimo_resumen: { ...r, hasta, prueba } };
      } catch (e) {
        resultado = { ultimo_error: String(e).slice(0, 500) };
      }
      await tabla(`informe_pendientes_destinos?cuenta=eq.${d.cuenta}`, { method: 'PATCH', body: JSON.stringify(resultado) });
    }
  })();
  // @ts-ignore EdgeRuntime existe en Supabase Edge Functions
  EdgeRuntime.waitUntil(tarea);
  return json(202, { ok: true, hasta, mensaje: 'Envío iniciado' });
});
