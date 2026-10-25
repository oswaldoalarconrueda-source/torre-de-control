// Datos por cuenta y semáforos de % devolución (skill "skill-para-mierdero-a-lo-que-de", §3).

// Cada cuenta de Effi en un solo lugar: país, bandera, moneda, zona horaria e indicativo telefónico. Todas las pantallas
// leen de aquí, así una cuenta nueva (de cualquier sociedad) funciona igual en todos los módulos. El orden de este
// objeto es el orden de las banderas.
export type InfoCuenta = {
  pais: string; nombre: string; bandera: string; divisa: string; decimales: number; verde: number; naranja: number;
  zona: string; indicativo: string;
};

export const CUENTAS: Record<string, InfoCuenta> = {
  TIENDA_CO: { pais: "CO", nombre: "Colombia", bandera: "🇨🇴", divisa: "COP", decimales: 0, verde: 0.25, naranja: 0.32, zona: "America/Bogota", indicativo: "57" },
  TIENDA_EC: { pais: "EC", nombre: "Ecuador", bandera: "🇪🇨", divisa: "USD", decimales: 2, verde: 0.25, naranja: 0.35, zona: "America/Guayaquil", indicativo: "593" },
  TIENDA_GT: { pais: "GT", nombre: "Guatemala", bandera: "🇬🇹", divisa: "GTQ", decimales: 0, verde: 0.22, naranja: 0.3, zona: "America/Guatemala", indicativo: "502" },
  TIENDA_CR: { pais: "CR", nombre: "Costa Rica", bandera: "🇨🇷", divisa: "CRC", decimales: 0, verde: 0.25, naranja: 0.35, zona: "America/Costa_Rica", indicativo: "506" },
  // Valka: sociedad aparte, con su propia cuenta de Effi en Guatemala.
  VALKA_GT: { pais: "GT", nombre: "Valka", bandera: "🇬🇹", divisa: "GTQ", decimales: 0, verde: 0.22, naranja: 0.3, zona: "America/Guatemala", indicativo: "502" },
};
export const ORDEN_CUENTAS = Object.keys(CUENTAS);
export const ordenCuenta = (slug: string) => (ORDEN_CUENTAS.includes(slug) ? ORDEN_CUENTAS.indexOf(slug) : 99);

// Fulfillment Effi por guía despachada (TARIFA_FULL_EFFI del Dashboard Joalix): GT Q6,50 · EC $0,95.
// Colombia no tiene fulfillment: paga 4x1000 sobre el recaudo (ya viene cobrado en el wallet).
export const TARIFA_FULFILLMENT: Record<string, number> = { TIENDA_GT: 6.5, TIENDA_EC: 0.95 };

export const infoCuenta = (slug: string): InfoCuenta =>
  CUENTAS[slug] ?? { pais: "", nombre: slug, bandera: "🏳️", divisa: "", decimales: 0, verde: 0.25, naranja: 0.35, zona: "America/Bogota", indicativo: "" };

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
