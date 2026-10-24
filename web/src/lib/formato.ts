import { infoCuenta } from "./paises";

const n = (v: unknown) => (v == null || v === "" ? null : Number(v));

export function dinero(v: unknown, cuenta: string, compacto = false) {
  const x = n(v);
  if (x == null || Number.isNaN(x)) return "—";
  const c = infoCuenta(cuenta);
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: c.divisa || "USD",
    currencyDisplay: "narrowSymbol",
    notation: compacto ? "compact" : "standard",
    maximumFractionDigits: compacto ? 1 : c.decimales,
    minimumFractionDigits: compacto ? 0 : c.decimales,
  }).format(x);
}

export const entero = (v: unknown) => {
  const x = n(v);
  return x == null ? "—" : new Intl.NumberFormat("es-CO").format(x);
};

export const pct = (v: unknown, dec = 1) => {
  const x = n(v);
  return x == null ? "—" : `${(x * 100).toFixed(dec).replace(".", ",")} %`;
};

export const dias = (v: unknown) => {
  const x = n(v);
  return x == null ? "—" : `${x.toFixed(1).replace(".", ",")} d`;
};

export function haceCuanto(iso: string | null | undefined) {
  if (!iso) return "sin datos";
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "hace segundos";
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return `hace ${Math.round(s / 86400)} d`;
}

export const fechaHora = (iso: string | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso))
    : "—";

// "2026-10-20" → "20 oct"
export const diaCorto = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("es-CO", { timeZone: "UTC", day: "numeric", month: "short" }).format(new Date(`${iso}T12:00:00Z`)).replace(".", "") : "—";
