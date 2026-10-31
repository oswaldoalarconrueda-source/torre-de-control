// informe-diario: arma el resumen del día de cada tienda y lo envía por correo desde el Gmail del dueño.
//
// POST /functions/v1/informe-diario?para=a@x.com,b@y.com&dias_atras=1&prueba=1   (cabecera x-sync-token)
//   para: destinatarios separados por coma (sin para, se envía al mismo Gmail). dias_atras: 0 = hoy hasta ahora,
//   1 = ayer (lo normal para un informe de la mañana). prueba=1 marca el asunto como prueba.
// La cuenta y la contraseña de aplicación de Gmail están cifradas en el Vault (informe_credenciales); se envía por
// SMTP seguro (smtp.gmail.com:465). Las cifras salen de informe_diario y informe_mes (día local de cada país).
// Las gráficas van como fotos dentro del correo (no adjuntos para descargar): las dibuja informe-imagen — lo de ayer y el
// acumulado del mes por país, y el "Resumen diario por estados" de cada país. Si una foto falla, el correo sale igual
// con las gráficas en HTML.
// POST /functions/v1/informe-diario?programado=joalix_diario   (cabecera x-sync-token) ← cron (informe_programado_enviar)
//   Toma destinatarios, sociedad, días atrás y asunto de la tabla informe_programado; el asunto lleva la fecha del día
//   de envío (hora Colombia). Con para=... se manda solo a esos correos (para probar sin escribirle a todos).
// POST /functions/v1/informe-diario?accion=credenciales  body {"user": "...", "pass": "..."}  (cabecera x-sync-token)
//   ← scripts/push-gmail.mjs: guarda la cuenta de Gmail en el Vault (app_guardar_secreto). No devuelve los valores.

