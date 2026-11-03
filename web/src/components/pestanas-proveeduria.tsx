import Link from "next/link";

// Pestañas de Proveeduría: el tablero de la empresa y las comisiones. Se mantiene la empresa elegida al cambiar.
export function PestanasProveeduria({ actual, cuenta }: { actual: "tablero" | "comisiones"; cuenta?: string }) {
  const q = cuenta ? `?c=${cuenta}` : "";
  const clase = (on: boolean) => `-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${on ? "border-blue-2 text-text" : "border-transparent text-muted hover:text-text"}`;
  return (
    <nav className="flex gap-1 border-b border-line" aria-label="Secciones de Proveeduría">
      <Link href={`/proveeduria${q}`} aria-current={actual === "tablero" ? "page" : undefined} className={clase(actual === "tablero")}>Tablero</Link>
      <Link href={`/proveeduria/comisiones${q}`} aria-current={actual === "comisiones" ? "page" : undefined} className={clase(actual === "comisiones")}>Comisiones</Link>
    </nav>
  );
}
