import { dinero } from "@/lib/formato";
import { infoCuenta } from "@/lib/paises";

// Montos de 📢 Publicidad: pesos (lo que cobra Meta) arriba y, debajo, la moneda del país (lo que se sube a Datos).
// El dólar va como "US$" para no confundirlo con los pesos ("$"). Colombia: solo pesos.
export const cop = (v: unknown, compacto = false) => dinero(v, "TIENDA_CO", compacto);
export const enLocal = (v: number | null | undefined, cuenta: string) =>
  v == null ? "sin TRM" : infoCuenta(cuenta).divisa === "USD"
    ? new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", currencyDisplay: "symbol", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)
    : dinero(v, cuenta);

// Pedido del dueño (22-nov-2026): en los países con cuentas publicitarias en dólares (A un clic) salen las tres monedas:
// dólares (lo que cobra Meta) arriba, la moneda del país y los pesos. Con usd = null queda como antes (pesos y moneda del país).
export const enUsd = (v: number | null | undefined) =>
  v == null ? "sin TRM" : new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", currencyDisplay: "symbol", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

export function Doble({ local, enCop, cuenta, fuerte = false, usd }: { local: number | null | undefined; enCop: number | null | undefined; cuenta: string; fuerte?: boolean; usd?: number | null }) {
  if (usd !== undefined && infoCuenta(cuenta).divisa !== "COP") {
    const pais = infoCuenta(cuenta).divisa;
    return (
      <span className="inline-flex flex-col items-end leading-tight">
        <span className={fuerte ? "font-semibold" : undefined}>{enUsd(pais === "USD" ? local ?? usd : usd)}</span>
        {pais !== "USD" && <span className="text-[11px] text-blue-2">{enLocal(local, cuenta)}</span>}
        <span className="text-[11px] text-muted">{cop(enCop)}</span>
      </span>
    );
  }
  if (infoCuenta(cuenta).divisa === "COP") return <span className={fuerte ? "font-semibold" : undefined}>{cop(enCop)}</span>;
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span className={fuerte ? "font-semibold" : undefined}>{cop(enCop)}</span>
      <span className="text-[11px] text-blue-2">{enLocal(local, cuenta)}</span>
    </span>
  );
}

// "meta_access_token_joaquin" → "Joaquin"; el primero (sin sufijo) es el portafolio Compras FACIL.
export const portafolio = (t: string | null) => {
  if (!t) return "—";
  const s = t.replace(/^meta_access_token_?/, "");
  return s ? s[0].toUpperCase() + s.slice(1) : "Compras FACIL";
};
