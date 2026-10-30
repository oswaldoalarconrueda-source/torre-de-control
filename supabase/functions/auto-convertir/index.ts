// auto-convertir: el Agente arma la remisión y la guía de cada orden de venta vigente sin remisión.
// Simulación (cron): guarda en auto_ordenes.plan lo que enviaría a Effi y no crea nada.
// Creación (Guatemala y Ecuador): cuando el dueño pulsa "Ejecutar" o "Ejecutar ahora" (?ahora=1), o sola en modo
// Automático, crea la remisión y después la guía, dejando cada paso en auto_eventos (bitácora en vivo) y el resultado
// o el error de Effi, con lo enviado y lo respondido, en el plan. En Automático también hace la guía de las remisiones vigentes sin guía (más de 15 minutos).
//
// POST /functions/v1/auto-convertir?cuenta=TIENDA_GT              (cabecera x-sync-token) ← auto_convertir_tick (cron)
// POST /functions/v1/auto-convertir?cuenta=TIENDA_GT&crear=1-6957  ← auto_decidir('ejecutar')
// POST /functions/v1/auto-convertir?cuenta=TIENDA_EC&ahora=1&solo=guias ← auto_pasar_a_guia ("Pasar de remisión a guía"):
//   solo las guías de las remisiones ya hechas, en tandas de 10 hasta acabarlas (se encadena si no alcanza el tiempo).
//
// Reglas (Guatemala, pedidas por el dueño):
// - Remisión desde la orden (action 3) con el convenio de dropshipping que trae la orden, sin cambiarlo.
// - Cliente con * al inicio del nombre (pedido recuperado de LucidBot) → centro de costos Recuperado.
// - Productos: se detectan con el filtro "articulo" de api/orden_v (la API no da el detalle de la orden).
//   Cantidad y precio: los de la orden (api/detalle_orden_v, desde el 29-oct). Si no se pueden leer, la que siempre tuvo
//   ese producto con ese total en las guías anteriores; sin antecedentes → revisión.
// - Guía: transportadora, servicio y forma de pago de las guías hechas; remitente según el convenio; contenido,
//   valor declarado y recaudo tomados de la remisión.
//
// Ecuador (pedidas por el dueño): entrega en oficina ("Oficina Servientrega …", "RETIRA EN CS …") → Servientrega;
// las demás direcciones → Gintracom. Si Gintracom no deja hacer la guía, se repite con Servientrega y la ciudad queda
// en la memoria de cobertura (auto_cobertura). Las ciudades donde en los últimos días solo se ha despachado a domicilio
// por Servientrega también van directo por Servientrega. Como en Ecuador una persona hace las remisiones a mano, el
// agente también arma la guía de las remisiones vigentes sin guía.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EFFI_API = 'https://effi.com.co/api';
const MIN_GAP_MS = 560;
const DAY_MS = 86_400_000;
const REGLAS_HORAS = 6;
const MAX_ORDENES = 15;
// Mismo mando para todas las tiendas de todas las sociedades (30-oct; la proveeduría DistriLatam queda fuera): crean en
// Effi en Automático o cuando el dueño pulsa "Ejecutar ahora", "Pasar de remisión a guía" o "Ejecutar" en una orden.
const TIENDAS = ['TIENDA_GT', 'TIENDA_EC', 'TIENDA_CO', 'TIENDA_CR', 'AUNCLIC_GT', 'VALKA_GT'];
const PAISES_CREACION = TIENDAS;
// Países donde además se crea la remisión desde la orden (action 3, nunca anulando la orden). Ecuador desde el 27-oct,
// con la llave de perfil principal (con la de perfil Auxiliar Effi fallaba con el error 1452). A un clic Guatemala
// (AUNCLIC_GT, otra sociedad) desde el 29-oct, igual que Joalix Guatemala: pedidos de Shopify → remisión y guía por el
// centro SHOPIFY (centro_normal); las ventas de Lucid llegan como remisión y solo les falta la guía (centro LUCID, el
// de la remisión).
// Valka Guatemala (centro Whatsapp) y Joalix Costa Rica desde el 30-oct, arrancando en Manual.
const PAISES_REMISION = TIENDAS;
// "Ejecutar" orden por orden (el dueño escoge el paso y la transportadora).
const PAISES_POR_ORDEN = TIENDAS;
const ESPERA_GUIA_AHORA_MIN = 2; // "Ejecutar ahora": espera mínima tras la remisión, por si alguien está haciendo la guía
const MAX_CREAR = 8;          // creaciones por corrida (cada una tarda unos 12 s); el resto va en la siguiente
const MAX_GUIAS_AHORA = 10;   // "Ejecutar ahora": guías por corrida, de a 10 para no cargar el sistema (regla del dueño)
const ESPERA_GUIA_MIN = 15;   // remisiones hechas por otros: se espera este tiempo antes de hacerles la guía
const PAGINAS_REGLAS = 30;    // guías y remisiones de 10 días (Ecuador hace unas 250 guías al día)
const DIVISA: Record<string, string> = { TIENDA_GT: 'GTQ', TIENDA_EC: 'USD', TIENDA_CO: 'COP', TIENDA_CR: 'CRC', AUNCLIC_GT: 'GTQ', VALKA_GT: 'GTQ' };
// Países que escogen transportadora por dirección (ids de transportadora en Effi). Los demás usan la más común.
const TRANSPORTE_PAIS: Record<string, { oficina: number; domicilio: number; respaldo: number }> = {
  TIENDA_EC: { oficina: 1, domicilio: 5, respaldo: 1 },   // 1 Servientrega · 5 Gintracom
};
// Transportadoras que en Effi piden además las medidas del paquete (alto, ancho, largo en cm): Servientrega,
// Coordinadora, Laarcourier y CAEX. Sin medidas Effi responde HTTP 500 vacío, y sin volumen "Volumen total es
// obligatorio": van las dos cosas. Regla del dueño: las medidas siempre son 1×1×1.
const MEDIDAS: Record<string, Record<number, { alto: number; ancho: number; largo: number }>> = {
  TIENDA_EC: { 1: { alto: 1, ancho: 1, largo: 1 }, 3: { alto: 1, ancho: 1, largo: 1 } },   // 1 Servientrega · 3 Laarcourier
  TIENDA_CO: { 6: { alto: 1, ancho: 1, largo: 1 }, 10: { alto: 1, ancho: 1, largo: 1 } }, // 6 Servientrega · 10 Coordinadora
};

// Cliente con "**" al inicio: pedido con abono. El agente no lo toca (ni remisión ni guía): lo hace una persona en Effi.
const conAbono = (nombre: unknown) => String(nombre ?? '').trim().startsWith('**');

