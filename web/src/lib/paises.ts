// Datos por cuenta y semáforos de % devolución (skill "skill-para-mierdero-a-lo-que-de", §3).

// Cada cuenta de Effi en un solo lugar: país, bandera, moneda, zona horaria e indicativo telefónico. Todas las pantallas
// leen de aquí, así una cuenta nueva (de cualquier sociedad) funciona igual en todos los módulos. El orden de este
// objeto es el orden de las banderas.
export type InfoCuenta = {
  pais: string; nombre: string; bandera: string; divisa: string; decimales: number; verde: number; naranja: number;
  zona: string; indicativo: string;
  sociedad?: string; // cuando el nombre es solo el país y otra sociedad tiene tienda en el mismo país (A un clic)
};

export const CUENTAS: Record<string, InfoCuenta> = {
  TIENDA_CO: { pais: "CO", nombre: "Colombia", bandera: "🇨🇴", divisa: "COP", decimales: 0, verde: 0.25, naranja: 0.32, zona: "America/Bogota", indicativo: "57" },
  TIENDA_EC: { pais: "EC", nombre: "Ecuador", bandera: "🇪🇨", divisa: "USD", decimales: 2, verde: 0.25, naranja: 0.35, zona: "America/Guayaquil", indicativo: "593" },
  TIENDA_GT: { pais: "GT", nombre: "Guatemala", bandera: "🇬🇹", divisa: "GTQ", decimales: 0, verde: 0.22, naranja: 0.3, zona: "America/Guatemala", indicativo: "502" },
  TIENDA_CR: { pais: "CR", nombre: "Costa Rica", bandera: "🇨🇷", divisa: "CRC", decimales: 0, verde: 0.25, naranja: 0.35, zona: "America/Costa_Rica", indicativo: "506" },
  // Valka: sociedad aparte, con su propia cuenta de Effi en Guatemala.
  VALKA_GT: { pais: "GT", nombre: "Valka", bandera: "🇬🇹", divisa: "GTQ", decimales: 0, verde: 0.22, naranja: 0.3, zona: "America/Guatemala", indicativo: "502" },
  // A un clic: Guatemala con Effi; Honduras (lempiras) y El Salvador (dólares) con Drop + icomfly por archivo. En las banderas
  // sale solo el país, como en Joalix; "sociedad" las distingue donde se mezclan (p. ej. al cargar archivos).
  AUNCLIC_GT: { pais: "GT", nombre: "Guatemala", sociedad: "A un clic", bandera: "🇬🇹", divisa: "GTQ", decimales: 0, verde: 0.22, naranja: 0.3, zona: "America/Guatemala", indicativo: "502" },
  AUNCLIC_HN: { pais: "HN", nombre: "Honduras", sociedad: "A un clic", bandera: "🇭🇳", divisa: "HNL", decimales: 0, verde: 0.22, naranja: 0.3, zona: "America/Tegucigalpa", indicativo: "504" },
  AUNCLIC_SV: { pais: "SV", nombre: "El Salvador", sociedad: "A un clic", bandera: "🇸🇻", divisa: "USD", decimales: 2, verde: 0.22, naranja: 0.3, zona: "America/El_Salvador", indicativo: "503" },
  // Distrilatam (proveeduría): tres empresas de Effi, cada una por separado aunque dos sean de Guatemala.
  DISTRI_GT: { pais: "GT", nombre: "DistriGuatemala", bandera: "🇬🇹", divisa: "GTQ", decimales: 2, verde: 0.22, naranja: 0.3, zona: "America/Guatemala", indicativo: "502" },
  DISTRI_LAB: { pais: "GT", nombre: "DistriLab", bandera: "🇬🇹", divisa: "GTQ", decimales: 2, verde: 0.22, naranja: 0.3, zona: "America/Guatemala", indicativo: "502" },
  DISTRI_CR: { pais: "CR", nombre: "DistriCostaRica", bandera: "🇨🇷", divisa: "CRC", decimales: 0, verde: 0.25, naranja: 0.35, zona: "America/Costa_Rica", indicativo: "506" },
};
export const ORDEN_CUENTAS = Object.keys(CUENTAS);
export const ordenCuenta = (slug: string) => (ORDEN_CUENTAS.includes(slug) ? ORDEN_CUENTAS.indexOf(slug) : 99);

// Fulfillment Effi por guía despachada (TARIFA_FULL_EFFI del Dashboard Joalix): GT Q6,50 · EC $0,95.
// Colombia no tiene fulfillment: paga 4x1000 sobre el recaudo (ya viene cobrado en el wallet).
export const TARIFA_FULFILLMENT: Record<string, number> = { TIENDA_GT: 6.5, TIENDA_EC: 0.95 };

// Nombre de la agente de órdenes según la sociedad: la de Joalix (tiendas TIENDA_*) se llama ValerIA (regla del dueño,
// 30-oct); las demás sociedades siguen con "Agente" hasta que le pongan nombre.
export const nombreAgente = (slug: string) => (slug.startsWith("TIENDA_") ? "ValerIA" : "Agente");

export const infoCuenta = (slug: string): InfoCuenta =>
  CUENTAS[slug] ?? { pais: "", nombre: slug, bandera: "🏳️", divisa: "", decimales: 0, verde: 0.25, naranja: 0.35, zona: "America/Bogota", indicativo: "" };

// Bandera + nombre + sociedad, para donde se mezclan tiendas de varias sociedades del mismo país (p. ej. cargas).
export const nombreConSociedad = (slug: string) => {
  const i = infoCuenta(slug);
  return `${i.bandera} ${i.nombre}${i.sociedad ? ` (${i.sociedad})` : slug.startsWith("TIENDA_") ? " (Joalix)" : ""}`;
};

export type Semaforo = "verde" | "naranja" | "rojo" | "nada";

export function semaforoDevolucion(slug: string, pct: number | null | undefined): Semaforo {
  if (pct == null) return "nada";
  const c = infoCuenta(slug);
  return pct <= c.verde ? "verde" : pct <= c.naranja ? "naranja" : "rojo";
}

// Efectividad por ciudad: verde ≥70 %, amarillo ≥50 % (docs/reglas-negocio.md §5).
export function semaforoEfectividad(ef: number | null | undefined): Semaforo {
  if (ef == null) return "nada";
  return ef >= 0.7 ? "verde" : ef >= 0.5 ? "naranja" : "rojo";
}

export const COLOR_SEMAFORO: Record<Semaforo, string> = {
  verde: "var(--green)",
  naranja: "var(--amber)",
  rojo: "var(--red)",
  nada: "var(--muted)",
};

// Nombre del país por código (para avisos como "pauta entregada en Colombia").
const PAISES_NOMBRE: Record<string, string> = {
  CO: "Colombia", EC: "Ecuador", GT: "Guatemala", CR: "Costa Rica", HN: "Honduras", SV: "El Salvador", MX: "México",
  PA: "Panamá", PE: "Perú", US: "Estados Unidos", NI: "Nicaragua", VE: "Venezuela", CL: "Chile",
};
export const nombrePais = (codigo: string) => PAISES_NOMBRE[codigo] ?? codigo;
