// 🧾 agente-admin: pasa la wallet de Effi a comprobantes de ingreso y egreso en Effi (solo el dueño lo opera).
//
// POST /functions/v1/agente-admin?cuenta=TIENDA_GT&accion=preparar   (cabecera x-sync-token) ← horario o "Correr ahora"
//   Toma los movimientos vigentes de la wallet sin comprobante hasta ayer (hora de la tienda) y arma, por mes:
//   - un ingreso con los recaudos de venta (tercero Efficommerce);
//   - un egreso a Efficommerce: flete con recaudo, flete de devolución, fulfillment y comisiones;
//   - un egreso por proveedor que abona la remisión de compra (cuenta por pagar) de cada guía cobrada.
//   Lo que no se puede cerrar queda en novedades. En modo "automatico" lo crea de una vez; en "revisar" espera al dueño.
//   Cada corrida reemplaza el borrador anterior (que nunca llegó a Effi) para que no haya dos con lo mismo.
// POST /functions/v1/agente-admin?cuenta=TIENDA_GT&accion=crear&cierre=12  ← "Crear en Effi" del dueño (o automático)
//
// Enlace guía → remisión de compra: si el proveedor es nuestra proveeduría, exacto (prov_remisiones tiene la remisión del
// proveedor con su transacción dropshipping). Si no, se emparejan en orden (las transacciones y los números de remisión
// del proveedor crecen juntos) exigiendo el mismo valor; probado contra el enlace exacto acierta ~99 %, y cuando falla
// paga otra remisión del mismo proveedor y del mismo valor.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EFFI_API = 'https://effi.com.co/api';
const MIN_GAP_MS = 560;
const PRESUPUESTO_MS = 240_000; // carga inicial de remisiones por partes

type Json = Record<string, any>;
type Mov = { id: number; t: number; valor: number; guia: string | null; detalle: string | null; dia: string; td: number | null; proveedor: string | null; prov_num: number | null; reliquidada: boolean };
type Rem = { sucursal: number; id: number; proveedor: number; remision_num: number; total: number; pdte_pago: number };
type Comp = {
  n: number; recurso: 'ingreso' | 'egreso'; tipo: 'recaudos' | 'efficommerce' | 'compra'; mes: string; fecha: string; tercero: number; nombre: string;
  total: number; lineas: number; cuerpo: Json; wallet_ids: number[]; pagos?: { sucursal: number; id: number; valor: number }[];
  detalle?: Json; effi_id?: number | null; error?: string | null;
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
async function tabla(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`supabase ${path.split('?')[0]} HTTP ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
// PostgREST entrega máximo 1000 filas por llamada: se pide por partes.
async function todas(path: string) {
  let out: Json[] = [];
  for (let desde = 0; ; desde += 1000) {
    const parte: Json[] = await tabla(path, { headers: { Range: `${desde}-${desde + 999}`, 'Range-Unit': 'items' } });
    out = out.concat(parte);
    if (parte.length < 1000) return out;
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const r2 = (x: number) => Math.round(x * 100) / 100;
const num = (s: string | null) => Number(String(s ?? '').replace(/\D/g, '')) || 0;
const ultimoDia = (mes: string) => { const [y, m] = mes.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const periodo = (desde: string, hasta: string) => {
  const [, m1, d1] = desde.split('-').map(Number), [y, m2, d2] = hasta.split('-').map(Number);
  return m1 === m2 ? `del ${d1} al ${d2} de ${MESES[m2 - 1]} ${y}` : `del ${d1} de ${MESES[m1 - 1]} al ${d2} de ${MESES[m2 - 1]} ${y}`;
};

class Effi {
  private ultimo = 0;
  constructor(private key: string) {}
  private async esperar() { const e = this.ultimo + MIN_GAP_MS - Date.now(); if (e > 0) await sleep(e); this.ultimo = Date.now(); }
  async get(recurso: string, params: Record<string, string | number>) {
    const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
    for (let intento = 0; ; intento++) {
      await this.esperar();
      const res = await fetch(`${EFFI_API}/${recurso}?${qs}`, { headers: { Authorization: `Bearer ${this.key}`, Accept: 'application/json' } });
      if (res.status === 429 && intento < 4) { await sleep(1000 * Math.min(30, Number(res.headers.get('retry-after')) || 8)); continue; }
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(`${recurso} HTTP ${res.status}: ${j?.mensaje ?? 'sin respuesta'}`);
      return { data: (j.data ?? []) as Json[], paginas: Number(j.paginacion?.total_paginas ?? 1) };
    }
  }
  async post(recurso: string, cuerpo: Json): Promise<{ status: number; ok: boolean; j: Json | null }> {
    for (let intento = 0; ; intento++) {
      await this.esperar();
      const res = await fetch(`${EFFI_API}/${recurso}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.key}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });
      if (res.status === 429 && intento < 4) { await res.text().catch(() => ''); await sleep(1000 * Math.min(30, Number(res.headers.get('retry-after')) || 8)); continue; }
      const texto = await res.text();
      let j: Json | null = null;
      try { j = JSON.parse(texto); } catch { j = { texto: texto.slice(0, 2000) }; }
      return { status: res.status, ok: res.ok && j?.ok === true, j };
    }
  }
}

