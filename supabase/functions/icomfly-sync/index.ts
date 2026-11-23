// icomfly-sync: trae los pedidos de icomfly (A un clic Honduras y El Salvador; Joalix Colombia desde el 23-nov, pedidos de
// Shopify) por API y los guarda en icomfly_pedidos,
// con la misma forma que el archivo «icomfly · Pedidos»: id "#8665", una fila por producto, huella del cliente (sha-256 del
// nombre, sin guardar nombre, teléfono ni dirección). Luego cruza el producto con las órdenes de Drop (drop_conciliar_sistema).
//
// POST /functions/v1/icomfly-sync   (cabecera x-sync-token) ← cron icomfly-sync (cada hora)
//   ?cuenta=AUNCLIC_HN   solo esa tienda (sin cuenta: las que tengan token)
//   ?desde=2026-08-01&hasta=2026-08-31   pedidos creados en ese rango (por defecto, los últimos 30 días hasta hoy)
//   ?cruce=0             no cruzar con Drop al final (para cargar el historial por tramos y cruzar una sola vez)
// Una llamada aguanta ~3.000 pedidos: el historial se carga por tramos de un mes.
// El token de cada tienda (ik_live_, solo lectura) está cifrado en el Vault (icomfly_token); docs: icomfly.com/docs/api.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const API = 'https://api.icomfly.com/api';
const CUENTAS = ['AUNCLIC_HN', 'AUNCLIC_SV', 'TIENDA_CO'];
// Zona por defecto si icomfly no la manda.
const ZONA: Record<string, string> = { AUNCLIC_HN: 'America/Tegucigalpa', AUNCLIC_SV: 'America/El_Salvador', TIENDA_CO: 'America/Bogota' };
// El token debe ser de la tienda del país (icomfly a veces ata el token a otra tienda del usuario). Colombia: basta con que
// no sea una tienda de A un clic.
const tiendaAjena = (cuenta: string, nombre: string) =>
  cuenta === 'AUNCLIC_HN' ? !/\bHN\b|hondur/i.test(nombre)
  : cuenta === 'AUNCLIC_SV' ? !/\bSV\b|salvador/i.test(nombre)
  : /\bHN\b|hondur|\bSV\b|salvador|a un clic/i.test(nombre);

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

// Igual que web/src/lib/cargas.ts (huellaCliente), para que el cruce por nombre con Drop siga funcionando.
const normalNombre = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
async function huella(nombre: unknown) {
  const t = typeof nombre === 'string' ? nombre.trim() : '';
  if (!t || t === '—' || t === '-') return null;
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`cliente|${normalNombre(t)}`));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

// Estado como lo muestra el archivo: el logístico si hay guía; si no, el del pedido.
const LOGISTICO: Record<string, string> = {
  GUIA_GENERADA: 'Guía Generada', EN_TRANSITO: 'En Tránsito', EN_REPARTO: 'En Reparto', ENTREGADO: 'Entregado a Destino',
  DEVOLUCION: 'Devolución', NOVEDAD: 'Novedad', NOVEDAD_OPERATIVA: 'Novedad', RECLAME_OFICINA: 'Reclame en Oficina', CANCELADO: 'Cancelado',
};

// Día y hora del pedido en la zona de la tienda.
function local(iso: string | null, zona: string) {
  if (!iso) return { fecha: null, hora: null };
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
}

type O = Record<string, any>;
async function filas(o: O, cuenta: string) {
  const zona = o.store_timezone || ZONA[cuenta] || 'America/Tegucigalpa';
  const { fecha, hora } = local(o.created_at, zona);
  const id = o.shopify_display_number || (o.store_web_seq != null ? `#${o.store_web_seq}` : o.order_number || String(o.id));
  const items: O[] = Array.isArray(o.items) && o.items.length ? o.items : [{ product_name: o.product_name, quantity: o.quantity }];
  const est = o.status === 'Cancelado' ? 'Cancelado' : (o.tracking_status && LOGISTICO[o.tracking_status]) || o.status || null;
  const plataforma = o.drop_order_id ? 'Drop' : o.boxful_shiphero_order_number || o.boxful_synced_at ? 'Boxful' : o.dropi_order_id ? 'Dropi' : null;
  const hash = await huella(o.shipping_name ?? o.shipping?.name ?? o.customer?.fullName);
  const comun = {
    id, fecha, hora,
    origen: o.shopify_order_id ? 'Shopify' : (o.sales_channel || 'Bot'),
    plataforma_envio: plataforma,
    departamento: o.shipping?.department ?? o.shipping_department ?? null,
    municipio: o.shipping?.city ?? o.shipping_city ?? null,
    total: o.total != null ? Number(o.total) : null,
    recaudo: o.is_no_collection || o.collection_type === 'sin_recaudo' ? 'Sin recaudo' : 'Con recaudo',
    pasarela: o.payment_type === 'cod' ? 'Contraentrega' : (o.payment_method || null),
    costo_producto: o.costo_producto != null ? Number(o.costo_producto) : null,
    costo_envio: o.carrier_real_shipping_cost != null ? Number(o.carrier_real_shipping_cost) : (o.shipping_cost != null ? Number(o.shipping_cost) : null),
    estado: est,
    guia: o.tracking_number || null,
    transportadora: o.carrier_name || null,
    etiquetas: Array.isArray(o.labels) && o.labels.length ? o.labels.map((l: O) => l.name).filter(Boolean).join(', ') : null,
    motivo_cancelacion: o.cancellation_reason || null,
    fecha_cancelacion: o.cancelled_at ? local(o.cancelled_at, zona).fecha : null,
    cliente_hash: hash,
    api_id: o.id,
    tracking_status: o.tracking_status || null,
    enviado_en: o.effective_shipped_at || o.shipped_at || null,
    entregado_en: o.delivered_at || null,
    devuelto_en: o.returned_at || null,
    drop_order_id: o.drop_order_id || null,   // id interno de Drop: la llave exacta con getOrders de drop-sync
  };
  return items.map((it, i) => ({ ...comun, linea: i + 1, producto: it.product_name || it.name || null, cantidad: Number(it.quantity ?? 1) }));
}

