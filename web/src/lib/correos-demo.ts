// 🎬 Modo demostración: los correos que salen del Centro de Control, armados igual que en las funciones informe-diario
// (CPA real del día, para la pauta) e informe-pendientes (guías pendientes por despacho, para el hilo de despachos), pero con
// los datos de un día de septiembre y para verlos en pantalla, sin enviar nada. Si cambia el diseño de esos correos, copiarlo aquí.

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
const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export type Cpa = { cuenta: string; dia: { gasto: number; pedidos: number }; semana: { gasto: number; pedidos: number }; mes: { gasto: number; pedidos: number } };
export function htmlCpa(filas: Cpa[], dia: string) {
  const cop = (x: number) => dinero(x, 'COP');
  const cpa = (p: { gasto: number; pedidos: number }) => (p.pedidos ? p.gasto / p.pedidos : null);
  const mesTxt = `${MESES_LARGO[Number(dia.slice(5, 7)) - 1]} (1–${Number(dia.slice(8, 10))})`;
  // Orden fijo del dueño: Colombia, Ecuador, Guatemala, Costa Rica.
  const ORDEN = ['TIENDA_CO', 'TIENDA_EC', 'TIENDA_GT', 'TIENDA_CR'];
  const pos = (c: string) => (ORDEN.indexOf(c) + 1 || 99);
  const tarjetas = [...filas].sort((a, b) => pos(a.cuenta) - pos(b.cuenta)).map((f) => {
    const pa = PAIS[f.cuenta] ?? { nombre: f.cuenta, bandera: '🏳️', moneda: 'COP' };
    const hoy = cpa(f.dia), sem = cpa(f.semana), mes = cpa(f.mes);
    const dif = hoy != null && sem ? (hoy - sem) / sem : null;
    const color = dif == null ? '#8a96b3' : dif > 0.05 ? '#ff5470' : dif < -0.05 ? '#2fd28f' : '#ffb347';
    const flecha = dif == null ? '' : `${dif > 0 ? '▲' : '▼'} ${Math.abs(Math.round(dif * 100))}% vs. últimos 7 días`;
    // Tres filas iguales (ayer, 7 días, mes corrido): CPA · gasto · pedidos. Ayer va más grande y con el color del semáforo.
    const fila = (titulo: string, p: { gasto: number; pedidos: number }, cpaTxt: string, grande: boolean, colorCpa: string, sub = '') => {
      const tam = grande ? '26px' : '18px';
      const celda = (etq: string, valor: string, c: string, s = '') =>
        `<td width="33%" style="padding:4px 12px 12px;vertical-align:top">
           <div style="font-size:11px;color:#8a96b3;text-transform:uppercase;letter-spacing:.06em">${etq}</div>
           <div style="font-size:${tam};font-weight:800;color:${c};margin-top:2px;white-space:nowrap">${valor}</div>${s ? `<div style="font-size:11px;color:${c === '#e8edf7' ? '#8a96b3' : c};margin-top:1px">${s}</div>` : ''}
         </td>`;
      return `
      <tr><td colspan="3" style="padding:12px 12px 4px;border-top:1px solid #1e2740;font-size:12px;font-weight:700;color:#c9d2e6">${titulo}</td></tr>
      <tr>${celda(grande ? 'CPA real' : titulo.startsWith('Mes') ? 'CPA promedio' : 'CPA real', cpaTxt, colorCpa, sub)}${celda('Gasto Meta', cop(p.gasto), '#e8edf7')}${celda('Pedidos Lucid', p.pedidos ? n(p.pedidos) : '—', '#e8edf7')}</tr>`;
    };
    return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0f1526;border:1px solid #1e2740;border-radius:14px;margin:0 0 16px;border-collapse:separate">
      <tr><td colspan="3" style="padding:14px 12px 8px;font-size:17px;font-weight:700;color:#e8edf7">${pa.bandera} ${pa.nombre}</td></tr>
      ${fila(`Ayer · ${fechaTxt(dia)}`, f.dia, hoy == null ? 'Sin pedidos' : cop(hoy), true, color, hoy == null ? 'Falta llenar ayer en 📝 Pedidos Lucid' : flecha)}
      ${fila('Últimos 7 días', f.semana, sem == null ? '—' : cop(sem), false, '#e8edf7')}
      ${fila(`Mes corrido · ${mesTxt}`, f.mes, mes == null ? '—' : cop(mes), false, '#e8edf7')}
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
        Verde: ayer salió más barato que los últimos 7 días · rojo: más caro. En 7 días y en el mes el gasto solo cuenta los días con pedidos cargados. Detalle por día en 📢 Publicidad:
        <a href="https://torre-de-control-inky.vercel.app/publicidad" style="color:#5aa2ff">torre-de-control-inky.vercel.app/publicidad</a>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

// Correo "Guías pendientes por despacho" (informe-pendientes): por país, las guías en Generada y sin relación de despacho
// creadas hasta el corte (dos días atrás sin contar el domingo), contadas por día y proveedor. En el correo real va además un
// Excel por proveedor; aquí se muestra la lista de guías debajo del correo.
export type Pendiente = { dia: string; proveedor: string; transportadora: string; guia: string | null; producto: string; valor: number | null };
const esc = (x: unknown) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const fechaCorta = (dia: string, conSemana = false) => new Intl.DateTimeFormat('es-CO', {
  timeZone: 'UTC', day: 'numeric', month: 'long', ...(conSemana ? { weekday: 'long' } : {}),
}).format(new Date(`${dia}T12:00:00Z`));

// Corte del correo: dos días atrás sin contar el domingo (miércoles → lunes; lunes → viernes).
export function cortePendientes(hoy: string) {
  let dia = hoy;
  for (let k = 2; k > 0;) {
    dia = new Date(Date.parse(`${dia}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    if (new Date(`${dia}T12:00:00Z`).getUTCDay() !== 0) k--;
  }
  return dia;
}

export function htmlPendientes(pais: string, hasta: string, guias: Pendiente[]) {
  const grupos = new Map<string, number>();
  for (const g of guias) grupos.set(`${g.dia}|${g.proveedor}`, (grupos.get(`${g.dia}|${g.proveedor}`) ?? 0) + 1);
  const filas = [...grupos].sort(([a], [b]) => a.localeCompare(b)).map(([k, c]) => {
    const [dia, proveedor] = k.split('|');
    return `<tr><td style="padding:4px 12px 4px 0">Día ${esc(fechaCorta(dia))}</td><td style="padding:4px 12px;text-align:right"><b>${c}</b> ${c === 1 ? 'guía' : 'guías'}</td><td style="padding:4px 0 4px 12px">${esc(proveedor)}</td></tr>`;
  }).join('');
  return `<!doctype html><html><body style="margin:0;background:#fff;padding:20px"><div style="font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a">
<h2 style="font-size:18px;margin:0 0 4px">Guías pendientes por despacho · ${esc(pais)}</h2>
<p style="margin:0 0 16px;color:#555">En estado Generada y sin relación de despacho, creadas hasta el ${esc(fechaCorta(hasta, true))} a las 12 de la noche.</p>
<p style="margin:0 0 8px"><b>Pendientes: ${guias.length} ${guias.length === 1 ? 'guía' : 'guías'}</b></p>
<table style="border-collapse:collapse;font-size:14px">${filas}</table>
<p style="margin:16px 0 0;color:#555">Va un Excel por cada proveedor.</p>
</div></body></html>`;
}
