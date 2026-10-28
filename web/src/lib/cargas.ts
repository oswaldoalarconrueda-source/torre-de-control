// Lectura de los archivos que se cargan a mano mientras no hay API: Dropi (órdenes, órdenes por producto,
// historial de cartera) y Meta (CSV por Business Manager). Se procesa en el navegador y solo se envía lo
// necesario: sin nombre, teléfono, correo, documento ni dirección del cliente.

export type TipoCarga = "dropi_ordenes" | "dropi_productos" | "dropi_cartera" | "meta_bm";
export type Celda = string | number | boolean | Date | null | undefined;
export type Fila = Record<string, unknown>;

export const NOMBRE_TIPO: Record<TipoCarga, string> = {
  dropi_ordenes: "Órdenes",
  dropi_productos: "Órdenes por producto",
  dropi_cartera: "Historial de cartera",
  meta_bm: "Meta · CSV por BM",
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
  if (colMonto && !colMonto.includes("COP")) avisos.push(`El monto viene en "${colMonto}"; la Torre espera COP.`);
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

export function leerTabla(tabla: Celda[][]): Lectura {
  const { encabezados, filas } = aObjetos(tabla);
  const tipo = detectarTipo(encabezados);
  if (tipo === "dropi_ordenes") return dropiOrdenes(filas);
  if (tipo === "dropi_productos") return dropiProductos(filas);
  if (tipo === "dropi_cartera") return dropiCartera(filas);
  if (tipo === "meta_bm") return metaBm(filas);
  throw new Error("No reconozco el archivo: no es órdenes, órdenes por producto ni historial de cartera, ni un CSV de Meta.");
}
