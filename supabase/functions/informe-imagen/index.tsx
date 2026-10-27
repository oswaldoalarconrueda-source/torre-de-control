// informe-imagen: dibuja como foto (PNG) las partes visuales del informe diario, para pegarlas dentro del correo.
//
// POST /functions/v1/informe-imagen   (cabecera x-sync-token)   ← informe-diario
//   body {"tipo": "resumen", "dia": "2026-10-25", "filas": [...informe_diario], "mes": [...informe_mes]}
//     → órdenes, remisiones y guías de ayer por país; acumulado del mes y la barra de cómo van las entregas.
//   body {"tipo": "estados", "mes": {...una fila de informe_mes}}
//     → el "Resumen diario por estados" de Datos (estados × días del mes, total y % devolución), en bloques de hasta
//       13 días para que quepa a lo ancho del correo.
// No consulta la base: dibuja lo que le manda informe-diario. Cada imagen es una llamada aparte (límite de CPU).
// Con ?ver=1 la guarda en el bucket privado "informes" y devuelve un enlace firmado de 10 minutos (para revisarla).

import React from 'https://esm.sh/react@18.2.0';
import { ImageResponse } from 'https://deno.land/x/og_edge@0.0.6/mod.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const C = { bg: '#04060a', panel: '#0d1220', line: '#1c2438', text: '#eef2f8', muted: '#8a94a8', green: '#2fd28f', red: '#ff5a6a', amber: '#ffb547', blue: '#2f7bff', pink: '#ff6ad5', violet: '#b48cff', gris: '#c9d3ea' };
const PAIS: Record<string, { nombre: string; bandera: string; verde: number; naranja: number }> = {
  TIENDA_CO: { nombre: 'Colombia', bandera: '🇨🇴', verde: 0.25, naranja: 0.32 },
  TIENDA_EC: { nombre: 'Ecuador', bandera: '🇪🇨', verde: 0.25, naranja: 0.35 },
  TIENDA_GT: { nombre: 'Guatemala', bandera: '🇬🇹', verde: 0.22, naranja: 0.3 },
  TIENDA_CR: { nombre: 'Costa Rica', bandera: '🇨🇷', verde: 0.25, naranja: 0.35 },
  VALKA_GT: { nombre: 'Valka', bandera: '🇬🇹', verde: 0.22, naranja: 0.3 },
};
// Mismo orden y colores del "Resumen diario por estados" de Datos.
const ESTADOS = [
  { id: 'ENTREGADO', label: 'ENTREGADO', rgb: '47,210,143' },
  { id: 'DEVOLUCION', label: 'DEVOLUCIÓN', rgb: '255,90,106' },
  { id: 'EN_TRANSITO', label: 'EN TRÁNSITO', rgb: '47,123,255' },
  { id: 'EN_OFICINA', label: 'DISPONIBLE EN OFICINA', rgb: '180,140,255' },
  { id: 'NOVEDAD', label: 'NOVEDAD', rgb: '255,181,71' },
  { id: 'PENDIENTE', label: 'PENDIENTE', rgb: '138,148,168' },
  { id: 'INDEMNIZACION', label: 'INDEMNIZACIÓN', rgb: '255,140,66' },
  { id: 'CANCELADA', label: 'CANCELADA', rgb: '110,118,135' },
];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
const corto = (iso: string) => `${Number(iso.slice(8, 10))}-${MESES[Number(iso.slice(5, 7)) - 1]}`;
const n = (x: number) => new Intl.NumberFormat('es-CO').format(x ?? 0);
const pct = (v: number | null, dec = 0) => (v == null ? '—' : `${(v * 100).toFixed(dec).replace('.', ',')}%`);
const ANCHO = 1200;

type Mes = { cuenta: string; desde: string; hasta: string; ordenes: number; remisiones: number; estados: Record<string, number>; por_dia: { f: string; e: string; n: number }[] };
type Dia = { cuenta: string; ordenes: number; remisiones: number; guias: number };