// ---------------------------------------------------------------------------------------------------------------------
// Colombia (reglas del dueño, 27-oct; ver tools/propuestas/reglas-envio-colombia.md). La mercancía sale siempre de
// Bogotá. Transportadoras habilitadas: 1 Envía, 4 Inter, 6 Servientrega, 10 Coordinadora (sin TCC ni Domina).
// La persona escoge en "Ejecutar"; aquí solo se arma lo que se le muestra: la opción de la asesora logística y la ⭐
// recomendada por la matriz de entrega (mayor % de entrega a esa ciudad, auto_matriz_entrega; desde el 28-oct).
const CO_HABILITADAS = [1, 4, 6, 10];
const VALLE_ABURRA = ['MEDELLIN', 'ENVIGADO', 'ITAGUI', 'SABANETA', 'LA ESTRELLA', 'CALDAS', 'COPACABANA', 'GIRARDOTA', 'BARBOSA'];
// Entrega en oficina de Inter (4) o de Servientrega (6): en Colombia esas órdenes van solas, sin pasar por la lista
// (regla del dueño, 27-oct). Las demás siguen siendo manuales.
const oficinaCO = (direccion: unknown) => {
  const d = norm(String(direccion ?? ''));
  if (!/OFICINA|\bOF\b|RECLAM/.test(d)) return null;
  return /INTER ?RAPIDISIMO/.test(d) ? 4 : /SERVIENTREGA/.test(d) ? 6 : null;
};
// deMatriz: la regla no es de las asesoras sino de la matriz (la ciudad solo tiene datos de Inter).
function asesoraCO(direccion: string, ciudad: string, dpto: string, soloInter: boolean): { id: number; regla: string; deMatriz?: boolean } | null {
  const d = norm(direccion ?? ''), c = norm(ciudad ?? '').replace(/\s*D\.?\s*C\.?$/, ''), dp = norm(dpto ?? '');
  const ofi = oficinaCO(direccion);
  if (ofi === 4) return { id: 4, regla: 'Reclama en oficina Interrapidísimo' };
  if (ofi === 6) return { id: 6, regla: 'Reclama en oficina Servientrega' };
  if (VALLE_ABURRA.includes(c) && dp === 'ANTIOQUIA') {
    if (/\bENCISO\b|SANTO DOMINGO|BELENCITO|\bPOPULAR\b|SAN JAVIER|ROBLEDO|MORAVIA/.test(d)) return { id: 1, regla: 'Medellín: barrio popular (Coordinadora genera devoluciones)' };
    return { id: 10, regla: 'Medellín y Valle de Aburrá' };
  }
  if (c === 'BELLO') {
    return /CABANAS|SANTA ANA|NIQUIA|\bCENTRO\b/.test(d) ? { id: 10, regla: 'Bello: Cabañas, Santa Ana, Niquía o centro' } : { id: 1, regla: 'Bello' };
  }
  if (c === 'CALI') return { id: 10, regla: 'Cali' };
  if (['BARRANQUILLA', 'SANTA MARTA', 'CUCUTA', 'MONTERIA', 'BOGOTA'].includes(c)) return { id: 1, regla: ciudad };
  if (['FLORENCIA', 'BARRANCABERMEJA', 'MANIZALES', 'PASTO', 'POPAYAN', 'NEIVA', 'IBAGUE', 'BUCARAMANGA'].includes(c)) return { id: 6, regla: ciudad };
  if (dp === 'TOLIMA') return { id: 1, regla: 'Tolima' };
  if (soloInter) return { id: 4, regla: 'Pueblo o zona alejada (solo llega Inter)', deMatriz: true };
  if (dp === 'ATLANTICO' || dp === 'MAGDALENA' || c.startsWith('BUENAVENTURA')) return { id: 4, regla: 'Atlántico, Magdalena o Buenaventura' };
  return null;
}
async function recomendacionCO(direccion: string, ciudad: string, dpto: string) {
  const r = (await rpc('auto_matriz_ruta', { p_destino: ciudad ?? '', p_dpto: dpto ?? '' })) as Json;
  const opciones = ((r?.opciones ?? []) as Json[]).filter((o) => CO_HABILITADAS.includes(Number(o.id)));
  const recomendada = CO_HABILITADAS.includes(Number(r?.recomendada)) ? Number(r.recomendada) : null;
  const asesora = asesoraCO(direccion, ciudad, dpto, !!r?.solo_inter);
  // Regla del dueño (28-oct): si la regla de las asesoras y la ⭐ de la matriz dicen la misma transportadora, va sola
  // (remisión y guía, o solo la guía de una remisión hecha a mano), aunque Colombia esté en Manual.
  const coincide = asesora && !asesora.deMatriz && asesora.id === recomendada ? asesora.id : null;
  return { asesora, numeros: { nivel: r?.nivel ?? null, recomendada, opciones }, coincide };
}
// Transportadora por defecto para Colombia: la de la asesora; si no hay, la ⭐; si no, la que traía el plan.
const escogerCO = (reglas: Json, rec: Awaited<ReturnType<typeof recomendacionCO>>, porDefecto: { t: Json; motivo: string }) => {
  const id = rec.asesora?.id ?? rec.numeros.recomendada;
  const t = id ? reglas?.transportes?.[String(id)] : null;
  if (!t) return porDefecto;
  return { t, motivo: rec.asesora ? `Asesora: ${rec.asesora.regla}` : '⭐ Mayor % de entrega a esa ciudad (matriz de entrega)' };
};
// Valor declarado en Colombia según la transportadora: Servientrega e Inter el valor del recaudo (Inter mínimo $45.000);
// Envía $10.000; Coordinadora el valor del pedido hasta $100.000.
const declaradoCO = (transportadora: number, total: number) =>
  transportadora === 1 ? 10_000 : transportadora === 10 ? Math.min(total, 100_000) : transportadora === 4 ? Math.max(total, 45_000) : total;
const conMedidas = (cuenta: string, guia: Json) => {
  const m = MEDIDAS[cuenta]?.[Number(guia.transportadora)];
  if (!m || guia.alto) return guia;
  return { ...guia, ...m, volumen_total: guia.volumen_total || 1, idempotency_key: `${guia.idempotency_key}-m` };
};

type Json = Record<string, any>;

async function rpc(fn: string, body: unknown) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Se revisa antes de cada creación: si el dueño pausó el automático, la corrida se detiene ahí mismo.
const sigueAutomatico = async (cuenta: string) =>
  ((await tabla(`auto_config?cuenta=eq.${cuenta}&select=modo`))[0]?.modo === 'automatico');

