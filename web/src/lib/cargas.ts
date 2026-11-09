// Lectura de los archivos que se cargan a mano mientras no hay API: Dropi (órdenes, órdenes por producto,
// historial de cartera) y Meta (CSV por Business Manager). Se procesa en el navegador y solo se envía lo
// necesario: sin nombre, teléfono, correo, documento ni dirección del cliente.

export type TipoCarga = "dropi_ordenes" | "dropi_productos" | "dropi_cartera" | "meta_bm" | "drop_ordenes" | "drop_billetera" | "icomfly_pedidos";
export type Celda = string | number | boolean | Date | null | undefined;
export type Fila = Record<string, unknown>;

export const NOMBRE_TIPO: Record<TipoCarga, string> = {
  dropi_ordenes: "Otra P · Órdenes",
  dropi_productos: "Otra P · Órdenes por producto",
  dropi_cartera: "Otra P · Historial de cartera",
  meta_bm: "Meta · CSV por BM",
  drop_ordenes: "Drop · Órdenes",
  drop_billetera: "Drop · Billetera",
  icomfly_pedidos: "icomfly · Pedidos",
};

export type Lectura = {
  tipo: TipoCarga;
  filas: Fila[];
  cuenta: string | null;      // sugerida para Dropi; en Meta la tienda sale del país de cada fila
  desde: string | null;
  hasta: string | null;
  totales: { etiqueta: string; valor: number; moneda?: boolean }[];
  avisos: string[];
};

// Encabezado sin tildes, en mayúsculas y sin espacios dobles: "Descripción " → "DESCRIPCION".
const clave = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase();

export function detectarTipo(encabezados: unknown[]): TipoCarga | null {
  const h = new Set(encabezados.map(clave));
  // Drop (Honduras y El Salvador de A un clic) e icomfly: se reconocen por columnas, no por el nombre del archivo.
  if (h.has("SALDO RESULTANTE") && h.has("MOVIMIENTO")) return "drop_billetera";
  if (h.has("PAQUETERA") && h.has("ACREDITACION")) return "drop_ordenes";
  if (h.has("PLATAFORMA DE ENVIO") && h.has("GUIA") && h.has("PRODUCTO")) return "icomfly_pedidos";
  if (h.has("MONTO PREVIO") && h.has("DESCRIPCION")) return "dropi_cartera";
  if (h.has("PRODUCTO ID") && h.has("CANTIDAD")) return "dropi_productos";
  if (h.has("VALOR DE COMPRA EN PRODUCTOS")) return "dropi_ordenes";
  if ([...h].some((x) => x.startsWith("MONTO GASTADO") || x.startsWith("IMPORTE GASTADO")) && h.has("DIA")) return "meta_bm";
  return null;
}

// Filas de la hoja/CSV → objetos por encabezado normalizado.
export function aObjetos(tabla: Celda[][]): { encabezados: string[]; filas: Record<string, Celda>[] } {
  const [cab = [], ...resto] = tabla;
  const encabezados = cab.map(clave);
  const filas = resto
    .filter((r) => r.some((v) => v !== null && v !== undefined && String(v).trim() !== ""))
    .map((r) => Object.fromEntries(encabezados.map((h, i) => [h, r[i]])));
  return { encabezados, filas };
}