async function llaveEffi(cuenta: string) {
  const keys: { slug: string; api_key: string }[] = await rpc('effi_get_api_keys', {});
  const k = keys.find((x) => x.slug === cuenta)?.api_key;
  if (!k) throw new Error('Sin API key de Effi para esta tienda');
  return new Effi(k);
}

async function novedad(cuenta: string, tipo: string, clave: string, datos: Json) {
  await tabla('admin_novedades?on_conflict=cuenta,tipo,clave', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ cuenta, tipo, clave, ...datos, actualizado_en: new Date().toISOString() }),
  });
}

// Copia local de las remisiones de compra: la primera vez se cargan todas (por partes, retomando donde iba); después
// solo las de los últimos días (las nuevas y sus cambios). Devuelve false si la carga inicial aún no termina.
async function sincronizarRemisiones(cuenta: string, cfg: Json, effi: Effi, inicio: number): Promise<boolean> {
  const guardar = async (data: Json[]) => {
    if (!data.length) return;
    await tabla('admin_remisiones_compra?on_conflict=cuenta,sucursal,id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(data.map((r) => ({
        cuenta, sucursal: Number(r.sucursal), id: Number(r.id), proveedor: Number(r.proveedor), remision_num: num(r.remision_proveedor),
        total: Number(r.total), pdte_pago: Number(r.pdte_pago), fecha_trans: r.fecha_trans, actualizado_en: new Date().toISOString(),
      }))),
    });
  };
  if (!cfg.remisiones_completas) {
    let p = Number(cfg.remisiones_pagina ?? 0) + 1;
    while (true) {
      const { data, paginas } = await effi.get('remision_c', { vigente: 1, por_pagina: 100, pagina: p });
      await guardar(data);
      await tabla(`admin_config?cuenta=eq.${cuenta}`, { method: 'PATCH', body: JSON.stringify({ remisiones_pagina: p, remisiones_completas: p >= paginas }) });
      if (p >= paginas) return true;
      if (Date.now() - inicio > PRESUPUESTO_MS) return false;
      p++;
    }
  }
  const [ult] = await tabla(`admin_remisiones_compra?cuenta=eq.${cuenta}&select=fecha_trans&order=fecha_trans.desc&limit=1`);
  const desde = ult ? new Date(new Date(ult.fecha_trans).getTime() - 3 * 86_400_000).toISOString().slice(0, 10) : '2026-01-01';
  for (let p = 1; ; p++) {
    const { data, paginas } = await effi.get('remision_c', { vigente: 1, desde, por_pagina: 100, pagina: p });
    await guardar(data);
    if (p >= paginas) return true;
  }
}

// Empareja en orden las ventas dropshipping de un proveedor (g) con sus remisiones de compra (r): una pareja vale 2 si
// la wallet cobró ese mismo valor, 1 si la guía aún no se ha cobrado; nunca empareja valores distintos.
function alinear(g: [string, number, string, number | null][], r: Rem[]): Map<number, Rem> {
  const n = g.length, m = r.length;
  const val = g.map((x) => (x[3] == null ? null : r2(Number(x[3]))));
  const tot = r.map((x) => r2(Number(x.total)));
  let prev = new Int32Array(m + 1);
  const back: Uint8Array[] = [];
  for (let i = 1; i <= n; i++) {
    const cur = new Int32Array(m + 1), bi = new Uint8Array(m + 1), vi = val[i - 1];
    for (let j = 1; j <= m; j++) {
      let best = prev[j], b = 1;
      if (cur[j - 1] > best) { best = cur[j - 1]; b = 2; }
      const s = vi == null ? 1 : vi === tot[j - 1] ? 2 : -1;
      if (s > 0 && prev[j - 1] + s > best) { best = prev[j - 1] + s; b = 3; }
      cur[j] = best; bi[j] = b;
    }
    back.push(bi); prev = cur;
  }
  const pares = new Map<number, Rem>();
  let i = n, j = m;
  while (i > 0 && j > 0) {
    const b = back[i - 1][j];
    if (b === 3) { pares.set(g[i - 1][1], r[j - 1]); i--; j--; } else if (b === 1) i--; else j--;
  }
  return pares;
}