class Effi {
  private ultimo = 0;
  constructor(private key: string) {}
  async get(recurso: string, params: Record<string, string | number>): Promise<{ data: Json[]; paginas: number; total: number }> {
    const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
    let res: Response, j: Json | null;
    // Si Effi responde "Demasiadas peticiones" (429), se espera lo que pida y se reintenta en vez de cortar la corrida.
    for (let intento = 0; ; intento++) {
      const espera = this.ultimo + MIN_GAP_MS - Date.now();
      if (espera > 0) await sleep(espera);
      this.ultimo = Date.now();
      res = await fetch(`${EFFI_API}/${recurso}?${qs}`, { headers: { Authorization: `Bearer ${this.key}`, Accept: 'application/json' } });
      if (res.status !== 429 || intento >= 4) break;
      await sleep(1000 * Math.min(30, Number(res.headers.get('retry-after')) || 8));
    }
    j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) throw new Error(`${recurso} HTTP ${res.status}: ${j?.mensaje ?? 'sin respuesta'}`);
    return { data: j.data ?? [], paginas: Number(j.paginacion?.total_paginas ?? 1), total: Number(j.paginacion?.total ?? 0) };
  }
  // Crear en Effi: devuelve la respuesta tal cual (ok o el mensaje de error de Effi), sin lanzar excepción. Si Effi
  // responde "Demasiadas peticiones" (429) no procesó nada: se espera lo que pida y se reintenta.
  async post(recurso: string, cuerpo: Json): Promise<{ status: number; ok: boolean; respuesta: Json | null }> {
    let res: Response;
    for (let intento = 0; ; intento++) {
      const espera = this.ultimo + MIN_GAP_MS - Date.now();
      if (espera > 0) await sleep(espera);
      this.ultimo = Date.now();
      res = await fetch(`${EFFI_API}/${recurso}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.key}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });
      if (res.status !== 429 || intento >= 4) break;
      await res.text().catch(() => '');
      await sleep(1000 * Math.min(30, Number(res.headers.get('retry-after')) || 8));
    }
    const texto = await res.text();
    let j: Json | null = null;
    try { j = JSON.parse(texto); } catch { j = { texto: texto.slice(0, 2000) }; }
    return { status: res.status, ok: res.ok && j?.ok === true, respuesta: j };
  }
  async todas(recurso: string, params: Record<string, string | number>, maxPaginas = 8) {
    let out: Json[] = [];
    for (let p = 1; p <= maxPaginas; p++) {
      const r = await this.get(recurso, { ...params, por_pagina: 100, pagina: p });
      out = out.concat(r.data);
      if (p >= r.paginas) break;
    }
    return out;
  }
}

const masComun = <T,>(xs: T[]) => {
  const c = new Map<string, { v: T; n: number }>();
  for (const x of xs) { const k = JSON.stringify(x); c.set(k, { v: x, n: (c.get(k)?.n ?? 0) + 1 }); }
  return [...c.values()].sort((a, b) => b.n - a.n)[0]?.v;
};
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
// "3 * DRENAJE LINFATICO 59ML. 1 * OFTALMIEL. " → [{cant: 3, nombre: 'DRENAJE LINFATICO 59ML'}, ...]
const lineas = (contenido: string) => [...contenido.matchAll(/(\d+)\s*\*\s*([^.]+)\./g)].map((m) => ({ cant: Number(m[1]), nombre: norm(m[2]) }));
// Entrega en oficina o punto de servicio de la transportadora (regla del dueño: todo eso va por Servientrega):
// "Oficina Servientrega QUEVEDO…", "RETIRA EN CS TULCAN…", "RECLAMA EN SERVIENTREGA MACHALA…", "recoge en oficina",
// "va a oficina", "punto de servicio".
const esOficina = (direccion: string) =>
  /\bOFICINA\b|\bPUNTO DE SERVICIO\b|\bRETIR(A|O|AR)\b|\bRECLAM(A|AR)\b|\bRECOG(E|ER)\b|\bEN SERVIENTREGA\b|\bCS\b/.test(norm(direccion ?? ''));
// Regla del dueño para todos los países: 1 paquete, 1 kg y volumen 1. Contenido y valor declarado se copian del
// documento de venta (contenido_check y valor_declarado_check en cada guía).
const camposTransporte = (t: Json) => ({
  transportadora: t.transportadora, t_servicio: t.t_servicio, t_forma_pago: t.t_forma_pago,
  cant_paquetes: 1, peso_total: 1, volumen_total: 1,
});

// Transportadora para un destino. Guatemala: la de siempre. Ecuador: oficina → Servientrega; ciudad sin cobertura
// de Gintracom (memoria o historial) → Servientrega; el resto → Gintracom.
function elegirTransporte(cuenta: string, reglas: Json, memoria: Set<number>, direccion: string, ciudad: number, nombreCiudad: string) {
  const tp = TRANSPORTE_PAIS[cuenta];
  if (!tp) return reglas?.transporte ? { t: { ...reglas.transporte, nombre: reglas.nombreTransportadora } as Json, motivo: '' } : null;
  const de = (id: number) => (reglas?.transportes?.[String(id)] ?? null) as Json | null;
  let id = tp.domicilio, motivo = 'entrega a domicilio';
  if (esOficina(direccion)) { id = tp.oficina; motivo = 'entrega en oficina'; }
  else if (memoria.has(ciudad) || reglas?.sinCobertura?.[String(ciudad)]) {
    id = tp.respaldo;
    motivo = `${String(de(tp.domicilio)?.nombre ?? 'la transportadora').split('|')[0].trim()} no tiene cobertura en ${nombreCiudad}`;
  }
  const t = de(id);
  return t ? { t, motivo } : null;
}

const primeraGuia = (g: { respuesta: Json | null }) => {
  const d = g.respuesta?.data as Json | undefined;
  return (Array.isArray(d) ? d[0] : d?.guias?.[0] ?? d) as Json | undefined;
};
const fallaGuia = (g: { ok: boolean }, p: Json | undefined) => !g.ok || (!!p && String(p.vigente) === '0');
const detalleGuia = (g: { status: number; respuesta: Json | null }, p: Json | undefined) => {
  const d = g.respuesta?.mensaje ?? p?.response ?? `HTTP ${g.status}`;
  return typeof d === 'string' ? d : JSON.stringify(d);
};

// "Demasiadas peticiones" es Effi pidiendo calma, no un rechazo de la transportadora.
const esLimite = (g: { status: number; respuesta: Json | null }, p: Json | undefined) =>
  g.status === 429 || /demasiadas peticiones/i.test(detalleGuia(g, p));

// Crea la guía. En Ecuador, si la transportadora de domicilio no la deja hacer, la ciudad queda en la memoria de
// cobertura y se repite con la de respaldo. Si el fallo es el límite de peticiones de Effi, no se toca la memoria ni
// se cambia de transportadora: la guía se reintenta en la próxima corrida. Con "fija" (el dueño escogió la
// transportadora) nunca se cambia por otra. Si Effi responde 500 vacío (pide las medidas del paquete), se repite con 1×1×1.
async function hacerGuia(api: Effi, cuenta: string, reglas: Json, guia: Json, destino: { ciudad: number; nombre: string },
  ev: (ok: boolean | null, mensaje: string, datos?: Json | null) => Promise<unknown>, fija = false) {
  guia = conMedidas(cuenta, guia);
  let g = await api.post('guia_transporte', guia);
  if (g.status === 500 && !guia.alto && !(g.respuesta?.texto ?? '').trim()) {
    guia = { ...guia, alto: 1, ancho: 1, largo: 1, volumen_total: guia.volumen_total || 1, idempotency_key: `${guia.idempotency_key}-m` };
    g = await api.post('guia_transporte', guia);
  }
  let p = primeraGuia(g);
  const tp = TRANSPORTE_PAIS[cuenta];
  const respaldo = tp && reglas?.transportes?.[String(tp.respaldo)];
  if (!fija && fallaGuia(g, p) && !esLimite(g, p) && tp && respaldo && Number(guia.transportadora) === tp.domicilio) {
    const detalle = detalleGuia(g, p);
    await rpc('auto_sin_cobertura', { p_cuenta: cuenta, p_transportadora: tp.domicilio, p_ciudad: destino.ciudad, p_nombre_ciudad: destino.nombre, p_motivo: detalle });
    await ev(null, `Gintracom no dejó hacer la guía (${detalle}). Se hace con Servientrega y ${destino.nombre} queda en la memoria de cobertura`, { enviado: guia, respuesta: g.respuesta, status: g.status });
    guia = conMedidas(cuenta, { ...guia, ...camposTransporte(respaldo), idempotency_key: `${guia.idempotency_key}-resp` });
    g = await api.post('guia_transporte', guia);
    p = primeraGuia(g);
  }
  return { g, p, guia, ok: !fallaGuia(g, p), detalle: detalleGuia(g, p) };
}

// Remisiones que Effi rechaza siempre igual y no se reintentan: ninguna transportadora tiene cobertura en la ciudad, o
// el cliente ya tiene una guía vigente igual (posible pedido repetido). Quedan pendientes en "Novedad en la orden" para
// que una persona decida. Devuelve remisión → lo que respondió Effi.
async function sinCoberturaTotal(cuenta: string) {
  const desde = new Date(Date.now() - 7 * DAY_MS).toISOString();
  const filas: { mensaje: string }[] = await tabla(
    `auto_eventos?cuenta=eq.${cuenta}&paso=eq.guia&ok=is.false&creado_en=gte.${desde}&select=mensaje` +
    '&or=(mensaje.ilike.*No%20hay%20cobertura*Servientrega*,mensaje.ilike.*Ya%20existe%20una%20gu*a%20de%20transporte%20vigente*)');
  return new Map(filas.map((f) => [Number(f.mensaje.match(/remisión (\d+)/)?.[1]), f.mensaje.replace(/^.*?: /, '')] as const).filter(([id]) => id));
}

// Memoria de cobertura: ciudades donde la transportadora de domicilio no dejó hacer guías.
async function memoriaCobertura(cuenta: string) {
  const tp = TRANSPORTE_PAIS[cuenta];
  if (!tp) return new Set<number>();
  const filas: { ciudad: number }[] = await tabla(`auto_cobertura?cuenta=eq.${cuenta}&transportadora=eq.${tp.domicilio}&select=ciudad`);
  return new Set(filas.map((f) => Number(f.ciudad)));
}

// Reglas aprendidas de las guías de los últimos 10 días: remitente por convenio y parámetros de la transportadora.
async function aprenderReglas(api: Effi, off: number, cuenta: string) {
  const hoy = new Date(Date.now() + off * 60_000);
  const desde = new Date(hoy.getTime() - 10 * DAY_MS).toISOString().slice(0, 10);
  const hasta = new Date(hoy.getTime() + DAY_MS).toISOString().slice(0, 10);
  const guias = await api.todas('guia_transporte', { desde, hasta }, PAGINAS_REGLAS);
  const rems = await api.todas('remision_v', { desde, hasta }, PAGINAS_REGLAS);
  const convenioDe = new Map(rems.map((r) => [`${r.sucursal}-${r.id}`, r.convenio_dropshipping]));
  const conDoc = guias.filter((g) => String(g.t_trans_ref) === '4' && g.vigente !== '0');
  const remitentes: Record<string, string> = {};
  const porConvenio = new Map<string, string[]>();
  for (const g of conDoc) {
    const conv = convenioDe.get(`${g.sucursal_ref}-${g.id_ref}`);
    if (!conv) continue;
    porConvenio.set(conv, [...(porConvenio.get(conv) ?? []), String(g.remitente)]);
  }
  for (const [conv, xs] of porConvenio) remitentes[conv] = masComun(xs)!;
  const transporte = masComun(conDoc.map((g) => ({
    transportadora: Number(g.transportadora), t_servicio: Number(g.id_t_servicio), t_forma_pago: Number(g.t_forma_pago),
    cant_paquetes: Number(g.cant_paquetes), peso_total: Number(g.peso_total),
  })));
  const nombreTransportadora = masComun(conDoc.map((g) => String(g.nombre_transportadora)));
  const formaPagoRemision = masComun(rems.filter((r) => r.vigente !== '0').map((r) => Number(r.t_forma_pago)));
  // Parámetros de cada transportadora (Ecuador usa dos, con forma de pago distinta).
  const transportes: Record<string, Json> = {};
  for (const id of new Set(conDoc.map((g) => String(g.transportadora)))) {
    const xs = conDoc.filter((g) => String(g.transportadora) === id);
    transportes[id] = {
      ...masComun(xs.map((g) => ({
        transportadora: Number(g.transportadora), t_servicio: Number(g.id_t_servicio), t_forma_pago: Number(g.t_forma_pago),
        cant_paquetes: Number(g.cant_paquetes), peso_total: Number(g.peso_total),
      }))),
      nombre: masComun(xs.map((g) => String(g.nombre_transportadora))), guias: xs.length,
    };
  }
  // Ciudades donde a domicilio solo se ha despachado con la de respaldo: ahí la de domicilio no tiene cobertura.
  let sinCobertura: Record<string, string> | undefined;
  const tp = TRANSPORTE_PAIS[cuenta];
  if (tp) {
    const porCiudad = new Map<string, { nombre: string; dom: number; resp: number }>();
    for (const g of conDoc) {
      if (esOficina(g.direccion_destinatario)) continue;
      const c = porCiudad.get(String(g.ciudad_destinatario)) ?? { nombre: String(g.nombre_ciudad_destinatario ?? ''), dom: 0, resp: 0 };
      if (Number(g.transportadora) === tp.domicilio) c.dom++;
      else if (Number(g.transportadora) === tp.respaldo) c.resp++;
      porCiudad.set(String(g.ciudad_destinatario), c);
    }
    sinCobertura = Object.fromEntries([...porCiudad].filter(([, c]) => c.dom === 0 && c.resp > 0).map(([k, c]) => [k, c.nombre]));
  }
  return { remitentes, transporte, nombreTransportadora, formaPagoRemision, transportes, sinCobertura, guias_vistas: conDoc.length };
}

// ahora = "Ejecutar ahora" del dueño: crea lo que esté listo aunque el país esté en Manual.
async function convertir(cuenta: string, ahora = false) {
  const [cfg] = await tabla(`auto_config?cuenta=eq.${cuenta}&select=modo,reglas,reglas_en`);
  if (!cfg || !['simular', 'automatico'].includes(cfg.modo)) return { omitida: 'modo sin conversión' };
  const keys: { slug: string; api_key: string }[] = await rpc('effi_get_api_keys', {});
  const key = keys.find((k) => k.slug === cuenta)?.api_key;
  if (!key) throw new Error('Sin API key');
  const [acc] = await tabla(`effi_accounts?slug=eq.${cuenta}&select=tz_offset_min`);
  const off = Number(acc?.tz_offset_min ?? 0);
  const api = new Effi(key);

  // Reglas (se recalculan cada 6 horas).
  let reglas = cfg.reglas;
  let reglasNuevas: Json | null = null;
  if (!reglas || !cfg.reglas_en || Date.now() - Date.parse(cfg.reglas_en) > REGLAS_HORAS * 3600_000) {
    reglas = reglasNuevas = await aprenderReglas(api, off, cuenta);
  }
  const memoria = await memoriaCobertura(cuenta);

  // Órdenes vigentes sin remisión de los últimos 3 días.
  const hoy = new Date(Date.now() + off * 60_000);
  const desde = new Date(hoy.getTime() - 3 * DAY_MS).toISOString().slice(0, 10);
  const hasta = new Date(hoy.getTime() + DAY_MS).toISOString().slice(0, 10);
  // Van primero las que nunca se han preparado y luego las preparadas hace más tiempo: con muchas órdenes (Colombia, ~40
  // por hora) tomar siempre las 15 primeras de la lista dejaba el resto sin preparar (28-oct).
  const sinRemision = (await api.todas('orden_v', { desde, hasta, vigente: 1 })).filter((o) => !o.id_remision_v);
  const preparadas = new Map<string, number>();
  for (let i = 0; i < sinRemision.length; i += 150) {
    const ids = sinRemision.slice(i, i + 150).map((o) => o.id).join(',');
    for (const g of await tabla(`auto_ordenes?cuenta=eq.${cuenta}&id=in.(${ids})&plan_en=not.is.null&select=sucursal,id,plan_en`)) {
      preparadas.set(`${g.sucursal}-${g.id}`, Date.parse(g.plan_en));
    }
  }
  const pendientes = sinRemision
    .map((o, i) => ({ o, i, t: preparadas.get(`${o.sucursal}-${o.id}`) ?? 0 }))
    .sort((a, b) => a.t - b.t || a.i - b.i)
    .slice(0, MAX_ORDENES)
    .map((x) => x.o);
  const planesGuia = await planearGuias(api, cuenta, reglas, memoria, await sinCoberturaTotal(cuenta), desde, hasta);
  if (!pendientes.length) {
    await rpc('auto_guardar_plan', { p_cuenta: cuenta, p_planes: planesGuia, p_reglas: reglasNuevas });
    return { pendientes: 0, guias: planesGuia.length };
  }

  // Artículos de la empresa (sin el concepto FLETE) y lo ya detectado antes. "nombre" va normalizado para comparar;
  // "descripcion" es el nombre exacto de Effi, que es el que va en la remisión: con el nombre sin tildes Effi no arma la
  // transacción de dropshipping ("Error al intentar crear la transacción Dropshipping", Colombia, 27-oct).
  const articulos = (await api.todas('articulo', {})).filter((a) => a.vigente !== '0' && norm(a.descripcion ?? '') !== 'FLETE')
    .map((a) => ({ id: Number(a.id), nombre: norm(a.descripcion ?? ''), descripcion: String(a.descripcion ?? '') }));
  const guardadas: Json[] = await tabla(`auto_ordenes?cuenta=eq.${cuenta}&id=in.(${pendientes.map((o) => o.id).join(',')})&select=sucursal,id,articulos`);
  const historial: { total: string; contenido: string; n: number }[] = await rpc('auto_historial_contenido', { p_cuenta: cuenta });
  const [centros] = await tabla(`auto_config?cuenta=eq.${cuenta}&select=centro_normal,centro_recuperado`);
  // Detalle de las órdenes pendientes (api/detalle_orden_v: artículo, cantidad y precio de cada concepto, 29-oct): la
  // cantidad sale de la orden y ya no se adivina con las guías anteriores (un producto nuevo quedaba "sin antecedentes").
  // La fila no trae la sucursal: la orden se reconoce por id y fecha. Si la llave no tiene permiso de reportes, sigue
  // la detección por artículo y antecedentes de antes.
  // Solo se filtra por "desde": con vigente, hasta o est_facturacion Effi responde vacío (29-oct); lo vigente y sin
  // remisión se escoge aquí. Hasta 1000 filas por página.
  const detalle = new Map<string, Json[]>();
  try {
    for (let p = 1; p <= 10; p++) {
      const r = await api.get('detalle_orden_v', { desde, por_pagina: 1000, pagina: p });
      for (const f of r.data) {
        if (f.vigente !== '1' || f.id_remision_v) continue;
        const k = `${f.id_orden_v}|${f.fecha_trans}`;
        detalle.set(k, [...(detalle.get(k) ?? []), f]);
      }
      if (p >= r.paginas) break;
    }
  } catch (_) { /* sin permiso de reportes: queda el método de antes */ }

  const planes: Json[] = [];
  for (const o of pendientes) {
    const plan: Json = {};
    const revision = (motivo: string) => planes.push({ sucursal: Number(o.sucursal), id: Number(o.id), articulos: plan.articulos ?? null, estado: 'revision', motivo, plan });
    if (conAbono(o.nombre_cliente)) { plan.abono = true; revision('Con abono: el agente no la toca, hacer el proceso a mano en Effi'); continue; }

    // 0. Conceptos de la orden con su cantidad y precio. Solo se usan si todos son artículos de venta (sin FLETE) y sin
    // impuestos, y si cuadran con el total de la orden; si no, se sigue con el método de antes.
    const filasDetalle = (detalle.get(`${o.id}|${o.fecha_trans}`) ?? []).filter((l) => Number(l.cantidad) > 0);
    let conceptos: { id: number; nombre: string; descripcion: string; cantidad: number; precio: number; descuento: number }[] | null =
      filasDetalle.length && filasDetalle.every((l) => Number(l.impuestos ?? 0) === 0 && articulos.some((a) => a.id === Number(l.articulo)))
        ? filasDetalle.map((l) => {
            const a = articulos.find((x) => x.id === Number(l.articulo))!;
            return { id: a.id, nombre: a.nombre, descripcion: a.descripcion, cantidad: Number(l.cantidad), precio: Number(l.p_venta), descuento: Number(l.descuento ?? 0) };
          })
        : null;
    if (conceptos && Math.abs(conceptos.reduce((t, c) => t + c.cantidad * c.precio - c.descuento, 0) - Number(o.total)) > 0.01) conceptos = null;
    const deLaOrden = !!conceptos;

    // 1. Productos de la orden (del detalle o, si no, con el filtro por artículo; se guarda para no repetir).
    let det = conceptos ? conceptos.map((c) => ({ id: c.id, nombre: c.nombre })) : guardadas.find((g) => Number(g.id) === Number(o.id) && Number(g.sucursal) === Number(o.sucursal))?.articulos as { id: number; nombre: string }[] | null;
    if (!det) {
      det = [];
      for (const a of articulos) {
        const r = await api.get('orden_v', { id: o.id, sucursal: o.sucursal, articulo: a.id, desde, hasta, por_pagina: 1, pagina: 1 });
        if (r.total > 0) det.push(a);
      }
    }
    plan.articulos = det;
    if (!det.length) { revision('No se pudo identificar el producto de la orden'); continue; }

    // 2. Convenio (el que trae la orden) y centro de costos.
    const convenio = String(o.observacion ?? '').match(/Dropshipping:\s*([A-Za-z0-9]+)/)?.[1];
    if (!convenio) { revision('La orden no trae convenio de dropshipping'); continue; }
    const recuperado = String(o.nombre_cliente ?? '').trim().startsWith('*');
    const centro = recuperado ? centros.centro_recuperado : centros.centro_normal;

    // 3. Cantidades: las de la orden (detalle) o la combinación de productos y total que ya existe en las guías.
    const total = Number(o.total);
    const nombres = det.map((a) => a.nombre).sort().join('|');
    const candidatas = conceptos ? [] : historial
      .filter((h) => Math.abs(Number(h.total) - total) < 0.005)
      .map((h) => ({ l: lineas(h.contenido), n: Number(h.n) }))
      .filter((h) => h.l.length && h.l.map((x) => x.nombre).sort().join('|') === nombres)
      .sort((a, b) => b.n - a.n);
    if (!conceptos && !candidatas.length) {
      revision(`Sin antecedentes de cantidad: ${det.map((a) => a.nombre).join(' + ')} por ${total.toFixed(2)}`);
      continue;
    }
    if (!conceptos && det.length > 1) { revision('La orden trae varios productos: el precio de cada uno no se puede saber'); continue; }
    if (!conceptos) {
      const cant = candidatas[0].l[0].cant;
      const precio = Math.round((total / cant) * 100) / 100;
      if (Math.abs(precio * cant - total) > 0.005) { revision(`El total ${total.toFixed(2)} no se divide exacto en ${cant} unidades`); continue; }
      const a = det[0];
      conceptos = [{ id: Number(a.id), nombre: a.nombre, descripcion: articulos.find((x) => x.id === Number(a.id))?.descripcion || a.nombre, cantidad: cant, precio, descuento: 0 }];
    }
    const cantidad = conceptos.reduce((t, c) => t + c.cantidad, 0);
    const precio = conceptos[0].precio;

    // 4. Remitente según el convenio.
    const remitente = reglas?.remitentes?.[convenio];
    if (!remitente) { revision(`No hay guías anteriores con el convenio ${convenio} para saber el remitente`); continue; }
    let elegido = elegirTransporte(cuenta, reglas, memoria, String(o.direccion_cliente ?? ''), Number(o.ciudad_cliente), String(o.nombre_ciudad ?? ''));
    if (!elegido) { revision('No hay guías anteriores para saber la transportadora'); continue; }
    const rec = cuenta === 'TIENDA_CO' ? await recomendacionCO(String(o.direccion_cliente ?? ''), String(o.nombre_ciudad ?? ''), String(o.nombre_provincia ?? '')) : null;
    if (rec) elegido = escogerCO(reglas, rec, elegido);

    plan.remision = {
      idempotency_key: `torre-rv-${o.sucursal}-${o.id}`,
      action: 3,
      json_ref: JSON.stringify([{ sucursal: Number(o.sucursal), id: Number(o.id) }]),
      sucursal: Number(o.sucursal), bodega: Number(o.bodega ?? 1), centro_costos: centro,
      fecha_entrega: String(o.fecha_entrega ?? '').slice(0, 10), divisa: DIVISA[cuenta] ?? 'GTQ', trm: 1,
      cliente: o.cliente, id_pais_cliente: Number(o.pais_cliente), id_provincia_cliente: Number(o.provincia_cliente),
      id_ciudad_cliente: Number(o.ciudad_cliente), direccion_cliente: o.direccion_cliente,
      convenio_dropshipping: convenio,
      articulo: conceptos.map((c) => c.id), descripcion: conceptos.map((c) => c.descripcion),
      cantidad: conceptos.map((c) => c.cantidad), precio: conceptos.map((c) => c.precio),
      ...(conceptos.some((c) => c.descuento > 0) ? { descuento: conceptos.map((c) => c.descuento) } : {}),
      t_forma_pago: [reglas.formaPagoRemision], valor_forma_pago: [total],
    };
    plan.guia = {
      idempotency_key: `torre-gt-${o.sucursal}-${o.id}`,
      sucursal: Number(o.sucursal), ...camposTransporte(elegido.t),
      contenido_check: true, valor_declarado_check: true,
      t_trans_ref: [4], sucursal_ref: [Number(o.sucursal)], id_ref: ['(id de la remisión creada)'],
      centro_costos: [centro], remitente: [Number(remitente)], destinatario: [o.cliente],
      id_pais_destinatario: [Number(o.pais_cliente)], id_provincia_destinatario: [Number(o.provincia_cliente)],
      id_ciudad_destinatario: [Number(o.ciudad_cliente)], direccion_destinatario: [o.direccion_cliente],
    };
    plan.resumen = {
      producto: conceptos.length > 1 ? conceptos.map((c) => `${c.cantidad} × ${c.nombre}`).join(' + ') : conceptos[0].nombre,
      cantidad, precio, total, convenio, recuperado, centro, varios: conceptos.length > 1, fuente: deLaOrden ? 'orden' : 'guias',
      remitente: Number(remitente), transportadora: elegido.t.nombre, motivo_transportadora: elegido.motivo, ciudad: o.nombre_ciudad,
      antecedentes: candidatas[0]?.n ?? null, ...(rec ? { recomendacion: rec } : {}),
    };
    planes.push({ sucursal: Number(o.sucursal), id: Number(o.id), articulos: det, estado: 'lista', motivo: null, plan });
  }

  const n = await rpc('auto_guardar_plan', { p_cuenta: cuenta, p_planes: [...planes, ...planesGuia], p_reglas: reglasNuevas });
  const salida: Json = { pendientes: pendientes.length, planes: planes.length, listas: planes.filter((p) => p.estado === 'lista').length, guardadas: n };
  if ((cfg.modo === 'automatico' || ahora) && PAISES_REMISION.includes(cuenta)) {
    salida.creadas = [];
    for (const p of planes.filter((x) => x.estado === 'lista').slice(0, MAX_CREAR)) {
      if (!ahora && !(await sigueAutomatico(cuenta))) break;
      salida.creadas.push(await crear(cuenta, p.sucursal, p.id, true));
    }
  }
  return salida;
}

// Guía de una remisión ya hecha en Effi (contenido, valor declarado y recaudo salen de la remisión).
const guiaDeRemision = (r: Json, t: Json, remitente: string | number, centro: number) => ({
  idempotency_key: `torre-gt-rv-${r.sucursal}-${r.id}`,
  sucursal: Number(r.sucursal), ...camposTransporte(t),
  contenido_check: true, valor_declarado_check: true,
  t_trans_ref: [4], sucursal_ref: [Number(r.sucursal)], id_ref: [Number(r.id)],
  centro_costos: [Number(r.centro_costos ?? centro)], remitente: [Number(remitente)], destinatario: [r.cliente],
  id_pais_destinatario: [Number(r.pais_cliente)], id_provincia_destinatario: [Number(r.provincia_cliente)],
  id_ciudad_destinatario: [Number(r.ciudad_cliente)], direccion_destinatario: [r.direccion_cliente],
});

// Plan de guía de las remisiones vigentes sin guía (en Ecuador las remisiones las hace una persona a mano): se guarda
// en la orden de origen, con la transportadora que toca y el porqué. No crea nada.
async function planearGuias(api: Effi, cuenta: string, reglas: Json, memoria: Set<number>, sinCobertura: Map<number, string>,
  desde: string, hasta: string) {
  const rems = (await api.todas('remision_v', { desde, hasta, vigente: 1 }, PAGINAS_REGLAS))
    .filter((r) => r.vigente !== '0' && !r.id_guia_transporte && r.convenio_dropshipping && Number(r.total) > 0 && !conAbono(r.nombre_cliente));
  if (!rems.length) return [];
  const ordenes: Json[] = await tabla(`auto_ordenes?cuenta=eq.${cuenta}&id_remision=in.(${rems.map((r) => r.id).join(',')})&select=sucursal,id,sucursal_remision,id_remision,guia`);
  const [centros] = await tabla(`auto_config?cuenta=eq.${cuenta}&select=centro_normal,centro_recuperado`);
  const planes: Json[] = [];
  for (const r of rems) {
    const o = ordenes.find((x) => Number(x.id_remision) === Number(r.id) && Number(x.sucursal_remision) === Number(r.sucursal));
    if (!o || o.guia) continue;
    const base = { sucursal: Number(o.sucursal), id: Number(o.id) };
    const plan: Json = { remision_existente: { sucursal: Number(r.sucursal), id: Number(r.id) } };
    const cobertura = sinCobertura.get(Number(r.id));
    if (cobertura) {
      const repetido = /Ya existe una gu.a de transporte vigente/.test(cobertura);
      planes.push({ ...base, estado: 'revision', plan, motivo: repetido
        ? `Pendiente: el cliente ya tiene una guía vigente igual, posible pedido repetido (Effi: ${cobertura}). Una persona revisa y decide.`
        : `Pendiente: ninguna transportadora cubre ${r.nombre_ciudad ?? 'la ciudad'} (Effi: ${cobertura}). Una persona revisa y decide.` });
      continue;
    }
    const remitente = reglas?.remitentes?.[r.convenio_dropshipping];
    if (!remitente) { planes.push({ ...base, estado: 'revision', motivo: `No hay guías anteriores con el convenio ${r.convenio_dropshipping} para saber el remitente`, plan }); continue; }
    let elegido = elegirTransporte(cuenta, reglas, memoria, String(r.direccion_cliente ?? ''), Number(r.ciudad_cliente), String(r.nombre_ciudad ?? ''));
    if (!elegido) { planes.push({ ...base, estado: 'revision', motivo: 'No hay guías anteriores para saber la transportadora', plan }); continue; }
    const rec = cuenta === 'TIENDA_CO' ? await recomendacionCO(String(r.direccion_cliente ?? ''), String(r.nombre_ciudad ?? ''), String(r.nombre_provincia ?? '')) : null;
    if (rec) elegido = escogerCO(reglas, rec, elegido);
    plan.guia = guiaDeRemision(r, elegido.t, remitente, centros.centro_normal);
    plan.resumen = {
      solo_guia: true, remision: Number(r.id_transaccion ?? r.id), total: Number(r.total), ciudad: r.nombre_ciudad,
      transportadora: elegido.t.nombre, motivo_transportadora: elegido.motivo, remitente: Number(remitente),
      recuperado: Number(r.centro_costos) === Number(centros.centro_recuperado), ...(rec ? { recomendacion: rec } : {}),
    };
    planes.push({ ...base, estado: 'lista', motivo: null, plan });
  }
  return planes;
}

// Automático: guía para las remisiones vigentes sin guía de los últimos 3 días (las que hizo alguien a mano o las que
// quedaron sin guía por un error), con más de ESPERA_GUIA_MIN minutos para no chocar con quien la esté haciendo.
async function guiasPendientes(cuenta: string, ahora = false) {
  const [cfg] = await tabla(`auto_config?cuenta=eq.${cuenta}&select=modo,reglas,centro_normal`);
  if ((cfg?.modo !== 'automatico' && !ahora) || !PAISES_CREACION.includes(cuenta) || !cfg.reglas) return [];
  const espera = (ahora ? ESPERA_GUIA_AHORA_MIN : ESPERA_GUIA_MIN) * 60_000;
  const keys: { slug: string; api_key: string }[] = await rpc('effi_get_api_keys', {});
  const key = keys.find((k) => k.slug === cuenta)?.api_key;
  if (!key) return [];
  const api = new Effi(key);
  const memoria = await memoriaCobertura(cuenta);
  const sinCobertura = await sinCoberturaTotal(cuenta);
  const hoy = Date.now();
  const desde = new Date(hoy - 3 * DAY_MS).toISOString().slice(0, 10), hasta = new Date(hoy + 2 * DAY_MS).toISOString().slice(0, 10);
  const rems = (await api.todas('remision_v', { desde, hasta, vigente: 1 }, PAGINAS_REGLAS))
    .filter((r) => r.vigente !== '0' && !r.id_guia_transporte && r.convenio_dropshipping && Number(r.total) > 0 && !conAbono(r.nombre_cliente))
    .filter((r) => hoy - Date.parse(`${String(r.fecha_trans).replace(' ', 'T')}Z`) > espera)
    .filter((r) => !sinCobertura.has(Number(r.id)))
    .slice(0, ahora ? MAX_GUIAS_AHORA : MAX_CREAR);
  const hechas: Json[] = [];
  for (const r of rems) {
    if (!ahora && !(await sigueAutomatico(cuenta))) break;
    const [orden] = await tabla(`auto_ordenes?cuenta=eq.${cuenta}&sucursal_remision=eq.${r.sucursal}&id_remision=eq.${r.id}&select=sucursal,id,guia`);
    // Effi a veces no marca la guía en la remisión aunque exista (hecha a mano): si la Torre ya la tiene, no se hace otra.
    if (orden?.guia) continue;
    const ev = (ok: boolean | null, mensaje: string, datos: Json | null = null) =>
      rpc('auto_evento', { p_cuenta: cuenta, p_sucursal: orden?.sucursal ?? null, p_id: orden?.id ?? null, p_paso: 'guia', p_ok: ok, p_mensaje: mensaje, p_datos: datos });
    const remitente = cfg.reglas.remitentes?.[r.convenio_dropshipping];
    if (!remitente) { await ev(false, `Remisión ${r.id}: no hay guías anteriores con el convenio ${r.convenio_dropshipping} para saber el remitente`); continue; }
    const elegido = elegirTransporte(cuenta, cfg.reglas, memoria, String(r.direccion_cliente ?? ''), Number(r.ciudad_cliente), String(r.nombre_ciudad ?? ''));
    if (!elegido) { await ev(false, `Remisión ${r.id}: no hay guías anteriores para saber la transportadora`); continue; }
    const guia = guiaDeRemision(r, elegido.t, remitente, cfg.centro_normal);
    await ev(null, `${ahora ? 'Ejecutar ahora' : 'Automático'}: haciendo la guía de la remisión ${r.id} (estaba sin guía)${elegido.motivo ? ` por ${String(elegido.t.nombre).split('|')[0].trim()}: ${elegido.motivo}` : ''}…`, { enviado: guia });
    const h = await hacerGuia(api, cuenta, cfg.reglas, guia, { ciudad: Number(r.ciudad_cliente), nombre: String(r.nombre_ciudad ?? '') }, ev);
    if (!h.ok) {
      await ev(false, `Effi no dejó crear la guía de la remisión ${r.id}: ${h.detalle}`, { enviado: h.guia, respuesta: h.g.respuesta, status: h.g.status });
      hechas.push({ remision: r.id, ok: false });
      continue;
    }
    await ev(true, `Guía ${h.p?.guia ?? ''} creada para la remisión ${r.id}`, { respuesta: h.g.respuesta });
    hechas.push({ remision: r.id, ok: true, guia: h.p?.guia });
  }
  return hechas;
}

// Colombia: van solas, aunque el país esté en Manual, las órdenes listas con entrega en oficina de Inter o Servientrega
// (remisión y guía por esa transportadora) y aquellas en que la regla de las asesoras y la ⭐ de la matriz coinciden
// (remisión y guía, o solo la guía de una remisión hecha a mano, por esa transportadora). Se toman las que la Torre ya
// tiene listas, de la más antigua a la más nueva, de a MAX_CREAR por corrida.
const coincideCO = (plan: Json) => Number(plan?.resumen?.recomendacion?.coincide) || null;
async function oficinasCO(cuenta: string) {
  if (cuenta !== 'TIENDA_CO') return [];
  const filas: Json[] = await tabla(`auto_ordenes?cuenta=eq.${cuenta}&plan_estado=eq.lista&guia=is.null&select=sucursal,id,plan,ciudad,provincia,id_remision,decision&order=id.asc&limit=300`);
  const vaSola = (x: Json) => !x.plan?.abono && x.decision !== 'descartar' && (
    (x.plan?.remision && x.id_remision == null && (oficinaCO(x.plan.remision.direccion_cliente) || coincideCO(x.plan))) ||
    (x.plan?.remision_existente && x.plan?.guia && coincideCO(x.plan)));
  const hechas: Json[] = [];
  for (const f of filas.filter(vaSola)) {
    if (hechas.length >= MAX_CREAR) break;
    // Ciudad con condición de las asesoras (pago anticipado, sin cobertura…): no va sola, la ve la asesora con el aviso.
    // Única excepción: "solo a oficina de Interrapidísimo" cuando la orden es justo a oficina de Inter.
    const direccion = String(f.plan.remision?.direccion_cliente ?? f.plan.guia?.direccion_destinatario?.[0] ?? '');
    const r = (await rpc('auto_restriccion', { p_cuenta: cuenta, p_ciudad: f.ciudad ?? '', p_dpto: f.provincia ?? '', p_direccion: direccion })) as Json | null;
    if (r && !(r.tipo === 'inter_oficina' && oficinaCO(f.plan.remision?.direccion_cliente) === 4)) continue;
    hechas.push(await crear(cuenta, Number(f.sucursal), Number(f.id), true, true));
  }
  return hechas;
}

// Crea en Effi la remisión y la guía de UNA orden que el dueño mandó a ejecutar. `sola`: Colombia en Manual, la orden
// que va sola (entrega en oficina o asesora y matriz coinciden), por la transportadora de esa regla.
async function crear(cuenta: string, sucursal: number, id: number, automatico = false, sola = false) {
  const ev = (paso: string, ok: boolean | null, mensaje: string, datos: Json | null = null) =>
    rpc('auto_evento', { p_cuenta: cuenta, p_sucursal: sucursal, p_id: id, p_paso: paso, p_ok: ok, p_mensaje: mensaje, p_datos: datos });
  const resultado = (estado: 'creada' | 'error', motivo: string | null, datos: Json) =>
    rpc('auto_resultado', { p_cuenta: cuenta, p_sucursal: sucursal, p_id: id, p_estado: estado, p_motivo: motivo, p_resultado: datos });

  if (!(automatico ? PAISES_CREACION : PAISES_POR_ORDEN).includes(cuenta)) throw new Error('La creación no está montada para este país');
  const [fila] = await tabla(`auto_ordenes?cuenta=eq.${cuenta}&sucursal=eq.${sucursal}&id=eq.${id}&select=plan,plan_estado,decision,ciudad,provincia`);
  // Colombia en Manual: solo va sola la entrega en oficina (por la transportadora de esa oficina) o cuando asesora y
  // matriz coinciden (por esa transportadora). En Automático o con "Ejecutar ahora" va toda orden lista, como en los
  // demás países.
  const ofi = sola && cuenta === 'TIENDA_CO' ? oficinaCO(fila?.plan?.remision?.direccion_cliente) : null;
  const coincide = sola && cuenta === 'TIENDA_CO' && !ofi ? coincideCO(fila?.plan) : null;
  if (sola && cuenta === 'TIENDA_CO' && !ofi && !coincide) return { creada: false, motivo: 'Colombia solo crea sola la entrega en oficina o cuando asesora y matriz coinciden' };
  // Orden recién llegada que la vigilancia (cada 2 minutos) aún no registra: no es error, se crea en la próxima corrida.
  if (automatico && !fila) return { creada: false, motivo: 'aún no registrada' };
  // Ciudad con condición de las asesoras (pago anticipado, sin cobertura, trato especial…): sola no se crea, la ve una
  // persona con el aviso. Única excepción: "solo a oficina de Interrapidísimo" cuando la orden es justo a oficina de Inter.
  if (automatico && fila?.plan) {
    const direccion = String(fila.plan.remision?.direccion_cliente ?? fila.plan.guia?.direccion_destinatario?.[0] ?? '');
    const r = (await rpc('auto_restriccion', { p_cuenta: cuenta, p_ciudad: fila.ciudad ?? '', p_dpto: fila.provincia ?? '', p_direccion: direccion })) as Json | null;
    if (r && !(r.tipo === 'inter_oficina' && oficinaCO(fila.plan.remision?.direccion_cliente) === 4)) return { creada: false, motivo: `Condición de envío: ${r.motivo}` };
  }
  const autorizada = automatico ? fila?.plan_estado === 'lista' : fila?.decision === 'ejecutar';
  if (!fila || !autorizada || !(fila.plan?.remision || (fila.plan?.remision_existente && fila.plan?.guia))) {
    await ev('fin', false, automatico ? 'Automático: la orden ya no estaba lista para crear' : 'La orden no está marcada para ejecutar o no tiene plan');
    return { creada: false };
  }
  if (fila.plan?.abono) {
    await ev('fin', false, 'Pedido con abono: el agente no lo toca, se hace a mano en Effi');
    return { creada: false, motivo: 'con abono' };
  }
  if (automatico) await ev('inicio', null, `${ofi ? `Entrega en oficina ${ofi === 4 ? 'Interrapidísimo' : 'Servientrega'}, va sola`
    : coincide ? `Asesora y matriz coinciden (${fila.plan?.resumen?.transportadora ?? coincide}), va sola` : 'Automático'}: ${fila.plan?.remision
    ? `convirtiendo la OV ${id} (${fila.plan?.resumen?.cantidad ?? ''} × ${fila.plan?.resumen?.producto ?? ''})`
    : `guía de la remisión ${fila.plan?.remision_existente?.id ?? ''} (OV ${id})`}`);
  const plan = fila.plan as Json;
  const previo = (plan.resultado ?? {}) as Json;
  // Elección del dueño al pulsar "Ejecutar": qué paso hacer y por qué transportadora (sin elección: los dos pasos con la
  // transportadora del plan).
  const eleccion = (ofi ? { paso: 'ambas', transportadora: ofi }
    : coincide ? { paso: plan.remision ? 'ambas' : 'guia', transportadora: coincide }
    : automatico ? {} : plan.eleccion ?? {}) as { paso?: 'ambas' | 'remision' | 'guia'; transportadora?: number | null };
  const paso = eleccion.paso ?? 'ambas';
  const keys: { slug: string; api_key: string }[] = await rpc('effi_get_api_keys', {});
  const key = keys.find((k) => k.slug === cuenta)?.api_key;
  if (!key) throw new Error('Sin API key');
  const api = new Effi(key);

  // 1. Remisión (si un intento anterior ya la creó, se reutiliza y solo se reintenta la guía). Si la remisión ya
  // existía (la hizo una persona), se revisa que siga vigente y sin guía.
  let remision = previo.remision as Json | undefined;
  const existente = plan.remision_existente as { sucursal: number; id: number } | undefined;
  if (!remision?.id && existente) {
    await ev('remision', null, `Revisando en Effi que la remisión ${existente.id} siga vigente y sin guía`);
    const hoy = Date.now();
    const desde = new Date(hoy - 30 * DAY_MS).toISOString().slice(0, 10), hasta = new Date(hoy + 2 * DAY_MS).toISOString().slice(0, 10);
    const esta = (r: Json) => Number(r.id) === Number(existente.id) && Number(r.sucursal) === Number(existente.sucursal);
    let rem = (await api.get('remision_v', { id: existente.id, sucursal: existente.sucursal, desde, hasta, por_pagina: 5, pagina: 1 })).data.find(esta);
    if (!rem) rem = (await api.todas('remision_v', { desde: new Date(hoy - 3 * DAY_MS).toISOString().slice(0, 10), hasta, vigente: 1 }, PAGINAS_REGLAS)).find(esta);
    if (!rem || rem.vigente === '0' || rem.id_guia_transporte) {
      const motivo = rem?.id_guia_transporte ? `La remisión ${existente.id} ya tiene guía ${rem.guia ?? ''} (la hizo alguien más)` : `La remisión ${existente.id} ya no está vigente en Effi`;
      await ev('remision', false, motivo);
      await resultado('error', motivo, { paso: 'remision' });
      return { creada: false, motivo };
    }
    remision = { id: Number(rem.id), sucursal: Number(rem.sucursal), id_transaccion: rem.id_transaccion };
  }
  if (!remision?.id && paso === 'guia') {
    const motivo = 'Se pidió solo la guía, pero la orden todavía no tiene remisión';
    await ev('remision', false, motivo);
    await resultado('error', motivo, { paso: 'remision' });
    return { creada: false, motivo };
  }
  if (!remision?.id && !PAISES_REMISION.includes(cuenta) && !ofi && !coincide && (automatico || !PAISES_POR_ORDEN.includes(cuenta))) {
    const motivo = 'En este país la Torre todavía no crea remisiones: hazla en Effi y la Torre hace la guía.';
    await ev('remision', false, motivo);
    await resultado('error', motivo, { paso: 'remision' });
    return { creada: false, motivo };
  }
  if (!remision?.id) {
    await ev('remision', null, 'Revisando en Effi que la orden siga vigente y sin remisión');
    const hoy = Date.now();
    const desde = new Date(hoy - 30 * DAY_MS).toISOString().slice(0, 10), hasta = new Date(hoy + 2 * DAY_MS).toISOString().slice(0, 10);
    const [orden] = (await api.get('orden_v', { id, sucursal, desde, hasta, por_pagina: 1, pagina: 1 })).data;
    if (!orden || orden.vigente === '0' || orden.id_remision_v) {
      const motivo = orden?.id_remision_v ? `La orden ya tiene la remisión RV ${orden.id_remision_v} (la hizo alguien más)` : 'La orden ya no está vigente en Effi';
      await ev('remision', false, motivo);
      await resultado('error', motivo, { paso: 'remision' });
      return { creada: false, motivo };
    }
    await ev('remision', null, 'Creando la remisión de venta en Effi…', { enviado: plan.remision });
    const r = await api.post('remision_v', plan.remision);
    if (!r.ok) {
      const motivo = `Effi no dejó crear la remisión: ${r.respuesta?.mensaje ?? `HTTP ${r.status}`}`;
      await ev('remision', false, motivo, { enviado: plan.remision, respuesta: r.respuesta, status: r.status });
      await resultado('error', motivo, { paso: 'remision', enviado: plan.remision, respuesta: r.respuesta, status: r.status });
      return { creada: false, motivo };
    }
    remision = r.respuesta?.data as Json;
    await ev('remision', true, `Remisión ${remision?.id_transaccion ?? remision?.id} creada por ${remision?.total ?? ''}`, { respuesta: r.respuesta });
    // Solo la remisión: la orden queda sin plan y en la siguiente corrida aparece en "remisión → guía".
    if (paso === 'remision') {
      await rpc('auto_resultado', { p_cuenta: cuenta, p_sucursal: sucursal, p_id: id, p_estado: null,
        p_motivo: `Remisión ${remision?.id_transaccion ?? remision?.id} creada por la Torre; falta la guía`, p_resultado: { remision } });
      await ev('fin', true, `Orden ${id}: remisión ${remision?.id_transaccion ?? remision?.id} creada (la guía se hace aparte)`);
      return { creada: true, remision: remision?.id };
    }
  }

  // 2. Guía de transporte con la remisión recién creada, por la transportadora que escogió el dueño o la del plan.
  // Effi responde { data: { guias: [ {id, guia, vigente, response, url_guia_transportadora, …} ], cantidad } }.
  const [cfgReglas] = await tabla(`auto_config?cuenta=eq.${cuenta}&select=reglas`);
  const escogida = eleccion.transportadora ? cfgReglas?.reglas?.transportes?.[String(eleccion.transportadora)] : null;
  if (eleccion.transportadora && !escogida) {
    const motivo = `La transportadora ${eleccion.transportadora} no está entre las que usa este país`;
    await ev('guia', false, motivo);
    await resultado('error', motivo, { paso: 'guia', remision });
    return { creada: false, motivo };
  }
  const guiaBase: Json = { ...plan.guia, ...(escogida ? { ...camposTransporte(escogida), idempotency_key: `${plan.guia?.idempotency_key}-t${eleccion.transportadora}` } : {}),
    id_ref: [Number(remision!.id)], sucursal_ref: [Number(remision!.sucursal ?? sucursal)] };
  // Colombia: el valor declarado lo pone la regla de cada transportadora (no se copia del documento).
  if (cuenta === 'TIENDA_CO') {
    guiaBase.valor_declarado_check = false;
    guiaBase.valor_declarado = declaradoCO(Number(guiaBase.transportadora), Number(plan.resumen?.total ?? remision?.total ?? 0));
  }
  await ev('guia', null, `Creando la guía de transporte en Effi${escogida ? ` por ${String(escogida.nombre ?? '').split('|')[0].trim()}` : ''}…`, { enviado: guiaBase });
  const h = await hacerGuia(api, cuenta, cfgReglas?.reglas, guiaBase,
    { ciudad: Number(plan.guia?.id_ciudad_destinatario?.[0]), nombre: String(plan.resumen?.ciudad ?? '') },
    (ok, mensaje, datos = null) => ev('guia', ok, mensaje, datos), !!escogida);
  const { g, p: primera, guia } = h;
  if (!h.ok) {
    const motivo = `Remisión ${remision!.id_transaccion ?? remision!.id} creada, pero Effi no dejó crear la guía: ${h.detalle}`;
    await ev('guia', false, motivo, { enviado: guia, respuesta: g.respuesta, status: g.status });
    await resultado('error', motivo, { paso: 'guia', remision, enviado: guia, respuesta: g.respuesta, status: g.status });
    return { creada: false, motivo };
  }
  const numero = primera?.guia ?? primera?.id_transaccion ?? primera?.id;
  await ev('guia', true, `Guía ${numero ?? ''} creada`, { respuesta: g.respuesta });
  await resultado('creada', null, { remision, guia: primera });
  await ev('fin', true, `Orden ${id} lista: remisión ${remision!.id_transaccion ?? remision!.id} y guía ${numero ?? ''}`);
  return { creada: true, remision: remision!.id, guia: numero };
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, mensaje: 'Solo POST' });
  const token = req.headers.get('x-sync-token') || '';
  if (!token || !(await rpc('effi_check_sync_token', { p_token: token }))) return json(401, { ok: false, mensaje: 'Token inválido' });
  const url = new URL(req.url);
  const cuenta = url.searchParams.get('cuenta') ?? '';
  if (!/^[A-Z0-9_]+$/.test(cuenta)) return json(400, { ok: false, mensaje: 'Falta cuenta' });
  const crearParam = url.searchParams.get('crear');
  if (crearParam) {
    const [suc, id] = crearParam.split('-').map(Number);
    if (!suc || !id) return json(400, { ok: false, mensaje: 'crear=sucursal-id' });
    try {
      return json(200, { ok: true, resultado: await crear(cuenta, suc, id) });
    } catch (e) {
      await rpc('auto_evento', { p_cuenta: cuenta, p_sucursal: suc, p_id: id, p_paso: 'fin', p_ok: false, p_mensaje: `Falla inesperada: ${String(e)}` }).catch(() => {});
      await rpc('auto_resultado', { p_cuenta: cuenta, p_sucursal: suc, p_id: id, p_estado: 'error', p_motivo: `Falla inesperada: ${String(e)}`, p_resultado: { paso: 'inesperado' } }).catch(() => {});
      return json(500, { ok: false, mensaje: String(e) });
    }
  }
  // Corrida del horario: una a la vez por país; responde de una vez y trabaja en segundo plano.
  if (!(await rpc('auto_candado', { p_cuenta: cuenta, p_segundos: 360 }))) return json(200, { ok: true, omitida: 'otra corrida en curso' });
  const ahora = url.searchParams.get('ahora') === '1';
  const soloGuias = url.searchParams.get('solo') === 'guias';
  const salto = Number(url.searchParams.get('salto') ?? 0);
  const tarea = (async () => {
    let seguir = false;
    try {
      if (soloGuias) {
        // Tandas de 10 (regla del dueño) con una pausa entre tandas, hasta acabar o hasta ~100 s; si quedan, se sigue
        // en otra llamada. Una tanda sin ninguna guía creada detiene todo (para no insistir en algo que Effi rechaza).
        const inicio = Date.now();
        while (true) {
          const hechas = await guiasPendientes(cuenta, true);
          if (hechas.length < MAX_GUIAS_AHORA || !hechas.some((h) => h.ok)) break;
          if (Date.now() - inicio > 100_000) { seguir = salto < 20; break; }
          await sleep(3000);
        }
      } else {
        // Si la parte de órdenes falla (p. ej. Effi pide esperar), las guías de las remisiones hechas se hacen igual.
        try { await convertir(cuenta, ahora); }
        catch (e) { await rpc('auto_error_conversion', { p_cuenta: cuenta, p_error: String(e) }).catch(() => {}); }
        try { await oficinasCO(cuenta); }
        catch (e) { await rpc('auto_error_conversion', { p_cuenta: cuenta, p_error: String(e) }).catch(() => {}); }
        await guiasPendientes(cuenta, ahora);
      }
    } catch (e) {
      await rpc('auto_error_conversion', { p_cuenta: cuenta, p_error: String(e) }).catch(() => {});
    } finally {
      await rpc('auto_soltar', { p_cuenta: cuenta }).catch(() => {});
    }
    if (seguir) {
      await fetch(`${SUPABASE_URL}/functions/v1/auto-convertir?cuenta=${cuenta}&ahora=1&solo=guias&salto=${salto + 1}`, {
        method: 'POST', headers: { 'x-sync-token': token, 'Content-Type': 'application/json' }, body: '{}',
      }).catch(() => {});
    }
  })();
  // @ts-ignore EdgeRuntime existe en Supabase Edge Functions
  EdgeRuntime.waitUntil(tarea);
  return json(202, { ok: true, mensaje: 'Corrida iniciada' });
});