const texto = (v: Celda) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};
const numero = (v: Celda) => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  const n = Number(String(v).replace(/[^0-9.,-]/g, "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};
const entero = (v: Celda) => {
  const n = numero(v);
  return n === null ? null : Math.trunc(n);
};
// Guías e ids como texto, sin el ".0" que deja Excel.
const id = (v: Celda) => texto(v)?.replace(/\.0+$/, "") ?? null;
const pad = (n: number) => String(n).padStart(2, "0");
// "23-10-2026", "23/10/2026", "2026-10-23" o fecha de Excel → "2026-10-23"
function fecha(v: Celda): string | null {
  if (v instanceof Date) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  const s = texto(v);
  if (!s) return null;
  let m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/.exec(s);
  if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
// "23-10-2026 04:12" → "2026-10-23 04:12"
function fechaHora(v: Celda): string | null {
  if (v instanceof Date) return `${fecha(v)} ${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}`;
  const s = texto(v);
  const f = fecha(s);
  if (!f) return null;
  const h = /(\d{1,2}):(\d{2})/.exec(s!.slice(8));
  return h ? `${f} ${pad(+h[1])}:${h[2]}` : `${f} 00:00`;
}
const siNo = (v: Celda) => (texto(v) === null ? null : /^S[IÍ]$/i.test(String(v).trim()));

function rango(fechas: (string | null)[]) {
  const f = fechas.filter((x): x is string => !!x).map((x) => x.slice(0, 10)).sort();
  return { desde: f[0] ?? null, hasta: f[f.length - 1] ?? null };
}
const suma = (xs: (number | null)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0);
function mediana(xs: (number | null)[]) {
  const v = xs.filter((x): x is number => x !== null && x > 0).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : 0;
}
// Dropi no dice el país en el archivo. Por el tamaño de los montos: pesos colombianos vs quetzales.
const cuentaPorMontos = (montos: (number | null)[]) => (mediana(montos) > 2000 ? "TIENDA_CO" : "TIENDA_GT");

function sinDuplicados<T extends Fila>(filas: T[], llave: (f: T) => unknown) {
  const vistas = new Map<unknown, T>();
  for (const f of filas) vistas.set(llave(f), f); // si se repite, gana la última fila
  return [...vistas.values()];
}

function dropiOrdenes(filas: Record<string, Celda>[]): Lectura {
  const out = sinDuplicados(
    filas.filter((r) => entero(r["ID"]) !== null).map((r) => ({
      id: entero(r["ID"]),
      fecha: fecha(r["FECHA"]),
      hora: texto(r["HORA"]),
      guia: id(r["NUMERO GUIA"]),
      estatus: texto(r["ESTATUS"]),
      tipo_envio: texto(r["TIPO DE ENVIO"]),
      departamento: texto(r["DEPARTAMENTO DESTINO"]),
      ciudad: texto(r["CIUDAD DESTINO"]),
      transportadora: texto(r["TRANSPORTADORA"]),
      venta: numero(r["VALOR DE COMPRA EN PRODUCTOS"]),
      ganancia: numero(r["GANANCIA"]),
      flete: numero(r["PRECIO FLETE"]),
      flete_dev: numero(r["COSTO DEVOLUCION FLETE"]),
      comision: numero(r["COMISION"]),
      costo: numero(r["TOTAL EN PRECIOS DE PROVEEDOR"]),
      novedad: texto(r["NOVEDAD"]),
      novedad_solucionada: siNo(r["FUE SOLUCIONADA LA NOVEDAD"]),
      ultimo_movimiento: texto(r["ULTIMO MOVIMIENTO"]),
      fecha_ultimo_movimiento: fecha(r["FECHA DE ULTIMO MOVIMIENTO"]),
      tipo_tienda: texto(r["TIPO DE TIENDA"]),
      tienda: texto(r["TIENDA"]),
      id_orden_tienda: id(r["ID DE ORDEN DE TIENDA"]),
      fecha_guia: fecha(r["FECHA GENERACION DE GUIA"]),
      // Regla Joalix: cliente con "*" al inicio = pedido recuperado. Solo se guarda la marca, no el nombre.
      recuperado: (texto(r["NOMBRE CLIENTE"]) ?? "").startsWith("*"),
      categorias: texto(r["CATEGORIAS"]),
      fecha_cancelacion: fecha(r["FECHA DE CANCELACION"]),
      cancelado_por: texto(r["CANCELADO POR"]),
      motivo_cancelacion: texto(r["MOTIVO DE CANCELACION"]),
      fecha_reporte: fecha(r["FECHA DE REPORTE"]),
    })),
    (f) => f.id,
  );
  const sinFecha = out.filter((f) => !f.fecha).length;
  // La tienda ayuda a no mezclar cuentas Dropi distintas del mismo país (cada cuenta tiene su propia cartera).
  const tiendas = new Map<string, number>();
  out.forEach((f) => tiendas.set(f.tienda ?? "sin tienda", (tiendas.get(f.tienda ?? "sin tienda") ?? 0) + 1));
  return {
    tipo: "dropi_ordenes",
    filas: out.filter((f) => f.fecha),
    cuenta: cuentaPorMontos(out.map((f) => f.venta)),
    ...rango(out.map((f) => f.fecha)),
    totales: [
      { etiqueta: "Órdenes", valor: out.length },
      { etiqueta: "Entregadas (según archivo)", valor: out.filter((f) => f.estatus === "ENTREGADO").length },
      { etiqueta: "Venta", valor: suma(out.map((f) => f.venta)), moneda: true },
      ...[...tiendas].map(([t, n]) => ({ etiqueta: `Tienda ${t}`, valor: n })),
    ],
    avisos: sinFecha ? [`${sinFecha} órdenes sin fecha se omiten.`] : [],
  };
}

function dropiProductos(filas: Record<string, Celda>[]): Lectura {
  const lineas = new Map<number, number>();
  const out = filas.filter((r) => entero(r["ID"]) !== null).map((r) => {
    const orden = entero(r["ID"])!;
    const linea = (lineas.get(orden) ?? 0) + 1;
    lineas.set(orden, linea);
    return {
      orden_id: orden,
      linea,
      producto_id: entero(r["PRODUCTO ID"]),
      variacion_id: entero(r["VARIACION ID"]),
      sku: texto(r["SKU"]),
      producto: texto(r["PRODUCTO"]),
      variacion: texto(r["VARIACION"]),
      cantidad: numero(r["CANTIDAD"]),
      precio_proveedor: numero(r["PRECIO PROVEEDOR"]),
      precio_proveedor_total: numero(r["PRECIO PROVEEDOR X CANTIDAD"]),
    };
  });
  return {
    tipo: "dropi_productos",
    filas: out,
    cuenta: cuentaPorMontos(filas.map((r) => numero(r["TOTAL DE LA ORDEN"]))),
    ...rango(filas.map((r) => fecha(r["FECHA"]))),
    totales: [
      { etiqueta: "Órdenes", valor: lineas.size },
      { etiqueta: "Líneas de producto", valor: out.length },
      { etiqueta: "Unidades", valor: suma(out.map((f) => f.cantidad)) },
    ],
    avisos: [],
  };
}

function dropiCartera(filas: Record<string, Celda>[]): Lectura {
  const out = sinDuplicados(
    filas.filter((r) => entero(r["ID"]) !== null).map((r) => ({
      id: entero(r["ID"]),
      fecha: fechaHora(r["FECHA"]),
      tipo: (texto(r["TIPO"]) ?? "").toUpperCase(),
      monto: numero(r["MONTO"]) ?? 0,
      monto_previo: numero(r["MONTO PREVIO"]),
      orden_id: entero(r["ORDEN ID"]),
      guia: id(r["NUMERO DE GUIA"]),
      descripcion: texto(r["DESCRIPCION"]),
      concepto_retiro: texto(r["CONCEPTO DE RETIRO"]),
    })),
    (f) => f.id,
  ).filter((f) => f.fecha);
  const ganancia = out.filter((f) => /^ENTRADA POR GANANCIA/i.test(f.descripcion ?? ""));
  return {
    tipo: "dropi_cartera",
    filas: out,
    cuenta: cuentaPorMontos(out.map((f) => f.monto)),
    ...rango(out.map((f) => f.fecha)),
    totales: [
      { etiqueta: "Movimientos", valor: out.length },
      { etiqueta: "Ganancias pagadas", valor: ganancia.length },
      { etiqueta: "Total ganancias", valor: suma(ganancia.map((f) => f.monto)), moneda: true },
    ],
    avisos: [],
  };
}

// País que trae el CSV (país de entrega). Si viene "unknown", se intenta con la etiqueta de la campaña: (COL), (EC), (GT)…
function paisMeta(pais: string | null, campana: string) {
  const p = (pais ?? "").toUpperCase();
  if (/^[A-Z]{2}$/.test(p)) return p;
  if (/\((COL|CO)\)/i.test(campana)) return "CO";
  if (/\((ECU|EC)\)/i.test(campana)) return "EC";
  if (/\((GUA|GUATE|GT)\)/i.test(campana)) return "GT";
  return null;
}

function metaBm(filas: Record<string, Celda>[]): Lectura {
  const colMonto = Object.keys(filas[0] ?? {}).find((k) => k.startsWith("MONTO GASTADO") || k.startsWith("IMPORTE GASTADO")) ?? "";
  const avisos: string[] = [];
  if (colMonto && !colMonto.includes("COP")) avisos.push(`El monto viene en "${colMonto}"; el Centro de Control espera COP.`);
  const validas = filas.filter((r) => texto(r["NOMBRE DE LA CUENTA"]) && fecha(r["DIA"])); // la primera fila es el total del informe
  const sinPais: string[] = [];
  const out = validas.flatMap((r) => {
    const campana = texto(r["NOMBRE DE LA CAMPANA"]) ?? "(sin nombre)";
    const pais = paisMeta(texto(r["PAIS"]), campana);
    if (!pais) { sinPais.push(campana); return []; }
    return [{ pais, fecha: fecha(r["DIA"]), cuenta_ads: texto(r["NOMBRE DE LA CUENTA"])!, campana, monto_cop: numero(r[colMonto]) ?? 0 }];
  });
  if (sinPais.length) avisos.push(`${sinPais.length} filas sin país se omiten (${[...new Set(sinPais)].slice(0, 3).join(", ")}).`);
  const porPais = new Map<string, number>();
  out.forEach((f) => porPais.set(f.pais, (porPais.get(f.pais) ?? 0) + f.monto_cop));
  const cuentas = [...new Set(out.map((f) => f.cuenta_ads))];
  return {
    tipo: "meta_bm",
    filas: out,
    cuenta: null,
    ...rango(out.map((f) => f.fecha)),
    totales: [
      { etiqueta: `Cuentas: ${cuentas.join(", ")}`, valor: cuentas.length },
      ...[...porPais].map(([p, v]) => ({ etiqueta: `Gasto ${p} (COP)`, valor: v })),
    ],
    avisos,
  };
}

export async function leerTabla(tabla: Celda[][]): Promise<Lectura> {
  const { encabezados, filas } = aObjetos(tabla);
  const tipo = detectarTipo(encabezados);
  if (tipo === "drop_ordenes") return dropOrdenes(filas);
  if (tipo === "drop_billetera") return dropBilletera(filas);
  if (tipo === "icomfly_pedidos") return icomflyPedidos(filas);
  if (tipo === "dropi_ordenes") return dropiOrdenes(filas);
  if (tipo === "dropi_productos") return dropiProductos(filas);
  if (tipo === "dropi_cartera") return dropiCartera(filas);
  if (tipo === "meta_bm") return metaBm(filas);
  throw new Error("No reconozco el archivo: no es de Dropi (órdenes, productos o cartera), de Drop (órdenes o billetera), de icomfly (pedidos) ni un CSV de Meta.");
}

// ───────────── Drop + icomfly (A un clic Honduras y El Salvador; skill "a-un-clic-honduras-el-salvador-drop") ─────────────
// Se guardan en las mismas tablas de Dropi (órdenes, cartera, productos) a nombre de AUNCLIC_HN / AUNCLIC_SV: así
// Productos, PyG, despacho y pendientes funcionan igual. No se guardan nombre, teléfono ni dirección del cliente: solo
// una huella (sha-256) del nombre para cruzar la trazabilidad con las órdenes cuando la guía no coincide.

const vacio = (v: Celda) => { const t = texto(v); return t === null || t === "—" || t === "-" ? null : t; };
const normalNombre = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
async function sha256(t: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
const huellaCliente = async (v: Celda) => { const t = vacio(v); return t ? (await sha256(`cliente|${normalNombre(t)}`)).slice(0, 32) : null; };
// "03:31 PM" / "04:21 p. m." → "15:31"
function hora12(s: string | null): string | null {
  if (!s) return null;
  const m = /(\d{1,2}):(\d{2})\s*([ap])\.?\s*m/i.exec(s);
  if (!m) return /(\d{1,2}:\d{2})/.exec(s)?.[1] ?? null;
  let h = +m[1] % 12;
  if (m[3].toLowerCase() === "p") h += 12;
  return `${pad(h)}:${m[2]}`;
}
// País por el prefijo del teléfono: +504 Honduras, +503 El Salvador (con o sin "+"; 8 dígitos sin prefijo = local).
function paisTelefono(v: Celda): "HN" | "SV" | null {
  const d = String(v ?? "").replace(/\D/g, "");
  if (d.startsWith("504") && d.length >= 11) return "HN";
  if (d.startsWith("503") && d.length >= 11) return "SV";
  return null;
}
const CUENTA_PAIS = { HN: "AUNCLIC_HN", SV: "AUNCLIC_SV" } as const;
// Un archivo es de un solo país. Si casi todo es de uno (≥ 95 %), se toma ese y se avisa; si mezcla de verdad, no se guarda.
function paisDelArchivo(paises: ("HN" | "SV" | null)[], avisos: string[], porDefecto: "HN" | "SV" | null = null) {
  const hn = paises.filter((p) => p === "HN").length, sv = paises.filter((p) => p === "SV").length;
  if (!hn && !sv) return porDefecto;
  const mayor = hn >= sv ? "HN" : "SV", menor = Math.min(hn, sv);
  if (menor > 0.05 * (hn + sv)) throw new Error(`El archivo mezcla Honduras (${hn}) y El Salvador (${sv}): sepáralo por país antes de subirlo.`);
  if (menor) avisos.push(`${menor} ${menor === 1 ? "fila tiene" : "filas tienen"} teléfono de ${mayor === "HN" ? "El Salvador" : "Honduras"}; el archivo se toma como ${mayor === "HN" ? "Honduras" : "El Salvador"}.`);
  return mayor;
}
// Estado de Drop → vocabulario de Dropi (v_dropi_ordenes): la billetera manda después.
function estadoDrop(e: string | null): string | null {
  const x = (e ?? "").toLowerCase();
  if (x === "entregado") return "ENTREGADO";
  if (x === "no entregado") return "DEVOLUCION";
  if (x === "orden cancelada" || x === "envío cancelado" || x === "envio cancelado") return "CANCELADO";
  if (x === "orden rechazada") return "RECHAZADO";
  if (["creado en sistema", "verificar", "pendiente"].includes(x)) return "PENDIENTE";
  if (x === "problemas en gestión" || x === "problemas en gestion") return "NOVEDAD";
  return e ? "EN TRANSITO" : null; // En ruta a destino, Recolectado y lo nuevo
}

async function dropOrdenes(filas: Record<string, Celda>[]): Promise<Lectura> {
  const avisos: string[] = [];
  const validas = filas.filter((r) => entero(r["N° DE ORDEN"]) !== null);
  const pais = paisDelArchivo(validas.map((r) => paisTelefono(r["TELEFONO DEL CLIENTE"])), avisos);
  const out = await Promise.all(validas.map(async (r) => {
    const f = texto(r["FECHA DE CREACION"]);
    return {
      id: entero(r["N° DE ORDEN"]),
      fecha: fecha(f),
      hora: hora12(f?.slice(10) ?? null),
      guia: vacio(r["N° DE GUIA"]),
      estatus: estadoDrop(texto(r["ESTADO"])),
      ultimo_movimiento: texto(r["ESTADO"]),           // el estado original de Drop
      tipo_envio: vacio(r["TIPO DE PAGO"]),
      transportadora: vacio(r["PAQUETERA"]),
      venta: numero(r["MONTO A COBRAR"]),
      categorias: vacio(r["PROVEEDOR"]),
      tipo_tienda: "DROP",
      tienda: "drop",
      id_orden_tienda: vacio(r["N° DE ORDEN SHOPIFY"]),
      cliente_hash: await huellaCliente(r["CLIENTE"]),
    };
  }));
  const estados = new Map<string, number>();
  validas.forEach((r) => estados.set(texto(r["ESTADO"]) ?? "—", (estados.get(texto(r["ESTADO"]) ?? "—") ?? 0) + 1));
  return {
    tipo: "drop_ordenes",
    filas: out.filter((f) => f.fecha),
    cuenta: pais ? CUENTA_PAIS[pais] : null,
    ...rango(out.map((f) => f.fecha)),
    totales: [
      { etiqueta: "Órdenes", valor: out.length },
      { etiqueta: "Monto a cobrar", valor: suma(out.map((f) => f.venta)), moneda: true },
      ...[...estados].sort((a, b) => b[1] - a[1]).map(([e, n]) => ({ etiqueta: e, valor: n })),
    ],
    avisos,
  };
}

// Billetera de Drop → cartera (descripción al estilo Dropi para que el concepto salga solo: ganancia, devolución, retiro).
async function dropBilletera(filas: Record<string, Celda>[]): Promise<Lectura> {
  const validas = filas.filter((r) => texto(r["FECHA"]) && numero(r["MONTO"]) !== null);
  // La tasa (USD por unidad local) dice la moneda: ≈1 = dólares (El Salvador); si no, lempiras (Honduras).
  const tasas = validas.map((r) => numero(r["TASA DE CAMBIO (USD)"])).filter((x): x is number => !!x);
  const pais: "HN" | "SV" | null = tasas.length ? (mediana(tasas) > 0.5 ? "SV" : "HN") : null;
  const out = await Promise.all(validas.map(async (r) => {
    const v = r["FECHA"];
    const utc = v instanceof Date ? v : new Date(String(texto(v)));
    const local = new Date(utc.getTime() - 6 * 3_600_000); // Honduras y El Salvador: UTC−6, sin horario de verano
    const fechaLocal = `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())} ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}`;
    const monto = numero(r["MONTO"]) ?? 0;
    const concepto = texto(r["CONCEPTO"]) ?? "";
    const mov = texto(r["MOVIMIENTO"]) ?? "";
    const saldo = numero(r["SALDO RESULTANTE"]);
    const esRetiro = /liquidaci[oó]n/i.test(mov) && !/env[ií]o/i.test(mov);
    const descripcion = /^abono/i.test(mov) ? `ENTRADA POR GANANCIA · Drop: ${mov}`
      : /no entrega/i.test(mov) ? `SALIDA DE COBRO DE DEVOLUCION · Drop: ${mov}`
      : esRetiro ? `RETIRO · Drop: ${concepto}`
      : `Drop: ${mov} · ${concepto}`;
    const h = await sha256(`drop|${utc.toISOString()}|${concepto}|${monto}|${saldo}`);
    return {
      id: parseInt(h.slice(0, 13), 16),               // id estable (< 2^53): el archivo es acumulado y no debe duplicar
      fecha: fechaLocal,
      tipo: monto < 0 ? "SALIDA" : "ENTRADA",
      monto: Math.abs(monto),
      monto_previo: numero(r["SALDO ANTERIOR"]),
      orden_id: entero(/Orden\s+(\d+)/i.exec(concepto)?.[1]),
      descripcion,
      concepto_retiro: esRetiro ? concepto : null,
      tasa: numero(r["TASA DE CAMBIO (USD)"]),
    };
  }));
  const abonos = out.filter((f) => f.descripcion.startsWith("ENTRADA POR GANANCIA"));
  const devol = out.filter((f) => f.descripcion.startsWith("SALIDA DE COBRO"));
  const retiros = out.filter((f) => f.concepto_retiro);
  const ultimo = [...validas].sort((a, b) => String(texto(b["FECHA"])).localeCompare(String(texto(a["FECHA"]))))[0];
  return {
    tipo: "drop_billetera",
    filas: out,
    cuenta: pais ? CUENTA_PAIS[pais] : null,
    ...rango(out.map((f) => f.fecha)),
    totales: [
      { etiqueta: "Movimientos", valor: out.length },
      { etiqueta: "Abonos (ganancia)", valor: suma(abonos.map((f) => f.monto)), moneda: true },
      { etiqueta: "Descuentos por no entrega", valor: devol.length },
      { etiqueta: "Retiros", valor: retiros.length },
      { etiqueta: "Saldo final", valor: numero(ultimo?.["SALDO RESULTANTE"]) ?? 0, moneda: true },
    ],
    avisos: [],
  };
}

// Trazabilidad de icomfly: la única fuente del producto. "1x A, 1x B" se separa en líneas.
async function icomflyPedidos(filas: Record<string, Celda>[]): Promise<Lectura> {
  const avisos: string[] = [];
  const validas = filas.filter((r) => texto(r["ID"]));
  const pais = paisDelArchivo(validas.map((r) => paisTelefono(r["TELEFONO"])), avisos, "HN");
  const lineas = new Map<string, number>();
  const out = (await Promise.all(validas.map(async (r) => {
    const pid = texto(r["ID"])!;
    const prod = texto(r["PRODUCTO"]) ?? "";
    const partes = /^\d+\s*x\s/i.test(prod)
      ? prod.split(/,\s*(?=\d+\s*x\s)/i).map((p) => { const m = /^(\d+)\s*x\s+(.+)$/i.exec(p.trim()); return { producto: (m?.[2] ?? p).trim(), cantidad: m ? +m[1] : 1 }; })
      : [{ producto: prod, cantidad: numero(r["CANTIDAD"]) ?? 1 }];
    const hash = await huellaCliente(r["CLIENTE"]);
    return partes.map((p) => {
      const linea = (lineas.get(pid) ?? 0) + 1;
      lineas.set(pid, linea);
      return {
        id: pid, linea, fecha: fecha(r["FECHA"]), hora: hora12(texto(r["HORA"])),
        origen: vacio(r["ORIGEN"]), plataforma_envio: vacio(r["PLATAFORMA DE ENVIO"]),
        departamento: vacio(r["DEPARTAMENTO"]), municipio: vacio(r["MUNICIPIO"]),
        producto: p.producto || null, cantidad: p.cantidad, total: numero(r["TOTAL"]),
        recaudo: vacio(r["RECAUDO"]), pasarela: vacio(r["PASARELA DE PAGO"]),
        costo_producto: numero(r["COSTO PRODUCTO"]), costo_envio: numero(r["COSTO ENVIO"]),
        estado: vacio(r["ESTADO"]), guia: vacio(r["GUIA"]), transportadora: vacio(r["TRANSPORTADORA"]),
        etiquetas: vacio(r["ETIQUETAS"]), motivo_cancelacion: vacio(r["MOTIVO DE CANCELACION"]),
        fecha_cancelacion: fecha(r["FECHA CANCELACION"]), cliente_hash: hash,
      };
    });
  }))).flat();
  const productos = new Set(out.map((f) => f.producto).filter(Boolean));
  return {
    tipo: "icomfly_pedidos",
    filas: out.filter((f) => f.fecha),
    cuenta: pais ? CUENTA_PAIS[pais] : null,
    ...rango(out.map((f) => f.fecha)),
    totales: [
      { etiqueta: "Pedidos", valor: validas.length },
      { etiqueta: "Líneas de producto", valor: out.length },
      { etiqueta: "Productos distintos", valor: productos.size },
      { etiqueta: "Con guía", valor: new Set(out.filter((f) => f.guia).map((f) => f.id)).size },
    ],
    avisos,
  };
}
