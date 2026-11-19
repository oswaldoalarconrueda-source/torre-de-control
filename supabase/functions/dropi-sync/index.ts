// dropi-sync: trae las órdenes de Dropi por su MCP oficial (mcp.dropi.co) y las guarda en dropi_ordenes, igual que el Excel de
// órdenes: estado, guía, transportadora, valor, ciudad. Las órdenes nuevas llevan sus productos (get_order) a
// dropi_orden_productos. Flete, costo y comisión siguen saliendo del Excel; la ganancia, de la cartera.
//
// POST /functions/v1/dropi-sync   (cabecera x-sync-token) ← cron dropi-sync (cada hora)
//   ?cuenta=AUNCLIC_GT   solo esa tienda (sin cuenta: las que tengan permiso guardado)
//   ?desde=2026-11-01&hasta=2026-11-18   rango de creación (por defecto, desde el 1-ago-2026 hasta hoy, por tramos de 80 días)
//   ?explorar=1          no guarda: devuelve la forma (claves y tipos, sin valores) de una orden y su detalle
// El permiso (client_id + refresh_token) lo da el dueño una vez con scripts/autorizar-dropi.mjs; aquí se renueva solo.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MCP = 'https://mcp.dropi.co/mcp';
const AUTH = 'https://integrations.dropi.co';
const CUENTAS = ['AUNCLIC_GT', 'TIENDA_GT', 'TIENDA_CO'];
const ZONA: Record<string, string> = { AUNCLIC_GT: 'America/Guatemala', TIENDA_GT: 'America/Guatemala', TIENDA_CO: 'America/Bogota' };

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