async function preparar(cuenta: string, quien: string, token: string) {
  const inicio = Date.now();
  const [cfg] = await tabla(`admin_config?cuenta=eq.${cuenta}&select=*`);
  if (!cfg || cfg.modo === 'apagado') return { omitido: 'apagado' };
  const [acc] = await tabla(`effi_accounts?slug=eq.${cuenta}&select=tz_offset_min`);
  const local = new Date(Date.now() + Number(acc?.tz_offset_min ?? -300) * 60_000);
  const hasta = new Date(local.getTime() - 86_400_000).toISOString().slice(0, 10);

  const movs: Mov[] = (await rpc('admin_pendientes', { p_cuenta: cuenta, p_hasta: hasta })).map((m: Json) => ({ ...m, valor: Number(m.valor) }));
  if (!movs.length) {
    await tabla(`admin_config?cuenta=eq.${cuenta}`, { method: 'PATCH', body: JSON.stringify({ ultima_corrida: new Date().toISOString(), ultimo_error: null }) });
    return { sin_movimientos: true, hasta };
  }
  const effi = await llaveEffi(cuenta);
  const compras = movs.filter((m) => m.t === 13);
  if (compras.length && !(await sincronizarRemisiones(cuenta, cfg, effi, inicio))) {
    // La carga inicial de remisiones sigue en otra llamada (para no pasar el tiempo de la función).
    await fetch(`${SUPABASE_URL}/functions/v1/agente-admin?cuenta=${cuenta}&accion=preparar&quien=${encodeURIComponent(quien)}`, {
      method: 'POST', headers: { 'x-sync-token': token, 'Content-Type': 'application/json' }, body: '{}',
    }).catch(() => {});
    return { siguiendo: 'carga de remisiones de compra' };
  }

  // Emparejar compras con remisiones de compra.
  const pagos = new Map<number, Rem>(); // wallet id → remisión a abonar
  const novedades: [string, string, Json][] = [];
  if (compras.length) {
    const rems: Rem[] = (await todas(`admin_remisiones_compra?cuenta=eq.${cuenta}&select=sucursal,id,proveedor,remision_num,total,pdte_pago`))
      .map((x) => ({ ...x, total: Number(x.total), pdte_pago: Number(x.pdte_pago) })) as Rem[];
    const saldo = new Map(rems.map((x) => [`${x.sucursal}-${x.id}`, x.pdte_pago]));
    const porProv = new Map<number, Rem[]>();
    for (const x of rems) porProv.set(x.proveedor, [...(porProv.get(x.proveedor) ?? []), x]);
    for (const xs of porProv.values()) xs.sort((a, b) => a.remision_num - b.remision_num || a.id - b.id);
    const guias: [string, number, string, number | null][] = await rpc('admin_guias_drop', { p_cuenta: cuenta });
    const alineados = new Map<string, Map<number, Rem>>();
    const tomar = (x: Rem | undefined, valor: number) => {
      if (!x || r2(x.total) !== r2(valor)) return false;
      const k = `${x.sucursal}-${x.id}`, s = saldo.get(k) ?? 0;
      if (s + 0.01 < valor) return false;
      saldo.set(k, r2(s - valor));
      return true;
    };
    for (const m of compras) {
      const valor = r2(-m.valor);
      const tercero = m.proveedor ? Number(cfg.proveedores?.[m.proveedor]) : NaN;
      if (m.reliquidada) novedades.push(['reliquidada', m.guia ?? String(m.id), { guia: m.guia, valor, detalle: 'La guía se liquidó, Effi revirtió esa liquidación y la volvió a liquidar: vale la última.' }]);
      if (!tercero) {
        novedades.push(['proveedor_sin_mapa', m.proveedor ?? 'sin proveedor', { guia: m.guia, valor, detalle: `El proveedor "${m.proveedor ?? '—'}" no tiene tercero de Effi asignado en el agente.` }]);
        continue;
      }
      const lista = porProv.get(tercero) ?? [];
      let rem: Rem | undefined;
      if (m.prov_num) {
        rem = lista.find((x) => x.remision_num === m.prov_num && r2(x.total) === valor && (saldo.get(`${x.sucursal}-${x.id}`) ?? 0) + 0.01 >= valor);
      } else if (m.td) {
        if (!alineados.has(m.proveedor!)) alineados.set(m.proveedor!, alinear(guias.filter((x) => x[0] === m.proveedor), lista));
        rem = alineados.get(m.proveedor!)!.get(m.td);
      }
      if (rem && tomar(rem, valor)) pagos.set(m.id, rem);
      else novedades.push(['compra_sin_remision', String(m.id), { guia: m.guia, valor, detalle: `${m.proveedor ?? 'Proveedor'}: la wallet cobró la compra pero no hay remisión de compra pendiente por ese valor en Effi.` }]);
    }
  }

  // Armar los comprobantes por mes.
  const te = cfg.t_egreso ?? {};
  const base = { sucursal: cfg.sucursal, centro_costos: cfg.centro_costos, trm: 1 }; // moneda: la de la empresa
  const medioEgreso = (v: number) => [{ medio_pago: cfg.medio_pago, sucursal_caja_medio_pago: cfg.sucursal, id_caja_medio_pago: cfg.caja, cuenta_medio_pago: cfg.cuenta_bancaria, valor_medio_pago: r2(v), observacion_medio_pago: 'Wallet Effi' }];
  const comps: Comp[] = [];
  const meses = [...new Set(movs.map((m) => m.dia.slice(0, 7)))].sort();
  for (const mes of meses) {
    const ms = movs.filter((m) => m.dia.slice(0, 7) === mes);
    const fecha = hasta < ultimoDia(mes) ? hasta : ultimoDia(mes);
    const per = periodo(ms[0].dia, fecha);
    const rec = ms.filter((m) => m.t === 1);
    if (rec.length) {
      const total = r2(rec.reduce((s, m) => s + m.valor, 0));
      comps.push({
        n: comps.length + 1, recurso: 'ingreso', tipo: 'recaudos', mes, fecha, tercero: cfg.tercero_efficommerce, nombre: 'Efficommerce', total, lineas: 1,
        wallet_ids: rec.map((m) => m.id),
        cuerpo: { ...base, fecha_ingreso: fecha, tercero: cfg.tercero_efficommerce, observacion: `Recaudos de venta wallet Effi ${per}: ${rec.length} guías`,
          otros_ingresos: [{ t_ingreso: cfg.t_ingreso_recaudo, descripcion: `Recaudos de venta wallet Effi ${per} (${rec.length} guías)`, subtotal: total }],
          medio_pago: [cfg.medio_pago], sucursal_caja_medio_pago: [cfg.sucursal], id_caja_medio_pago: [cfg.caja], cuenta_medio_pago: [cfg.cuenta_bancaria],
          valor_medio_pago: [total], observacion_medio_pago: ['Wallet Effi a Cuenta Puente'] },
      });
    }
    const lineas: Json[] = [], ids: number[] = [];
    for (const [t, clave, nombre] of [[7, 'flete_recaudo', 'Flete con recaudo'], [9, 'flete_devolucion', 'Flete devolución'], [12, 'fulfillment', 'Fulfillment'], [36, 'comisiones', 'Comisiones de retiro de wallet']] as const) {
      const xs = ms.filter((m) => m.t === t);
      if (!xs.length) continue;
      lineas.push({ t_egreso: te[clave], descripcion: `${nombre} ${per}${t === 36 ? '' : ` (${xs.length} guías)`}`, subtotal: r2(-xs.reduce((s, m) => s + m.valor, 0)) });
      ids.push(...xs.map((m) => m.id));
    }
    if (lineas.length) {
      const total = r2(lineas.reduce((s, l) => s + l.subtotal, 0));
      comps.push({
        n: comps.length + 1, recurso: 'egreso', tipo: 'efficommerce', mes, fecha, tercero: cfg.tercero_efficommerce, nombre: 'Efficommerce', total, lineas: lineas.length,
        wallet_ids: ids, detalle: Object.fromEntries(lineas.map((l) => [l.descripcion.split(' del ')[0], l.subtotal])),
        cuerpo: { ...base, fecha_egreso: fecha, tercero: cfg.tercero_efficommerce, observacion: `Cobros de Efficommerce en la wallet ${per}`, otros_egresos: lineas, medios_pago: medioEgreso(total) },
      });
    }
    const porTercero = new Map<number, Mov[]>();
    for (const m of ms.filter((x) => x.t === 13 && pagos.has(x.id))) {
      const t = pagos.get(m.id)!.proveedor;
      porTercero.set(t, [...(porTercero.get(t) ?? []), m]);
    }
    for (const [t, xs] of porTercero) {
      const total = r2(-xs.reduce((s, m) => s + m.valor, 0));
      const nombre = Object.entries(cfg.proveedores ?? {}).filter(([, v]) => Number(v) === t).map(([k]) => k).join(' / ');
      comps.push({
        n: comps.length + 1, recurso: 'egreso', tipo: 'compra', mes, fecha, tercero: t, nombre, total, lineas: xs.length,
        wallet_ids: xs.map((m) => m.id), pagos: xs.map((m) => ({ sucursal: pagos.get(m.id)!.sucursal, id: pagos.get(m.id)!.id, valor: r2(-m.valor) })),
        cuerpo: { ...base, fecha_egreso: fecha, tercero: t, observacion: `Pago compras dropshipping descontadas de la wallet Effi ${per}: ${xs.length} remisiones`,
          abonos_cxp: xs.map((m) => ({ t_trans_ref: 10, sucursal_ref: pagos.get(m.id)!.sucursal, id_trans_ref: pagos.get(m.id)!.id, subtotal: r2(-m.valor), descripcion: `Guía ${m.guia}` })),
          medios_pago: medioEgreso(total) },
      });
    }
  }

  // El borrador anterior (que nunca llegó a Effi) se reemplaza por este, que ya trae todo lo pendiente.
  await tabla(`admin_cierres?cuenta=eq.${cuenta}&estado=eq.borrador`, { method: 'DELETE' });
  for (const [tipo, clave, datos] of novedades) await novedad(cuenta, tipo, clave, { ...datos, resuelta_en: null });
  const ingresos = r2(comps.filter((c) => c.recurso === 'ingreso').reduce((s, c) => s + c.total, 0));
  const egresos = r2(comps.filter((c) => c.recurso === 'egreso').reduce((s, c) => s + c.total, 0));
  const resumen = {
    movimientos: movs.length, ingresos, egresos, comprobantes: comps.length,
    compras_sin_remision: novedades.filter((x) => x[0] === 'compra_sin_remision').length,
    compras_sin_remision_valor: r2(novedades.filter((x) => x[0] === 'compra_sin_remision').reduce((s, x) => s + Number(x[2].valor ?? 0), 0)),
  };
  if (!comps.length) {
    await tabla(`admin_config?cuenta=eq.${cuenta}`, { method: 'PATCH', body: JSON.stringify({ ultima_corrida: new Date().toISOString(), ultimo_error: null }) });
    return { sin_comprobantes: true, ...resumen };
  }
  const [cierre] = await tabla('admin_cierres', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ cuenta, desde: movs[0].dia, hasta, estado: 'borrador', origen: quien === 'horario' ? 'programado' : 'manual', creado_por: quien, resumen, comprobantes: comps }),
  });
  await tabla(`admin_config?cuenta=eq.${cuenta}`, { method: 'PATCH', body: JSON.stringify({ ultima_corrida: new Date().toISOString(), ultimo_error: null }) });
  if (cfg.modo === 'automatico') return await crear(cuenta, cierre.id, 'automático');
  return { cierre: cierre.id, ...resumen };
}