async function sincronizar(cuenta: string, desde: string, hasta: string, cruzar: boolean) {
  const token = (await rpc('icomfly_token', { p_cuenta: cuenta })) as string | null;
  if (!token) return { cuenta, omitida: 'sin token' };
  let pagina = 1, paginas = 1, pedidos = 0, lineas = 0, tienda: string | null = null;
  const lote: O[] = [];
  const guardar = async () => { if (lote.length) { lineas += await rpc('icomfly_guardar_pedidos', { p_cuenta: cuenta, p_filas: lote.splice(0) }); } };
  do {
    const res = await fetch(`${API}/orders?limit=250&page=${pagina}&dateFrom=${desde}&dateTo=${hasta}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`icomfly HTTP ${res.status}${res.status === 401 ? ' (token revocado)' : ''}`);
    const b = await res.json();
    paginas = Number(b.totalPages ?? 1);
    for (const o of (b.data ?? []) as O[]) {
      // Seguridad: el token debe ser de la tienda del país (icomfly a veces ata el token a otra tienda del usuario).
      tienda ??= o.store_name ?? null;
      if (o.store_name && tiendaAjena(cuenta, String(o.store_name))) throw new Error(`El token de ${cuenta} ve la tienda «${o.store_name}»`);
      if (o.es_de_testeo) continue;
      lote.push(...(await filas(o, cuenta)));
      pedidos++;
      if (lote.length >= 500) await guardar();
    }
    pagina++;
  } while (pagina <= paginas && pagina <= 60);
  await guardar();
  // El cruce con Drop es solo de A un clic (Joalix Colombia no usa Drop).
  const cruce = cruzar && cuenta.startsWith('AUNCLIC_') ? await rpc('drop_conciliar_sistema', { p_cuenta: cuenta }).catch((e) => ({ error: String(e.message ?? e) })) : null;
  return { cuenta, tienda, desde, hasta, pedidos, lineas, paginas, producto: cruce?.producto ?? cruce?.error ?? null };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, mensaje: 'Solo POST' });
  const token = req.headers.get('x-sync-token') || '';
  if (!token || !(await rpc('effi_check_sync_token', { p_token: token }))) return json(401, { ok: false, mensaje: 'Token inválido' });
  const url = new URL(req.url);
  const hoy = new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 10);
  const fecha = (k: string) => (/^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get(k) ?? '') ? url.searchParams.get(k)! : null);
  const desde = fecha('desde') ?? new Date(Date.now() - 30 * 86400e3).toISOString().slice(0, 10);
  const hasta = fecha('hasta') ?? hoy;
  const cruzar = url.searchParams.get('cruce') !== '0';
  const pedida = url.searchParams.get('cuenta');
  const cuentas = pedida ? CUENTAS.filter((c) => c === pedida) : CUENTAS;
  const resultados = [];
  for (const c of cuentas) {
    try {
      const r = await sincronizar(c, desde, hasta, cruzar);
      resultados.push(r);
      if (!('omitida' in r)) await rpc('icomfly_sync_resultado', { p_cuenta: c, p_error: null, p_resumen: r });
    } catch (e) {
      const msg = String((e as Error).message ?? e).slice(0, 300);
      resultados.push({ cuenta: c, error: msg });
      await rpc('icomfly_sync_resultado', { p_cuenta: c, p_error: msg, p_resumen: { error: msg, en: new Date().toISOString() } }).catch(() => {});
    }
  }
  return json(200, { ok: !resultados.some((r) => 'error' in r), resultados });
});
