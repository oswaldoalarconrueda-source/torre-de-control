// drop-sync: trae de Drop (soydrop, A un clic Honduras y El Salvador) por su MCP oficial (api.soydrop.com/mcp) las órdenes con
// su estado, valor contra entrega y abono a la billetera, y las guarda como el archivo de Drop: órdenes en dropi_ordenes
// (tienda='drop') y abonos en dropi_cartera como «ENTRADA POR GANANCIA» (id negativo = −número de orden; si después llega el
// archivo de billetera con ese abono, el del archivo lo reemplaza). Luego cruza producto y costo (drop_conciliar_sistema).
// Descuentos por no entrega y retiros no vienen por el MCP: siguen por archivo. Productos y guía: icomfly.
//
// POST /functions/v1/drop-sync   (cabecera x-sync-token) ← cron drop-sync (cada hora)
//   ?cuenta=AUNCLIC_SV   solo esa tienda
//   ?desde=2026-08-01&hasta=2026-11-18   por defecto desde el 1-ago-2026 (inicio de la sociedad) hasta hoy

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MCP = 'https://api.soydrop.com/mcp';
const AUTH = 'https://api.soydrop.com';
const CUENTAS = ['AUNCLIC_HN', 'AUNCLIC_SV'];
const ZONA: Record<string, string> = { AUNCLIC_HN: 'America/Tegucigalpa', AUNCLIC_SV: 'America/El_Salvador' };

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
type O = Record<string, any>;

async function acceso(cuenta: string) {
  const p = (await rpc('drop_oauth', { p_cuenta: cuenta })) as O | null;
  if (!p?.refresh_token) return null;
  const r = await fetch(`${AUTH}/oauth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: p.refresh_token, client_id: p.client_id, resource: MCP }),
  });
  const t = await r.json().catch(() => ({}));
  if (!r.ok || !t.access_token) throw new Error(`Drop no renovó el permiso (HTTP ${r.status} ${t.error ?? ''}): hay que autorizar de nuevo`);
  if (t.refresh_token && t.refresh_token !== p.refresh_token) {
    await rpc('drop_oauth_actualizar', { p_cuenta: cuenta, p_oauth: { ...p, refresh_token: t.refresh_token, renovado: new Date().toISOString() } });
  }
  return t.access_token as string;
}

class Mcp {
  sid: string | null = null; n = 0;
  constructor(private tok: string) {}
  async enviar(method: string, params?: unknown, notificacion = false) {
    const h: Record<string, string> = { Authorization: `Bearer ${this.tok}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-06-18' };
    if (this.sid) h['Mcp-Session-Id'] = this.sid;
    const body = notificacion ? { jsonrpc: '2.0', method, params } : { jsonrpc: '2.0', id: ++this.n, method, params };
    const r = await fetch(MCP, { method: 'POST', headers: h, body: JSON.stringify(body) });
    this.sid = r.headers.get('mcp-session-id') || this.sid;
    const t = await r.text();
    if (!r.ok) throw new Error(`MCP ${method} HTTP ${r.status}: ${t.slice(0, 200)}`);
    if (notificacion) return null;
    const linea = t.includes('data:') ? t.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5)).pop()! : t;
    const m = JSON.parse(linea);
    if (m.error) throw new Error(`MCP ${method}: ${m.error.message}`);
    return m.result;
  }
  async iniciar() {
    await this.enviar('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'centro-de-control', version: '1' } });
    await this.enviar('notifications/initialized', {}, true);
  }
  async llamar(nombre: string, args: O) {
    const r = await this.enviar('tools/call', { name: nombre, arguments: args });
    const texto = String(r?.content?.[0]?.text ?? '');
    if (r?.isError) throw new Error(`${nombre}: ${texto.slice(0, 200)}`);
    if (r?.structuredContent && Object.keys(r.structuredContent).length) return r.structuredContent as O;
    return JSON.parse(texto) as O;
  }
}

