import Link from "next/link";
import type { Plataforma } from "@/lib/datos";

type SP = Record<string, string | string[] | undefined>;
const OPCIONES: { id: Plataforma; label: string; activo: string }[] = [
  { id: "ambas", label: "Todo", activo: "bg-gradient-to-r from-blue/30 to-amber/30 text-text" },
  { id: "effi", label: "Effi", activo: "bg-blue/25 text-text" },
  { id: "dropi", label: "Others", activo: "bg-amber/25 text-text" },
  { id: "smart", label: "Smart", activo: "bg-green/25 text-text" },
];

export const leerPlataforma = (sp: SP): Plataforma =>
  (sp.pl === "effi" || sp.pl === "dropi" || sp.pl === "smart" ? sp.pl : "ambas");

// Filtro Todo / Effi / Others del Dashboard Joalix (solo en tiendas que venden por las dos plataformas). En A un clic cada
// plataforma va con su nombre (Dropi en vez de Others) y, si la tienda tiene pedidos de Smart Commerce, sale también «Smart».
export function SelectorPlataforma({ sp, actual, aUnClic = false, conSmart = false }: { sp: SP; actual: Plataforma; aUnClic?: boolean; conSmart?: boolean }) {
  const href = (id: Plataforma) => {
    const q = new URLSearchParams();
    Object.entries(sp).forEach(([k, v]) => { if (typeof v === "string" && k !== "pl") q.set(k, v); });
    if (id !== "ambas") q.set("pl", id);
    return `?${q.toString()}`;
  };
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="uppercase tracking-widest font-mono text-muted">Plataforma</span>
      <div className="inline-flex rounded-xl border border-line p-0.5">
        {OPCIONES.filter((o) => o.id !== "smart" || conSmart).map((o) => ({ ...o, label: o.id === "dropi" && aUnClic ? "Dropi" : o.label })).map((o) => (
          <Link key={o.id} href={href(o.id)} scroll={false} aria-current={actual === o.id ? "true" : undefined}
            className={`rounded-lg px-3 py-1 font-semibold transition-colors ${actual === o.id ? o.activo : "text-muted hover:text-text"}`}>
            {o.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
