// Filtros globales en la URL: ?c=TIENDA_CO,TIENDA_EC&d=2026-10-01&h=2026-10-23

export type Filtros = { cuentas: string[] | null; desde: string; hasta: string };
export type Rango = { id: string; label: string; d: string; h: string };
type SP = Record<string, string | string[] | undefined>;

// Primer día con datos cargados (guías desde 2025-01-01): base del atajo "Todo el rango".
export const INICIO_DATOS = "2025-01-01";

export const hoyBogota = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
const esFecha = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

// Los países nunca se juntan: siempre hay exactamente una cuenta elegida (Colombia por defecto).
export const CUENTA_POR_DEFECTO = "TIENDA_CO";

export function leerFiltros(sp: SP): Filtros {
  const hoy = hoyBogota();
  const c = typeof sp.c === "string" && /^[A-Z0-9_]+$/.test(sp.c.split(",")[0]) ? sp.c.split(",")[0] : CUENTA_POR_DEFECTO;
  const desde = esFecha(sp.d) ? sp.d : `${hoy.slice(0, 8)}01`;
  const hasta = esFecha(sp.h) ? sp.h : hoy;
  return { cuentas: [c], desde, hasta: hasta < desde ? desde : hasta };
}

export const rpcArgs = (f: Filtros) => ({ p_cuentas: f.cuentas, p_desde: f.desde, p_hasta: f.hasta });

// Fechas "YYYY-MM-DD" operadas a mediodía UTC para no saltar de día por zona horaria.
export const sumarDias = (iso: string, dias: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);

// Atajos del calendario (los mismos del Dashboard Joalix Group).
export function rangosRapidos(hoy = hoyBogota()): Rango[] {
  const inicioMes = `${hoy.slice(0, 8)}01`;
  const finMesAnterior = sumarDias(inicioMes, -1);
  const ayer = sumarDias(hoy, -1);
  return [
    { id: "hoy", label: "Hoy", d: hoy, h: hoy },
    { id: "ayer", label: "Ayer", d: ayer, h: ayer },
    { id: "7d", label: "Últimos 7 días", d: sumarDias(hoy, -6), h: hoy },
    { id: "mes", label: "Este mes", d: inicioMes, h: hoy },
    { id: "mes-ant", label: "Mes anterior", d: `${finMesAnterior.slice(0, 8)}01`, h: finMesAnterior },
    { id: "todo", label: "Todo el rango", d: INICIO_DATOS, h: hoy },
  ];
}

export const rangoActivo = (rangos: Rango[], desde: string, hasta: string) => rangos.find((r) => r.d === desde && r.h === hasta) ?? null;

// Mismo día, un mes atrás (1–23 oct → 1–23 sep); si ese mes es más corto, su último día.
export function mismoDiaMesAnterior(iso: string) {
  const a = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7)) - 1, d = Number(iso.slice(8, 10));
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return new Date(Date.UTC(a, m - 1, Math.min(d, ultimo))).toISOString().slice(0, 10);
}