// Estado del archivo de Drop a partir del estado de la API. «delivered» y el abono mandan.
function estado(o: O) {
  const s = String(o.status ?? '').toLowerCase();
  if (o.delivered || Number(o.creditedAmount) > 0) return 'ENTREGADO';
  if (/cancel|reject|rechaz/.test(s)) return /reject|rechaz/.test(s) ? 'RECHAZADO' : 'CANCELADO';
  if (/return|devol/.test(s)) return 'DEVOLUCION';
  if (/incid|novedad|issue|problem/.test(s)) return 'NOVEDAD';
  if (/transit|ruta|route|shipped|picked|collected|dispatch/.test(s)) return 'EN TRANSITO';
  if (/registered|pending|created|verif|fulfilled|confirm|prepar/.test(s)) return 'PENDIENTE';
  return s ? s.toUpperCase() : null;
}
function local(iso: string | null, zona: string) {
  if (!iso) return { fecha: null, hora: null };
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}`, ts: `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}` };
}

const fila = (o: O, zona: string) => {
  const { fecha, hora } = local(o.createdAt ?? null, zona);
  const abono = Number(o.creditedAmount ?? 0);
  return {
    id: Number(o.orderNumber), drop_id: o.id ?? null, fecha, hora, estatus: estado(o), estado_drop: o.status ?? null, entregada: !!o.delivered,
    venta: o.codAmount != null ? Number(o.codAmount) : null,
    abono: abono > 0 ? abono : null,
    abonado_en: abono > 0 && o.firstCreditedAt ? (local(o.firstCreditedAt, zona) as O).ts : null,
  };
};

// Drop limita las consultas (429 LIMIT_EXCEEDED) y el tamaño de cada respuesta (422 RESULT_TOO_LARGE). Por eso cada corrida:
// 1) lee las órdenes más recientes del mes actual y 2) sigue la vuelta completa desde el 1 de agosto donde la dejó la corrida
// anterior (drop_conexion.progreso), hasta el presupuesto de llamadas o de tiempo. Al terminar la vuelta, empieza otra.
const RECIENTES = 6, MAX_LLAMADAS = 120, MAX_MS = 110_000;
async function sincronizar(cuenta: string, desde: string, hasta: string) {
  const tok = await acceso(cuenta);
  if (!tok) return { cuenta, omitida: 'sin permiso de Drop' };
  const m = new Mcp(tok);
  await m.iniciar();
  const zona = ZONA[cuenta], ini = Date.now();
  const meses: string[] = [];
  for (let d = new Date(desde.slice(0, 7) + '-01T12:00:00Z'); d.toISOString().slice(0, 7) <= hasta.slice(0, 7); d.setUTCMonth(d.getUTCMonth() + 1)) meses.push(d.toISOString().slice(0, 7));

  let limite = 25, llamadas = 0, frenada = false, moneda: string | null = null;
  const tot: O = { ordenes: 0, nuevas: 0, abonos: 0 };
  let lote: O[] = [];
  const guardar = async () => {
    if (!lote.length) return;
    const uno = new Map(lote.map((f) => [f.id, f]));   // la misma orden puede repetirse entre páginas
    lote = [];
    const x = await rpc('drop_guardar_mcp', { p_cuenta: cuenta, p_filas: [...uno.values()] });
    tot.ordenes += x.ordenes; tot.nuevas += x.nuevas; tot.abonos += x.abonos;
  };
  // Una página; null si Drop frenó las consultas.
  const pagina = async (month: string, cursor?: string): Promise<O | null> => {
    for (;;) {
      try {
        const r = await m.llamar('getOrders', { month, limit: limite, ...(cursor ? { cursor } : {}) });
        llamadas++;
        const d = (r.data ?? r) as O;
        moneda ??= d.currency ?? null;
        if (cuenta === 'AUNCLIC_HN' && moneda && moneda !== 'HNL') throw new Error(`El permiso de ${cuenta} ve una tienda en ${moneda}, no en lempiras`);
        if (cuenta === 'AUNCLIC_SV' && moneda && moneda !== 'USD') throw new Error(`El permiso de ${cuenta} ve una tienda en ${moneda}, no en dólares`);
        for (const o of (d.items ?? []) as O[]) { const f = fila(o, zona); if (Number.isFinite(f.id) && f.id > 0 && f.fecha) lote.push(f); }
        if (lote.length >= 300) await guardar();
        return d;
      } catch (e) {
        const msg = String((e as Error).message);
        if (msg.includes('RESULT_TOO_LARGE') && limite > 3) { limite = Math.max(3, Math.floor(limite / 2)); continue; }
        if (msg.includes('LIMIT_EXCEEDED')) { frenada = true; return null; }
        throw e;
      }
    }
  };

  // 1) Lo más reciente.
  const mesActual = meses[meses.length - 1];
  let c: string | undefined;
  for (let i = 0; i < RECIENTES && !frenada; i++) {
    const d = await pagina(mesActual, c);
    if (!d) break;
    c = d.nextCursor || undefined;
    if (!c) break;
  }

  // 2) La vuelta completa, desde donde iba.
  const prog = ((await rpc('drop_progreso', { p_cuenta: cuenta })) ?? {}) as O;
  let mes: string = meses.includes(prog.mes) ? prog.mes : meses[0];
  let cursor: string | undefined = prog.mes === mes ? (prog.cursor ?? undefined) : undefined;
  let vueltas = Number(prog.vueltas ?? 0);
  while (!frenada && llamadas < MAX_LLAMADAS && Date.now() - ini < MAX_MS) {
    let d: O | null;
    try { d = await pagina(mes, cursor); }
    catch (e) {
      // Un cursor viejo ya no sirve: se retoma ese mes desde el principio.
      if (cursor && String((e as Error).message).includes('INVALID_REQUEST')) { cursor = undefined; continue; }
      throw e;
    }
    if (!d) break;
    cursor = d.nextCursor || undefined;
    if (!cursor || !(d.items ?? []).length) {
      const k = meses.indexOf(mes);
      if (k >= meses.length - 1) { mes = meses[0]; vueltas++; } else mes = meses[k + 1];
      cursor = undefined;
    }
  }
  await guardar();
  await rpc('drop_progreso_guardar', { p_cuenta: cuenta, p_progreso: { mes, cursor: cursor ?? null, vueltas, en: new Date().toISOString() } });
  // Guía, transportadora y cliente vienen de icomfly (misma orden por el id interno de Drop); con eso se cruza el producto.
  const completadas = await rpc('drop_completar_icomfly', { p_cuenta: cuenta });
  const cruce = await rpc('drop_conciliar_sistema', { p_cuenta: cuenta }).catch((e) => ({ error: String(e.message ?? e) }));
  return { cuenta, moneda, ...tot, completadas, llamadas, limite, frenada_por_drop: frenada, va_en: mes, vueltas, segundos: Math.round((Date.now() - ini) / 1000), producto: cruce?.producto ?? cruce?.error ?? null };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, mensaje: 'Solo POST' });
  const token = req.headers.get('x-sync-token') || '';
  if (!token || !(await rpc('effi_check_sync_token', { p_token: token }))) return json(401, { ok: false, mensaje: 'Token inválido' });
  const url = new URL(req.url);
  const fecha = (k: string) => (/^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get(k) ?? '') ? url.searchParams.get(k)! : null);
  const hoy = new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 10);
  const desde = fecha('desde') ?? '2026-08-01';
  const hasta = fecha('hasta') ?? hoy;
  const pedida = url.searchParams.get('cuenta');
  const cuentas = pedida ? CUENTAS.filter((c) => c === pedida) : CUENTAS;
  const resultados = [];
  for (const c of cuentas) {
    try {
      const r = await sincronizar(c, desde, hasta);
      resultados.push(r);
      if (!('omitida' in r)) await rpc('drop_sync_resultado', { p_cuenta: c, p_error: null, p_resumen: r });
    } catch (e) {
      const msg = String((e as Error).message ?? e).slice(0, 300);
      resultados.push({ cuenta: c, error: msg });
      await rpc('drop_sync_resultado', { p_cuenta: c, p_error: msg, p_resumen: { error: msg, en: new Date().toISOString() } }).catch(() => {});
    }
  }
  return json(200, { ok: !resultados.some((r) => 'error' in r), resultados });
});