let fuentes: { name: string; data: ArrayBuffer; weight: 400 | 700; style: 'normal' }[] | null = null;
async function cargarFuentes() {
  if (fuentes) return fuentes;
  const f = (w: number) => fetch(`https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.8/files/inter-latin-${w}-normal.woff`).then((r) => r.arrayBuffer());
  const [a, b] = await Promise.all([f(400), f(700)]);
  fuentes = [{ name: 'Inter', data: a, weight: 400, style: 'normal' }, { name: 'Inter', data: b, weight: 700, style: 'normal' }];
  return fuentes;
}

const caja = (extra: React.CSSProperties = {}): React.CSSProperties => ({ display: 'flex', background: C.panel, border: `1px solid ${C.line}`, borderRadius: 18, ...extra });

function Resumen({ dia, filas, mes }: { dia: string; filas: Dia[]; mes: Mes[] }) {
  const cifra = (titulo: string, valor: number, color: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
      <div style={{ fontSize: 15, color: C.muted, letterSpacing: 1 }}>{titulo}</div>
      <div style={{ fontSize: 44, fontWeight: 700, color }}>{n(valor)}</div>
    </div>
  );
  const desde = mes[0]?.desde ?? dia;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: C.bg, padding: 28, fontFamily: 'Inter', color: C.text }}>
      <div style={{ display: 'flex', fontSize: 22, fontWeight: 700, color: C.muted, letterSpacing: 2 }}>{`AYER · ${corto(dia).toUpperCase()}`}</div>
      <div style={{ display: 'flex', gap: 16, marginTop: 14 }}>
        {filas.map((f) => (
          <div key={f.cuenta} style={caja({ flexDirection: 'column', flex: 1, padding: '18px 16px' })}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 26, fontWeight: 700 }}>
              <span>{PAIS[f.cuenta]?.bandera}</span><span>{PAIS[f.cuenta]?.nombre ?? f.cuenta}</span>
            </div>
            <div style={{ display: 'flex', marginTop: 14 }}>
              {cifra('ÓRDENES', f.ordenes, C.pink)}{cifra('REMISIONES', f.remisiones, C.violet)}{cifra('GUÍAS', f.guias, C.gris)}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', fontSize: 22, fontWeight: 700, color: C.muted, letterSpacing: 2, marginTop: 30 }}>
        {`ACUMULADO DEL MES · ${corto(desde).toUpperCase()} AL ${corto(dia).toUpperCase()}`}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
        {mes.map((m) => {
          const guias = Object.values(m.estados).reduce((a, x) => a + Number(x), 0);
          const ent = Number(m.estados.ENTREGADO ?? 0), dev = Number(m.estados.DEVOLUCION ?? 0);
          const camino = Math.max(0, guias - ent - dev);
          const w = (x: number) => (guias ? `${(x / guias) * 100}%` : '0%');
          return (
            <div key={m.cuenta} style={caja({ flexDirection: 'column', padding: '16px 20px' })}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 24, fontWeight: 700 }}>
                  <span>{PAIS[m.cuenta]?.bandera}</span><span>{PAIS[m.cuenta]?.nombre ?? m.cuenta}</span>
                </div>
                <div style={{ display: 'flex', gap: 26, fontSize: 18, color: C.muted }}>
                  <span style={{ display: 'flex' }}>Ventas<b style={{ marginLeft: 8, color: C.pink }}>{n(m.ordenes)}</b></span>
                  <span style={{ display: 'flex' }}>Guías hechas<b style={{ marginLeft: 8, color: C.text }}>{n(guias)}</b></span>
                  <span style={{ display: 'flex' }}>Entregadas<b style={{ marginLeft: 8, color: C.green }}>{pct(guias ? ent / guias : null)}</b></span>
                </div>
              </div>
              <div style={{ display: 'flex', height: 26, marginTop: 12, borderRadius: 13, overflow: 'hidden', background: '#1a2133' }}>
                <div style={{ display: 'flex', width: w(ent), background: C.green }} />
                <div style={{ display: 'flex', width: w(dev), background: C.red }} />
                <div style={{ display: 'flex', width: w(camino), background: C.blue, opacity: 0.75 }} />
              </div>
              <div style={{ display: 'flex', gap: 22, marginTop: 8, fontSize: 15, color: C.muted }}>
                <span style={{ display: 'flex', color: C.green }}>{`■ ${n(ent)} entregadas`}</span>
                <span style={{ display: 'flex', color: C.red }}>{`■ ${n(dev)} devoluciones`}</span>
                <span style={{ display: 'flex', color: C.blue }}>{`■ ${n(camino)} en camino, oficina o novedad`}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const fechasDel = (desde: string, hasta: string) => {
  const out: string[] = [];
  for (let d = new Date(`${desde}T12:00:00Z`); d.toISOString().slice(0, 10) <= hasta; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
};
export const BLOQUE = 13;

function Estados({ m }: { m: Mes }) {
  const p = PAIS[m.cuenta] ?? { nombre: m.cuenta, bandera: '', verde: 0.25, naranja: 0.35 };
  const fechas = fechasDel(m.desde, m.hasta);
  const val = new Map<string, number>();
  for (const x of m.por_dia) val.set(`${x.f}|${x.e}`, Number(x.n));
  const v = (f: string, e: string) => val.get(`${f}|${e}`) ?? 0;
  const filas = ESTADOS.filter((e) => fechas.some((f) => v(f, e.id)));
  const maxFila = Object.fromEntries(filas.map((e) => [e.id, Math.max(1, ...fechas.map((f) => v(f, e.id)))]));
  const totalDia = (f: string) => ESTADOS.reduce((a, e) => a + v(f, e.id), 0);
  const devDia = (tot: number, ent: number, ind: number) => (tot - ind ? (tot - ind - ent) / (tot - ind) : null);
  const semaforo = (x: number | null) => (x == null ? C.muted : x <= p.verde ? C.green : x <= p.naranja ? C.amber : C.red);
  const totalMes = (e: string) => fechas.reduce((a, f) => a + v(f, e), 0);
  const granTotal = fechas.reduce((a, f) => a + totalDia(f), 0);
  const bloques: string[][] = [];
  for (let i = 0; i < fechas.length; i += BLOQUE) bloques.push(fechas.slice(i, i + BLOQUE));
  const ETQ = 230, TOT = 110, col = (ANCHO - 56 - ETQ - TOT) / BLOQUE;
  const celda = (contenido: string, extra: React.CSSProperties = {}) => (
    <div style={{ display: 'flex', width: col, height: 38, alignItems: 'center', justifyContent: 'center', fontSize: 17, ...extra }}>{contenido}</div>
  );
  const etiqueta = (txt: string, color: string) => (
    <div style={{ display: 'flex', width: ETQ, height: 38, alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: C.text }}>
      <div style={{ display: 'flex', width: 10, height: 10, borderRadius: 5, background: color }} />{txt}
    </div>
  );
  const total = (txt: string, extra: React.CSSProperties = {}) => (
    <div style={{ display: 'flex', width: TOT, height: 38, alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 700, borderLeft: `1px solid ${C.line}`, ...extra }}>{txt}</div>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: C.bg, padding: 28, fontFamily: 'Inter', color: C.text }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 26, fontWeight: 700 }}>
        <span>{p.bandera}</span><span>{`${p.nombre} · Resumen diario por estados`}</span>
        <span style={{ fontSize: 18, fontWeight: 400, color: C.muted }}>{`${corto(m.desde)} al ${corto(m.hasta)} · guías por día de creación y su estado de hoy`}</span>
      </div>
      {bloques.map((b, bi) => {
        const ultimo = bi === bloques.length - 1;
        return (
          <div key={bi} style={caja({ flexDirection: 'column', padding: '10px 14px', marginTop: 16 })}>
            <div style={{ display: 'flex', borderBottom: `1px solid ${C.line}` }}>
              <div style={{ display: 'flex', width: ETQ, height: 46, alignItems: 'center', fontSize: 14, color: C.muted }}>Estado</div>
              {b.map((f) => (
                <div key={f} style={{ display: 'flex', flexDirection: 'column', width: col, height: 46, alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{corto(f)}</span>
                  <span style={{ fontSize: 11, color: [0, 6].includes(new Date(`${f}T12:00:00Z`).getUTCDay()) ? C.blue : C.muted }}>{DIAS[new Date(`${f}T12:00:00Z`).getUTCDay()]}</span>
                </div>
              ))}
              {ultimo ? total('Total mes', { fontSize: 14, color: C.muted, fontWeight: 400 }) : null}
            </div>
            {filas.map((e) => (
              <div key={e.id} style={{ display: 'flex' }}>
                {etiqueta(e.label, `rgb(${e.rgb})`)}
                {b.map((f) => {
                  const x = v(f, e.id);
                  return <div key={f} style={{ display: 'flex' }}>{celda(x ? n(x) : '—', { background: x ? `rgba(${e.rgb},${0.12 + 0.5 * (x / maxFila[e.id])})` : 'transparent', color: x ? C.text : '#3a4358' })}</div>;
                })}
                {ultimo ? total(n(totalMes(e.id)), { background: `rgba(${e.rgb},0.14)` }) : null}
              </div>
            ))}
            <div style={{ display: 'flex', borderTop: `1px solid ${C.line}` }}>
              {etiqueta('TOTAL GENERAL', C.text)}
              {b.map((f) => <div key={f} style={{ display: 'flex' }}>{celda(n(totalDia(f)), { fontWeight: 700 })}</div>)}
              {ultimo ? total(n(granTotal)) : null}
            </div>
            <div style={{ display: 'flex' }}>
              {etiqueta('% DEVOLUCIÓN', C.red)}
              {b.map((f) => {
                const x = devDia(totalDia(f), v(f, 'ENTREGADO'), v(f, 'INDEMNIZACION') + v(f, 'CANCELADA'));
                return <div key={f} style={{ display: 'flex' }}>{celda(pct(x, 1), { fontSize: 14, color: semaforo(x), fontWeight: 700 })}</div>;
              })}
              {ultimo ? (() => {
                const x = devDia(granTotal, totalMes('ENTREGADO'), totalMes('INDEMNIZACION') + totalMes('CANCELADA'));
                return total(pct(x, 1), { color: semaforo(x), fontSize: 15 });
              })() : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

async function rpc(fn: string, body: unknown) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return res.ok ? res.json() : null;
}

// Guarda la imagen en el bucket privado y devuelve un enlace firmado que vence en 10 minutos.
async function verEnlace(img: Response) {
  const ruta = `pruebas/${crypto.randomUUID()}.png`, h = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
  const sub = await fetch(`${SUPABASE_URL}/storage/v1/object/informes/${ruta}`, { method: 'POST', headers: { ...h, 'Content-Type': 'image/png' }, body: await img.arrayBuffer() });
  if (!sub.ok) return new Response(await sub.text(), { status: 500 });
  const fir = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/informes/${ruta}`, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 600 }) });
  const j = await fir.json();
  return new Response(JSON.stringify({ url: `${SUPABASE_URL}/storage/v1${j.signedURL}` }), { headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Solo POST', { status: 405 });
  const ver = new URL(req.url).searchParams.get('ver') === '1';
  const token = req.headers.get('x-sync-token') || '';
  if (!token || !(await rpc('effi_check_sync_token', { p_token: token }))) return new Response('Token inválido', { status: 401 });
  const body = await req.json().catch(() => ({}));
  const fonts = await cargarFuentes();
  if (body.tipo === 'resumen') {
    const filas = (body.filas ?? []) as Dia[], mes = (body.mes ?? []) as Mes[];
    const alto = 56 + 40 + 190 + 70 + mes.length * 150;
    const img = new ImageResponse(<Resumen dia={body.dia} filas={filas} mes={mes} />, { width: ANCHO, height: alto, fonts, emoji: 'twemoji' });
    return ver ? verEnlace(img) : img;
  }
  if (body.tipo === 'estados') {
    const m = body.mes as Mes;
    const dias = fechasDel(m.desde, m.hasta).length, filas = ESTADOS.filter((e) => m.por_dia.some((x) => x.e === e.id)).length;
    const alto = 56 + 40 + Math.ceil(dias / BLOQUE) * (16 + 20 + 46 + (filas + 2) * 38 + 4);
    const img = new ImageResponse(<Estados m={m} />, { width: ANCHO, height: alto, fonts, emoji: 'twemoji' });
    return ver ? verEnlace(img) : img;
  }
  return new Response('tipo=resumen|estados', { status: 400 });
});