// Renueva el acceso con el refresh_token guardado (y guarda el nuevo si Dropi lo rota).
async function acceso(cuenta: string) {
  const p = (await rpc('dropi_oauth', { p_cuenta: cuenta })) as O | null;
  if (!p?.refresh_token) return null;
  const r = await fetch(`${AUTH}/oauth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: p.refresh_token, client_id: p.client_id, resource: MCP }),
  });
  const t = await r.json().catch(() => ({}));
  if (!r.ok || !t.access_token) throw new Error(`Dropi no renovó el permiso (HTTP ${r.status} ${t.error ?? ''}): hay que autorizar de nuevo`);
  if (t.refresh_token && t.refresh_token !== p.refresh_token) {
    await rpc('dropi_oauth_actualizar', { p_cuenta: cuenta, p_oauth: { ...p, refresh_token: t.refresh_token, renovado: new Date().toISOString() } });
  }
  return t.access_token as string;
}

// Cliente MCP mínimo (HTTP streamable).
class Mcp {
  sid: string | null = null; n = 0; crudo = '';
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
    if (r?.isError) throw new Error(`${nombre}: ${String(r.content?.[0]?.text ?? '').slice(0, 200)}`);
    const texto = String(r?.content?.[0]?.text ?? '');
    // Para explorar: la estructura sin valores (cada valor se cambia por «…»).
    this.crudo = JSON.stringify({ claves: Object.keys(r ?? {}), estructurado: r?.structuredContent ? forma(r.structuredContent) : null,
      texto: texto.split('\n').filter((l) => /^\s*[\w.\-]+(\[\d+\])?(\{[^}]*\})?:/.test(l)).slice(0, 40).map((l) => l.replace(/:\s.*$/, ': …')).join('\n') });
    // El texto trae la respuesta completa; structuredContent a veces llega vacío.
    if (texto.trim()) { try { return JSON.parse(texto) as O; } catch { return yaml(texto); } }
    return (r?.structuredContent ?? {}) as O;
  }
}

// Las respuestas vienen en TOON: «items[2]{order_id,status,...}:» seguido de filas CSV sangradas, y «clave: valor» u objetos
// anidados por sangría; las listas sin encabezado van con «- ». Lector mínimo para eso.
function valor(v: string): unknown {
  const s = v.trim();
  if (s === '' || s === 'null' || s === '~') return null;
  if (s === 'true' || s === 'false') return s === 'true';
  if (/^".*"$/.test(s)) { try { return JSON.parse(s); } catch { return s.slice(1, -1); } }
  if (/^-?\d+(\.\d+)?$/.test(s) && !/^0\d/.test(s)) return Number(s);
  return s;
}
function csv(linea: string): string[] {
  const out: string[] = []; let cur = '', q = false;
  for (let k = 0; k < linea.length; k++) {
    const c = linea[k];
    if (q) { if (c === '\\' && linea[k + 1] === '"') { cur += '\\"'; k++; } else if (c === '"') { q = false; cur += c; } else cur += c; }
    else if (c === '"') { q = true; cur += c; }
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}
function yaml(texto: string): O {
  const lineas = texto.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'));
  let i = 0;
  const sangria = (l: string) => l.length - l.trimStart().length;
  function bloque(nivel: number): any {
    if (i < lineas.length && lineas[i].trimStart().startsWith('- ')) {
      const arr: any[] = [];
      while (i < lineas.length && sangria(lineas[i]) === nivel && lineas[i].trimStart().startsWith('- ')) {
        const dentro = lineas[i].trimStart().slice(2);
        if (/^[\w.\-]+(\[\d+\])?(\{[^}]*\})?:/.test(dentro)) { lineas[i] = ' '.repeat(nivel + 2) + dentro; arr.push(bloque(nivel + 2)); }
        else { arr.push(valor(dentro)); i++; }
      }
      return arr;
    }
    const obj: O = {};
    while (i < lineas.length && sangria(lineas[i]) === nivel) {
      const m = lineas[i].trim().match(/^([\w.\-]+)(\[\d+\])?(?:\{([^}]*)\})?:\s?(.*)$/);
      if (!m) { i++; continue; }
      i++;
      const [, clave, cant, campos, resto] = m;
      if (campos !== undefined) {
        // Tabla: una fila CSV por línea más sangrada.
        const cs = campos.split(',').map((x) => x.trim());
        const filas: O[] = [];
        while (i < lineas.length && sangria(lineas[i]) > nivel) {
          const vs = csv(lineas[i].trim());
          filas.push(Object.fromEntries(cs.map((c, k) => [c, valor(vs[k] ?? '')])));
          i++;
        }
        obj[clave] = filas;
      } else if (resto !== '') {
        // Lista corta en línea: «tags[2]: a,b».
        obj[clave] = cant ? csv(resto).map(valor) : valor(resto);
      } else if (i < lineas.length && sangria(lineas[i]) > nivel) obj[clave] = bloque(sangria(lineas[i]));
      else obj[clave] = cant ? [] : null;
    }
    return obj;
  }
  return bloque(sangria(lineas[0] ?? ''));
}

const forma = (v: unknown, d = 0): unknown => Array.isArray(v) ? (v.length ? [forma(v[0], d + 1)] : []) :
  v && typeof v === 'object' && d < 4 ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, forma(x, d + 1)])) : v === null ? 'null' : typeof v;

function local(iso: string | null, zona: string) {
  if (!iso) return { fecha: null, hora: null };
  // created_at llega sin zona ("2026-11-17T16:40:04"): ya es hora local de la tienda.
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(iso)) return { fecha: iso.slice(0, 10), hora: iso.slice(11, 16) || null };
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
}
const lista = (r: O): O[] => (Array.isArray(r) ? r : r.items ?? r.orders ?? r.data ?? r.objects ?? []) as O[];

async function sincronizar(cuenta: string, desde: string, hasta: string, explorar: boolean) {
  const tok = await acceso(cuenta);
  if (!tok) return { cuenta, omitida: 'sin permiso de Dropi' };
  const m = new Mcp(tok);
  await m.iniciar();
  const zona = ZONA[cuenta];

  if (explorar) {
    const r = await m.llamar('list_orders', { from: desde, until: hasta, result_number: 2 });
    const o = lista(r)[0];
    const det = o ? await m.llamar('get_order', { id: String(o.order_id ?? o.id) }) : null;
    const crudoLista = m.crudo;
    return { cuenta, lista: forma(r), crudoLista: JSON.parse(crudoLista), detalle: forma(det), crudoDetalle: o ? JSON.parse(m.crudo) : null };
  }

  // Dropi no acepta rangos de más de 90 días: se pide por tramos de 80 días.
  const ordenes: O[] = [];
  const dia = (f: string, n: number) => new Date(Date.parse(f + 'T12:00:00Z') + n * 86400e3).toISOString().slice(0, 10);
  for (let ini = desde; ini <= hasta; ini = dia(ini, 80)) {
    const fin = dia(ini, 79) < hasta ? dia(ini, 79) : hasta;
    for (let start = 0; start < 10000; start += 100) {
      const r = await m.llamar('list_orders', { from: ini, until: fin, result_number: 100, start });
      const items = lista(r);
      ordenes.push(...items);
      if (items.length < 100) break;
    }
  }
  const filas = ordenes.map((o) => {
    const { fecha, hora } = local(o.created_at ?? null, zona);
    return {
      id: Number(o.order_id ?? o.id), fecha, hora,
      guia: o.tracking_code ? String(o.tracking_code) : null,
      estatus: o.status ? String(o.status).toUpperCase() : null,
      tipo_envio: o.rate_type ?? null,
      departamento: o.department ?? o.state ?? null,
      ciudad: o.city ?? null,
      transportadora: o.shipping_company ?? null,
      venta: o.total != null ? Number(o.total) : null,
      tienda: o.shop_id != null ? String(o.shop_id) : (o.store_id != null ? String(o.store_id) : null),
      tipo_tienda: o.shop_type ?? null,
      id_orden_tienda: o.shop_order_id != null ? String(o.shop_order_id) : null,
    };
  }).filter((f) => f.id && f.fecha);
  let total = 0, nuevas = 0;
  for (let i = 0; i < filas.length; i += 500) {
    const r = await rpc('dropi_guardar_ordenes_mcp', { p_cuenta: cuenta, p_filas: filas.slice(i, i + 500) });
    total += r.total; nuevas += r.nuevas;
  }

  // Productos de las órdenes que aún no tienen (máx. 40 por corrida; las demás en la siguiente hora).
  const ids = filas.map((f) => f.id);
  const sinProd = ids.length ? ((await rpc('dropi_ordenes_sin_productos', { p_cuenta: cuenta, p_ids: ids })) as number[]) : [];
  let productos = 0;
  for (const id of sinProd.slice(0, 40)) {
    const d = await m.llamar('get_order', { id: String(id) });
    const o = (d.order ?? d) as O;
    const items: O[] = o.items ?? o.products ?? o.details ?? [];
    const pf = items.map((it, k) => ({
      orden_id: id, linea: k + 1,
      producto_id: it.product_id ?? it.id ?? null, variacion_id: it.variation_id ?? null, sku: it.sku ?? null,
      producto: it.name ?? it.product_name ?? it.product ?? null, variacion: it.variation ?? it.variation_name ?? null,
      // get_order trae product_id, product_name, qty, unit_price (precio de venta) y subtotal; el precio del proveedor no
      // viene: queda vacío hasta que llegue el Excel de órdenes por producto.
      cantidad: (it.qty ?? it.quantity) != null ? Number(it.qty ?? it.quantity) : null,
      precio_proveedor: it.supplier_price != null ? Number(it.supplier_price) : null,
      precio_proveedor_total: it.supplier_price != null ? Number(it.supplier_price) * Number(it.qty ?? it.quantity ?? 1) : null,
    }));
    if (pf.length) productos += await rpc('dropi_guardar_productos_mcp', { p_cuenta: cuenta, p_filas: pf });
  }
  return { cuenta, desde, hasta, ordenes: filas.length, nuevas, guardadas: total, sin_productos: sinProd.length, productos };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, mensaje: 'Solo POST' });
  const token = req.headers.get('x-sync-token') || '';
  if (!token || !(await rpc('effi_check_sync_token', { p_token: token }))) return json(401, { ok: false, mensaje: 'Token inválido' });
  const url = new URL(req.url);
  const fecha = (k: string) => (/^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get(k) ?? '') ? url.searchParams.get(k)! : null);
  const hoy = new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 10);
  // Por pedido del dueño (18-nov): siempre desde el 1 de agosto de 2026 (inicio de la sociedad) hasta hoy.
  const desde = fecha('desde') ?? '2026-08-01';
  const hasta = fecha('hasta') ?? hoy;
  const explorar = url.searchParams.get('explorar') === '1';
  const pedida = url.searchParams.get('cuenta');
  const cuentas = pedida ? CUENTAS.filter((c) => c === pedida) : CUENTAS;
  const resultados = [];
  for (const c of cuentas) {
    try {
      const r = await sincronizar(c, desde, hasta, explorar);
      resultados.push(r);
      if (!explorar && !('omitida' in r)) await rpc('dropi_sync_resultado', { p_cuenta: c, p_error: null, p_resumen: r });
    } catch (e) {
      const msg = String((e as Error).message ?? e).slice(0, 300);
      resultados.push({ cuenta: c, error: msg });
      if (!explorar) await rpc('dropi_sync_resultado', { p_cuenta: c, p_error: msg, p_resumen: { error: msg, en: new Date().toISOString() } }).catch(() => {});
    }
  }
  return json(200, { ok: !resultados.some((r) => 'error' in r), resultados });
});