import nodemailer from 'npm:nodemailer@6.9.16';
import { Buffer } from 'node:buffer';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type Fila = {
  cuenta: string; sociedad: string | null; dia: string; ordenes: number; remisiones: number; guias: number; entregadas: number;
  devoluciones: number; novedades: number; llegaron_oficina: number; recaudo: number; pagos: number; errores_agente: number;
  en_oficina_ahora: number; novedades_abiertas: number;
};

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
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Igual que web/src/lib/paises.ts: nombre, bandera y moneda de cada tienda.
const PAIS: Record<string, { nombre: string; bandera: string; moneda: string }> = {
  TIENDA_CO: { nombre: 'Colombia', bandera: '🇨🇴', moneda: 'COP' },
  TIENDA_EC: { nombre: 'Ecuador', bandera: '🇪🇨', moneda: 'USD' },
  TIENDA_GT: { nombre: 'Guatemala', bandera: '🇬🇹', moneda: 'GTQ' },
  TIENDA_CR: { nombre: 'Costa Rica', bandera: '🇨🇷', moneda: 'CRC' },
  VALKA_GT: { nombre: 'Valka', bandera: '🇬🇹', moneda: 'GTQ' },
};
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fechaTxt = (iso: string) => `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const n = (x: number) => new Intl.NumberFormat('es-CO').format(x ?? 0);
const dinero = (x: number, moneda: string) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: moneda, maximumFractionDigits: moneda === 'USD' ? 2 : 0 }).format(x ?? 0);
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');
const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const hoyColombia = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
const fechaLarga = (iso: string) => `${Number(iso.slice(8, 10))} de ${MESES_LARGO[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}`;

async function tabla(path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
  const text = await res.text();
  if (!res.ok) throw new Error(`supabase ${path.split('?')[0]} HTTP ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

// Gráficas hechas con tablas y colores (se ven igual en Gmail, Outlook y el celular, sin imágenes que bloquear).
function graficas(filas: Fila[]) {
  if (!filas.length) return '';
  const nombre = (c: string) => `${PAIS[c]?.bandera ?? ''} ${PAIS[c]?.nombre ?? c}`;
  const barra = (pctAncho: number, color: string) =>
    pctAncho > 0 ? `<td style="width:${pctAncho}%;background:${color};height:14px;border-radius:3px"></td>` : '';
  const maxOrd = Math.max(1, ...filas.map((f) => f.ordenes));
  const maxCierre = Math.max(1, ...filas.map((f) => f.entregadas + f.devoluciones));
  const fila = (etq: string, barras: string, valor: string) => `
    <tr>
      <td style="padding:5px 8px 5px 0;font-size:13px;color:#e8edf7;white-space:nowrap;width:120px">${etq}</td>
      <td style="padding:5px 0"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>${barras}<td></td></tr></table></td>
      <td style="padding:5px 0 5px 10px;font-size:12px;color:#8a96b3;white-space:nowrap;text-align:right;width:150px">${valor}</td>
    </tr>`;
  const ordenes = filas.map((f) => fila(nombre(f.cuenta), barra((f.ordenes / maxOrd) * 100, '#ff6ad5'), `${n(f.ordenes)} órdenes`)).join('');
  const cierres = filas.map((f) => fila(nombre(f.cuenta),
    barra((f.entregadas / maxCierre) * 100, '#2fd28f') + barra((f.devoluciones / maxCierre) * 100, '#ff5470'),
    `<span style="color:#2fd28f">${n(f.entregadas)} ✓</span> · <span style="color:#ff5470">${n(f.devoluciones)} ↩</span> · ${pct(f.entregadas, f.entregadas + f.devoluciones)}`)).join('');
  const caja = (titulo: string, cuerpo: string) => `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0f1526;border:1px solid #1e2740;border-radius:14px;margin:0 0 16px;border-collapse:separate">
      <tr><td style="padding:14px 14px 4px;font-size:15px;font-weight:700;color:#e8edf7">${titulo}</td></tr>
      <tr><td style="padding:4px 14px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${cuerpo}</table></td></tr>
    </table>`;
  return caja('📈 Órdenes por país', ordenes) +
    caja('📦 Entregas <span style="color:#2fd28f">■</span> y devoluciones <span style="color:#ff5470">■</span> · % de entrega', cierres);
}

// Correo "URGENTE · CPA REAL DEL DÍA" (informe_programado.tipo = 'cpa'): gasto de Meta del día ÷ pedidos de LucidSales
// del día, por país, con los últimos 7 días y el mes para comparar. Todo en pesos (Meta cobra en COP).
type Cpa = { cuenta: string; dia: { gasto: number; pedidos: number }; semana: { gasto: number; pedidos: number }; mes: { gasto: number; pedidos: number } };
function htmlCpa(filas: Cpa[], dia: string) {
  const cop = (x: number) => dinero(x, 'COP');
  const cpa = (p: { gasto: number; pedidos: number }) => (p.pedidos ? p.gasto / p.pedidos : null);
  const tarjetas = filas.map((f) => {
    const pa = PAIS[f.cuenta] ?? { nombre: f.cuenta, bandera: '🏳️', moneda: 'COP' };
    const hoy = cpa(f.dia), sem = cpa(f.semana), mes = cpa(f.mes);
    const dif = hoy != null && sem ? (hoy - sem) / sem : null;
    const color = dif == null ? '#8a96b3' : dif > 0.05 ? '#ff5470' : dif < -0.05 ? '#2fd28f' : '#ffb347';
    const flecha = dif == null ? '' : `${dif > 0 ? '▲' : '▼'} ${Math.abs(Math.round(dif * 100))}% vs. últimos 7 días`;
    const celda = (etq: string, valor: string, sub = '') =>
      `<td style="padding:10px 12px;border-top:1px solid #1e2740;vertical-align:top">
         <div style="font-size:11px;color:#8a96b3;text-transform:uppercase;letter-spacing:.06em">${etq}</div>
         <div style="font-size:17px;font-weight:700;color:#e8edf7;margin-top:2px">${valor}</div>${sub ? `<div style="font-size:11px;color:#8a96b3">${sub}</div>` : ''}
       </td>`;
    return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0f1526;border:1px solid #1e2740;border-radius:14px;margin:0 0 16px;border-collapse:separate">
      <tr><td colspan="3" style="padding:14px 12px 4px">
        <div style="font-size:17px;font-weight:700;color:#e8edf7">${pa.bandera} ${pa.nombre}</div>
        <div style="font-size:12px;color:#8a96b3;margin-top:6px;text-transform:uppercase;letter-spacing:.06em">CPA real de ayer</div>
        <div style="font-size:30px;font-weight:800;color:${color};margin-top:2px">${hoy == null ? 'Sin pedidos cargados' : cop(hoy)}</div>
        <div style="font-size:12px;color:${color}">${hoy == null ? 'Falta llenar ayer en 📝 Pedidos Lucid' : flecha}</div>
      </td></tr>
      <tr>${celda('Gasto Meta', cop(f.dia.gasto))}${celda('Pedidos Lucid', f.dia.pedidos ? n(f.dia.pedidos) : '—')}${celda('Gasto 7 días', cop(f.semana.gasto), 'días con pedidos')}</tr>
      <tr>${celda('CPA 7 días', sem == null ? '—' : cop(sem), `${n(f.semana.pedidos)} pedidos`)}${celda('CPA del mes', mes == null ? '—' : cop(mes), `${n(f.mes.pedidos)} pedidos`)}${celda('Gasto del mes', cop(f.mes.gasto), 'días con pedidos')}</tr>
    </table>`;
  }).join('');
  return `<!doctype html><html><body style="margin:0;background:#070b16;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px">
    <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%">
      <tr><td style="padding:0 4px 16px">
        <div style="font-size:22px;font-weight:800;color:#ff5470">🚨 URGENTE · CPA real del día</div>
        <div style="font-size:13px;color:#8a96b3;margin-top:4px">Ayer (${fechaTxt(dia)}) · gasto de Meta ÷ pedidos que entraron a LucidSales · en pesos colombianos, sin IVA de Meta</div>
      </td></tr>
      <tr><td>${tarjetas || '<p style="color:#8a96b3">Sin gasto ni pedidos ayer.</p>'}</td></tr>
      <tr><td style="padding:8px 4px;font-size:12px;color:#8a96b3">
        Verde: más barato que los últimos 7 días · rojo: más caro. Detalle por día en 📢 Publicidad:
        <a href="https://torre-de-control-inky.vercel.app/publicidad" style="color:#5aa2ff">torre-de-control-inky.vercel.app/publicidad</a>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

// Recordatorio de las 7 a. m. (informe_programado.tipo = 'cpa_falta'): si todavía faltan los pedidos Lucid de ayer, el
// correo de CPA no ha salido; avisa qué países faltan. Apenas se carguen, el de CPA sale solo.
function htmlCpaFalta(faltan: string[], dia: string) {
  const paises = faltan.map((c) => {
    const pa = PAIS[c] ?? { nombre: c, bandera: '🏳️', moneda: '' };
    return `<div style="font-size:18px;font-weight:700;color:#e8edf7;padding:6px 0">${pa.bandera} ${pa.nombre}</div>`;
  }).join('');
  return `<!doctype html><html><body style="margin:0;background:#070b16;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px">
    <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%">
      <tr><td style="padding:0 4px 16px">
        <div style="font-size:22px;font-weight:800;color:#ffb347">⏰ Faltan los pedidos Lucid de ayer</div>
        <div style="font-size:14px;color:#c9d2e6;margin-top:8px;line-height:1.5">El correo del CPA real de ayer (${fechaTxt(dia)}) no ha salido porque faltan los pedidos de:</div>
      </td></tr>
      <tr><td style="background:#0f1526;border:1px solid #1e2740;border-radius:14px;padding:12px 16px">${paises}</td></tr>
      <tr><td style="padding:16px 4px;font-size:14px;color:#c9d2e6;line-height:1.5">
        Llénalos en 📝 Pedidos Lucid y el correo del CPA sale solo apenas se guarden:<br>
        <a href="https://torre-de-control-inky.vercel.app/pedidos-lucid" style="color:#5aa2ff;font-weight:700">torre-de-control-inky.vercel.app/pedidos-lucid</a>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

// Pide una foto a informe-imagen; null si falla (el correo sale igual).
async function foto(token: string, body: unknown) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/informe-imagen`, {
      method: 'POST', headers: { 'x-sync-token': token, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('image')) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch { return null; }
}
const img = (cid: string, alt: string) =>
  `<img src="cid:${cid}" alt="${alt}" width="640" style="display:block;width:100%;max-width:640px;height:auto;border-radius:14px;margin:0 0 16px">`;

function html(filas: Fila[], diasAtras: number, encabezado = 'Torre de Control · Informe diario', fotos: { resumen: boolean; estados: string[] } | null = null) {
  const titulo = diasAtras === 0 ? 'Hoy hasta ahora' : diasAtras === 1 ? 'Ayer' : `Hace ${diasAtras} días`;
  const celda = (etq: string, valor: string, color = '#e8edf7', sub = '') =>
    `<td style="padding:10px 12px;border-top:1px solid #1e2740;vertical-align:top">
       <div style="font-size:11px;color:#8a96b3;text-transform:uppercase;letter-spacing:.06em">${etq}</div>
       <div style="font-size:20px;font-weight:700;color:${color};margin-top:2px">${valor}</div>${sub ? `<div style="font-size:11px;color:#8a96b3">${sub}</div>` : ''}
     </td>`;
  // Con fotos, debajo de ellas solo va lo abierto al momento del envío; sin fotos, el informe completo en HTML.
  const ahora = filas.map((f) => {
    const p = PAIS[f.cuenta] ?? { nombre: f.cuenta, bandera: '🏳️', moneda: 'USD' };
    return `<tr>${celda(`${p.bandera} ${p.nombre}`, dinero(f.recaudo, p.moneda), '#2fd28f', `recaudo de ayer · ${n(f.pagos)} pagos`)}${celda('En oficina', n(f.en_oficina_ahora), '#5aa2ff')}${celda('Novedades', n(f.novedades_abiertas), '#ffb347', 'por solucionar')}${celda('Errores agente', n(f.errores_agente), f.errores_agente ? '#ff5470' : '#2fd28f', f.errores_agente ? 'verificación humana' : 'sin errores')}</tr>`;
  }).join('');
  const cuerpoFotos = fotos ? `${fotos.resumen ? img('resumen', 'Resumen de ayer y acumulado del mes') : ''}${fotos.estados.map((c) => img(`estados-${c}`, `Resumen diario por estados · ${PAIS[c]?.nombre ?? c}`)).join('')}
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0f1526;border:1px solid #1e2740;border-radius:14px;margin:0 0 16px;border-collapse:separate">
      <tr><td colspan="4" style="padding:14px 12px 6px;font-size:15px;font-weight:700;color:#e8edf7">Al momento del envío</td></tr>${ahora}
    </table>` : null;
  const bloques = filas.map((f) => {
    const p = PAIS[f.cuenta] ?? { nombre: f.cuenta, bandera: '🏳️', moneda: 'USD' };
    const cierres = f.entregadas + f.devoluciones;
    return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0f1526;border:1px solid #1e2740;border-radius:14px;margin:0 0 16px;border-collapse:separate">
      <tr><td colspan="4" style="padding:14px 12px 6px;font-size:17px;font-weight:700;color:#e8edf7">${p.bandera} ${p.nombre}
        <span style="font-size:12px;font-weight:400;color:#8a96b3"> · ${fechaTxt(f.dia)}</span></td></tr>
      <tr>${celda('Órdenes', n(f.ordenes), '#ff6ad5')}${celda('Remisiones', n(f.remisiones), '#b48cff')}${celda('Guías generadas', n(f.guias), '#c9d3ea')}${celda('Recaudo', dinero(f.recaudo, p.moneda), '#2fd28f', `${n(f.pagos)} pagos`)}</tr>
      <tr>${celda('Entregadas', n(f.entregadas), '#2fd28f', cierres ? `${pct(f.entregadas, cierres)} de lo que cerró` : '')}${celda('Devoluciones', n(f.devoluciones), '#ff5470')}${celda('Novedades nuevas', n(f.novedades), '#ffb347')}${celda('Llegaron a oficina', n(f.llegaron_oficina), '#5aa2ff')}</tr>
      <tr>${celda('En oficina ahora', n(f.en_oficina_ahora), '#5aa2ff')}${celda('Novedades por solucionar', n(f.novedades_abiertas), '#ffb347')}${celda('Errores del agente', n(f.errores_agente), f.errores_agente ? '#ff5470' : '#2fd28f', f.errores_agente ? 'requieren verificación humana' : 'sin errores')}<td style="border-top:1px solid #1e2740"></td></tr>
    </table>`;
  }).join('');
  return `<!doctype html><html><body style="margin:0;background:#070b16;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px">
    <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%">
      <tr><td style="padding:0 4px 16px">
        <div style="font-size:22px;font-weight:800;color:#e8edf7">⚡ ${encabezado}</div>
        <div style="font-size:13px;color:#8a96b3;margin-top:4px">${titulo}${filas[0]?.dia ? ` (${fechaTxt(filas[0].dia)})` : ''} · cada país en su hora local · "ahora" = al momento del envío</div>
      </td></tr>
      <tr><td>${cuerpoFotos ?? `${graficas(filas)}${bloques || '<p style="color:#8a96b3">Sin tiendas con movimiento.</p>'}`}</td></tr>
      <tr><td style="padding:8px 4px;font-size:12px;color:#8a96b3">
        Detalle en vivo: <a href="https://torre-de-control-inky.vercel.app" style="color:#5aa2ff">torre-de-control-inky.vercel.app</a>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

// Alerta de webhooks (informe_programado.tipo = 'alerta_webhooks'): sale cuando los avisos de Effi dejan de llegar
// (effi_webhooks_vigilar) y otra vez cuando vuelven. Mientras tanto la API cubre cada minuto.
type Salud = { cuenta: string; ultimo_aviso: string | null; avisos_30: number; cambios_api_30: number; caido: boolean };
type Incidente = { id: number; cuentas: string[]; desde: string; resuelto_en: string | null };
const horaCo = (iso: string | null) => iso
  ? new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
  : '—';
function htmlAlertaWebhooks(inc: Incidente | null, salud: Salud[]) {
  const volvieron = !!inc?.resuelto_en;
  const filas = salud.map((x) => {
    const pa = PAIS[x.cuenta] ?? { nombre: x.cuenta, bandera: '🏳️', moneda: '' };
    const color = x.caido ? '#ff5470' : '#2fd28f';
    return `<tr>
      <td style="padding:10px 12px;border-top:1px solid #1e2740;color:#e8edf7;font-weight:700">${pa.bandera} ${pa.nombre}</td>
      <td style="padding:10px 12px;border-top:1px solid #1e2740;color:${color};font-weight:700">${x.caido ? 'Sin avisos' : 'Llegando'}</td>
      <td style="padding:10px 12px;border-top:1px solid #1e2740;color:#8a96b3">${n(x.avisos_30)} avisos · ${n(x.cambios_api_30)} cambios vistos por la API</td>
      <td style="padding:10px 12px;border-top:1px solid #1e2740;color:#8a96b3">último aviso ${horaCo(x.ultimo_aviso)}</td>
    </tr>`;
  }).join('');
  const titulo = volvieron ? '✅ Los webhooks de Effi volvieron a llegar' : '🚨 Los webhooks de Effi dejaron de llegar';
  const texto = volvieron
    ? `Estuvieron caídos desde ${horaCo(inc!.desde)} hasta ${horaCo(inc!.resuelto_en)} (hora Colombia). La Torre vuelve a actualizarse al instante con los avisos.`
    : `Desde ${horaCo(inc?.desde ?? null)} (hora Colombia) Effi no manda avisos de ${(inc?.cuentas ?? []).map((c) => PAIS[c]?.nombre ?? c).join(', ')}, aunque la API sí ve movimiento. La Torre no se detiene: la API la está actualizando cada minuto. Conviene avisarle a Effi.`;
  return `<!doctype html><html><body style="margin:0;background:#070b16;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px">
    <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%">
      <tr><td style="padding:0 4px 16px">
        <div style="font-size:22px;font-weight:800;color:${volvieron ? '#2fd28f' : '#ff5470'}">${titulo}</div>
        <div style="font-size:14px;color:#c9d2e6;margin-top:8px;line-height:1.5">${texto}</div>
      </td></tr>
      <tr><td><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0f1526;border:1px solid #1e2740;border-radius:14px;border-collapse:separate;font-size:13px">
        <tr><td colspan="4" style="padding:12px;font-size:11px;color:#8a96b3;text-transform:uppercase;letter-spacing:.06em">Últimos 30 minutos por tienda</td></tr>
        ${filas}
      </table></td></tr>
    </table>
  </td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, mensaje: 'Solo POST' });
  const token = req.headers.get('x-sync-token') || '';
  if (!token || !(await rpc('effi_check_sync_token', { p_token: token }))) return json(401, { ok: false, mensaje: 'Token inválido' });
  const url = new URL(req.url);
  if (url.searchParams.get('accion') === 'credenciales') {
    const body = await req.json().catch(() => ({})) as { user?: string; pass?: string };
    const user = (body.user ?? '').trim(), pass = (body.pass ?? '').replace(/\s+/g, '');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(user) || pass.length !== 16) return json(400, { ok: false, mensaje: 'Correo o contraseña de aplicación inválidos' });
    await rpc('app_guardar_secreto', { p_nombre: 'gmail_user', p_valor: user });
    await rpc('app_guardar_secreto', { p_nombre: 'gmail_app_password', p_valor: pass });
    return json(200, { ok: true, guardados: ['gmail_user', 'gmail_app_password'] });
  }
  const prueba = url.searchParams.get('prueba') === '1';
  try {
    // Programado: destinatarios, sociedad, días y asunto salen de informe_programado.
    const id = url.searchParams.get('programado');
    const prog = id ? ((await tabla(`informe_programado?id=eq.${encodeURIComponent(id)}&activo=eq.true&select=*`)) as {
      destinatarios: string[]; sociedad: string | null; dias_atras: number; asunto: string; tipo: string;
    }[])[0] : null;
    if (id && !prog) return json(404, { ok: false, mensaje: `No hay informe programado activo "${id}"` });
    const diasAtras = Math.max(0, Math.min(7, Number(url.searchParams.get('dias_atras') ?? prog?.dias_atras ?? 1)));
    const cred = await rpc('informe_credenciales', {}) as { user: string | null; pass: string | null };
    if (!cred?.user || !cred?.pass) return json(400, { ok: false, mensaje: 'Falta la cuenta de Gmail en el Vault (scripts/push-gmail.mjs)' });
    const para = (url.searchParams.get('para') || prog?.destinatarios.join(',') || cred.user).split(',')
      .map((x) => x.trim().toLowerCase()).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
    if (!para.length) return json(400, { ok: false, mensaje: 'Destinatarios inválidos' });
    if ((prog?.tipo ?? url.searchParams.get('tipo')) === 'alerta_webhooks') {
      const a = (await rpc('effi_webhooks_alerta', {})) as { incidente: Incidente | null; salud: Salud[] };
      const volvieron = !!a.incidente?.resuelto_en;
      const asunto = `${prueba ? '[Prueba] ' : ''}${volvieron ? '✅ Volvieron los webhooks de Effi' : '🚨 URGENTE · Los webhooks de Effi dejaron de llegar'}`;
      const transporte = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: cred.user, pass: cred.pass } });
      const info = await transporte.sendMail({ from: `Torre de Control <${cred.user}>`, to: para.join(', '), subject: asunto,
        priority: volvieron ? 'normal' : 'high', html: htmlAlertaWebhooks(a.incidente, a.salud ?? []) });
      return json(200, { ok: true, enviados: para.length, asunto, id: info.messageId });
    }
    if ((prog?.tipo ?? url.searchParams.get('tipo')) === 'cpa') {
      const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date(Date.now() - Math.max(1, diasAtras) * 86_400_000));
      const filas = (await rpc('informe_cpa', { p_dia: dia, p_sociedad: prog?.sociedad ?? 'Joalix AA Group' })) as Cpa[];
      const asunto = `${prueba ? '[Prueba] ' : ''}${prog?.asunto ?? 'URGENTE · CPA REAL DEL DÍA'} · ${fechaLarga(dia)}`;
      const transporte = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: cred.user, pass: cred.pass } });
      // priority 'high' = X-Priority 1 e Importance: High (Gmail y Outlook lo marcan como importante).
      const info = await transporte.sendMail({ from: `CPA real Joalix <${cred.user}>`, to: para.join(', '), subject: asunto, priority: 'high', html: htmlCpa(filas, dia) });
      return json(200, { ok: true, enviados: para.length, asunto, id: info.messageId, paises: filas.length });
    }
    if ((prog?.tipo ?? url.searchParams.get('tipo')) === 'cpa_falta') {
      const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date(Date.now() - 86_400_000));
      let faltan = (await rpc('informe_cpa_faltan', { p_dia: dia, p_sociedad: prog?.sociedad ?? 'Joalix AA Group' })) as string[];
      // En prueba, si no falta nada, se ve con un ejemplo para revisar cómo llega.
      if (prueba && !faltan?.length) faltan = ['TIENDA_CO', 'TIENDA_EC', 'TIENDA_GT'];
      if (!faltan?.length) return json(200, { ok: true, enviados: 0, mensaje: 'Ya están todos los pedidos de ayer' });
      const asunto = `${prueba ? '[Prueba] ' : ''}${prog?.asunto ?? '⏰ Faltan los pedidos Lucid de ayer'} · ${faltan.map((c) => PAIS[c]?.nombre ?? c).join(', ')}`;
      const transporte = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: cred.user, pass: cred.pass } });
      const info = await transporte.sendMail({ from: `CPA real Joalix <${cred.user}>`, to: para.join(', '), subject: asunto, priority: 'high', html: htmlCpaFalta(faltan, dia) });
      return json(200, { ok: true, enviados: para.length, asunto, id: info.messageId, faltan });
    }
    const todas = (await rpc('informe_diario', { p_dias_atras: diasAtras })) as Fila[];
    const filas = prog?.sociedad ? todas.filter((f) => f.sociedad === prog.sociedad) : todas;
    const dia = filas[0]?.dia ?? '';
    const asunto = prog
      ? `${prueba ? '[Prueba] ' : ''}${prog.asunto} · ${fechaLarga(hoyColombia())}`
      : `${prueba ? '[Prueba] ' : ''}Torre de Control · ${diasAtras === 0 ? 'Hoy' : diasAtras === 1 ? 'Ayer' : 'Informe'} ${dia ? fechaTxt(dia) : ''}`.trim();
    // Fotos (en paralelo): resumen y el cuadro de estados de cada país. Las que fallen se omiten.
    const mes = ((await rpc('informe_mes', { p_dias_atras: diasAtras })) as { cuenta: string; sociedad: string | null }[])
      .filter((m) => filas.some((f) => f.cuenta === m.cuenta));
    const conFotos = url.searchParams.get('fotos') !== '0' && diasAtras > 0;
    const [fResumen, ...fEstados] = conFotos
      ? await Promise.all([foto(token, { tipo: 'resumen', dia, filas, mes }), ...mes.map((m) => foto(token, { tipo: 'estados', mes: m }))])
      : [null];
    const adjuntos = [
      ...(fResumen ? [{ filename: 'resumen.png', content: fResumen, cid: 'resumen' }] : []),
      ...mes.flatMap((m, i) => (fEstados[i] ? [{ filename: `estados-${m.cuenta}.png`, content: fEstados[i]!, cid: `estados-${m.cuenta}` }] : [])),
    ];
    const fotos = adjuntos.length ? { resumen: !!fResumen, estados: mes.filter((_, i) => fEstados[i]).map((m) => m.cuenta) } : null;
    const transporte = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: cred.user, pass: cred.pass } });
    const info = await transporte.sendMail({
      from: `${prog ? prog.asunto.replace(/^INFORME\s+/i, '') : 'Torre de Control'} <${cred.user}>`, to: para.join(', '), subject: asunto,
      html: html(filas, diasAtras, prog ? prog.asunto : undefined, fotos), attachments: adjuntos,
    });
    return json(200, { ok: true, enviados: para.length, asunto, id: info.messageId, paises: filas.length, fotos: adjuntos.length });
  } catch (e) {
    return json(500, { ok: false, mensaje: String((e as Error).message ?? e).slice(0, 300) });
  }
});
