import Link from "next/link";

// Pestañas de Proveeduría: tablero de la empresa, comisiones de drop, remisiones sin costo, su liquidación y, aparte, la comisión por mayor. Se mantienen la empresa y el periodo al
// cambiar; a Liquidación se llega sin fechas porque solo trae totales cuando se filtra.
export function PestanasProveeduria({ actual, cuenta, periodo = "", sinCosto }: {
  actual: "tablero" | "comisiones" | "sin-costo" | "liquidacion" | "mayor"; cuenta?: string; periodo?: string; sinCosto?: number;
}) {
  const c = cuenta ? `c=${cuenta}` : "";
  const q = [c, periodo].filter(Boolean).join("&");
  const clase = (on: boolean) => `-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${on ? "border-blue-2 text-text" : "border-transparent text-muted hover:text-text"}`;
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-line" aria-label="Secciones de Proveeduría">
      <Link href={`/proveeduria${c ? `?${c}` : ""}`} aria-current={actual === "tablero" ? "page" : undefined} className={clase(actual === "tablero")}>Tablero</Link>
      <Link href={`/proveeduria/comisiones${q ? `?${q}` : ""}`} aria-current={actual === "comisiones" ? "page" : undefined} className={clase(actual === "comisiones")}>Comisiones</Link>
      <Link href={`/proveeduria/comisiones/sin-costo${q ? `?${q}` : ""}`} aria-current={actual === "sin-costo" ? "page" : undefined} className={clase(actual === "sin-costo")}>
        Sin costo
        {!!sinCosto && <span className="rounded-full bg-amber/20 px-1.5 py-0.5 text-[10px] font-bold text-amber">{sinCosto}</span>}
      </Link>
      <Link href={`/proveeduria/liquidacion${c ? `?${c}` : ""}`} aria-current={actual === "liquidacion" ? "page" : undefined} className={clase(actual === "liquidacion")}>Liquidación</Link>
      <Link href={`/proveeduria/mayor${q ? `?${q}` : ""}`} aria-current={actual === "mayor" ? "page" : undefined} className={clase(actual === "mayor")}>Por mayor</Link>
    </nav>
  );
}