async function crear(cuenta: string, id: number, quien: string) {
  const [c] = await tabla(`admin_cierres?id=eq.${id}&cuenta=eq.${cuenta}&select=*`);
  if (!c || !['borrador', 'error'].includes(c.estado)) return { omitido: 'no está por crear' };
  await tabla(`admin_cierres?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ estado: 'creando', aprobado_por: c.aprobado_por ?? quien, aprobado_en: c.aprobado_en ?? new Date().toISOString() }) });
  const effi = await llaveEffi(cuenta);
  const comps: Comp[] = c.comprobantes;
  let errores = 0;
  for (const comp of comps) {
    if (comp.effi_id) continue;
    const cuerpo = { ...comp.cuerpo, idempotency_key: `agente-${cuenta}-${id}-${comp.n}` };
    let r: { status: number; ok: boolean; j: Json | null };
    try { r = await effi.post(comp.recurso, cuerpo); }
    catch (e) { r = { status: 0, ok: false, j: { mensaje: `Effi no respondió (${String(e)}). Al reintentar no se duplica.` } }; }
    // 409 = ya existía con esa llave (un intento anterior sí llegó): se toma como hecho.
    const d = r.j?.data ?? r.j?.transaccion ?? null;
    if (r.ok || (r.status === 409 && d?.id)) {
      comp.effi_id = Number(d?.id); comp.error = null;
      await tabla('admin_wallet_usados?on_conflict=cuenta,wallet_id', {
        method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify(comp.wallet_ids.map((w) => ({ cuenta, wallet_id: w, cierre_id: id, comprobante: `${comp.recurso} #${comp.effi_id}` }))),
      });
      for (const p of comp.pagos ?? []) {
        const [x] = await tabla(`admin_remisiones_compra?cuenta=eq.${cuenta}&sucursal=eq.${p.sucursal}&id=eq.${p.id}&select=pdte_pago`);
        if (x) await tabla(`admin_remisiones_compra?cuenta=eq.${cuenta}&sucursal=eq.${p.sucursal}&id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify({ pdte_pago: r2(Number(x.pdte_pago) - p.valor) }) });
      }
      if (comp.tipo === 'compra') {
        await tabla(`admin_novedades?cuenta=eq.${cuenta}&tipo=eq.compra_sin_remision&clave=in.(${comp.wallet_ids.join(',')})&resuelta_en=is.null`, { method: 'PATCH', body: JSON.stringify({ resuelta_en: new Date().toISOString() }) });
      }
    } else {
      errores++;
      const m = r.j?.mensaje ?? r.j?.texto ?? `HTTP ${r.status}`;
      comp.error = typeof m === 'string' ? m : JSON.stringify(m);
      await novedad(cuenta, 'error_effi', `${id}-${comp.n}`, { cierre_id: id, valor: comp.total, detalle: `No se creó el ${comp.recurso} de ${comp.nombre} (${comp.mes}): ${comp.error}`, resuelta_en: null });
    }
    await tabla(`admin_cierres?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ comprobantes: comps }) });
  }
  await tabla(`admin_cierres?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ estado: errores ? 'error' : 'hecho', error: errores ? `${errores} comprobante(s) no se crearon` : null }) });
  return { cierre: id, creados: comps.filter((x) => x.effi_id).length, errores };
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, mensaje: 'Solo POST' });
  const token = req.headers.get('x-sync-token') || '';
  if (!token || !(await rpc('effi_check_sync_token', { p_token: token }))) return json(401, { ok: false, mensaje: 'Token inválido' });
  const url = new URL(req.url);
  const cuenta = url.searchParams.get('cuenta') ?? '';
  const accion = url.searchParams.get('accion') ?? 'preparar';
  const quien = url.searchParams.get('quien') ?? 'horario';
  if (!/^[A-Z0-9_]+$/.test(cuenta)) return json(400, { ok: false, mensaje: 'Falta cuenta' });
  const tarea = (async () => {
    try {
      const r = accion === 'crear' ? await crear(cuenta, Number(url.searchParams.get('cierre')), quien) : await preparar(cuenta, quien, token);
      console.log(JSON.stringify({ cuenta, accion, ...r }));
    } catch (e) {
      console.error(String(e));
      await tabla(`admin_config?cuenta=eq.${cuenta}`, { method: 'PATCH', body: JSON.stringify({ ultima_corrida: new Date().toISOString(), ultimo_error: String(e).slice(0, 500) }) }).catch(() => {});
      if (accion === 'crear') await tabla(`admin_cierres?id=eq.${Number(url.searchParams.get('cierre'))}&estado=eq.creando`, { method: 'PATCH', body: JSON.stringify({ estado: 'error', error: String(e).slice(0, 500) }) }).catch(() => {});
    }
  })();
  // @ts-ignore EdgeRuntime existe en Supabase Edge Functions
  EdgeRuntime.waitUntil(tarea);
  return json(202, { ok: true, mensaje: 'En marcha' });
});
