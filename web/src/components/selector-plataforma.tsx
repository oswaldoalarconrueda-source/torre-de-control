import Link from "next/link";
import type { Plataforma } from "@/lib/datos";

type SP = Record<string, string | string[] | undefined>;
const OPCIONES: { id: Plataforma; label: string; activo: string }[] = [
  { id: "ambas", label: "Ambas", activo: "bg-gradient-to-r from-blue/30 to-amber/30 text-text" },
  { id: "effi", label: "Effi", activo: "bg-blue/25 text-text" },
  { id: "dropi", label: "Dropi", activo: "bg-amber/25 text-text" },
];

export const leerPlataforma = (sp: SP): Plataforma => (sp.pl === "effi" || sp.pl === "dropi" ? sp.pl : "ambas");

// Filtro Ambas / Effi / Dropi del Dashboard Joalix (solo en tiendas que venden por las dos plataformas).
export function SelectorPlataforma({ sp, actual }: { sp: SP; actual: Plataforma }) {
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
        {OPCIONES.map((o) => (
          <Link key={o.id} href={href(o.id)} scroll={false} aria-current={actual === o.id ? "true" : undefined}
            className={`rounded-lg px-3 py-1 font-semibold transition-colors ${actual === o.id ? o.activo : "text-muted hover:text-text"}`}>
            {o.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
