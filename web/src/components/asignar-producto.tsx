"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { entero } from "@/lib/formato";

// Selector para homologar una campaña: ofrece lo que la tienda ha vendido en su historia (del más vendido al menos, con
// sus guías) o un nombre nuevo. Al guardar, la pantalla se recarga y ese gasto ya cuenta para el producto.

export type ProductoHistorico = { producto: string; guias: number };
const OTRO = "__otro__";

export function AsignarProducto({ cuenta, campana, productos, actual, quitar }: {
  cuenta: string; campana: string; productos: ProductoHistorico[]; actual?: string | null; quitar?: boolean;
}) {
  const router = useRouter();
  const [sel, setSel] = useState("");
  const [otro, setOtro] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valor = sel === OTRO ? otro.trim() : sel;

  async function guardar(producto: string) {
    setGuardando(true);
    setError(null);
    const { error: e } = await createClient().rpc("prod_asignar_campana", { p_cuenta: cuenta, p_campana: campana, p_producto: producto });
    setGuardando(false);
    if (e) { setError(e.message); return; }
    setSel("");
    setOtro("");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select value={sel} onChange={(e) => setSel(e.target.value)} className="max-w-[16rem] rounded-lg border border-line bg-panel px-2 py-1 text-sm">
        <option value="">{actual ? "Cambiar producto…" : "Elegir producto…"}</option>
        {productos.map((p) => (
          <option key={p.producto} value={p.producto}>
            {p.producto} · {Number(p.guias) > 0 ? `${entero(p.guias)} ${Number(p.guias) === 1 ? "guía" : "guías"}` : "0 guías (solo publicidad)"}
          </option>
        ))}
        <option value={OTRO}>Otro (escribir)…</option>
      </select>
      {sel === OTRO && (
        <input value={otro} onChange={(e) => setOtro(e.target.value)} placeholder="Nombre del producto" className="w-40 rounded-lg border border-line bg-panel px-2 py-1 text-sm" />
      )}
      <button disabled={!valor || guardando} onClick={() => guardar(valor)} className="rounded-lg bg-blue-2 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-40">
        {guardando ? "Guardando…" : "Guardar"}
      </button>
      {quitar && (
        <button disabled={guardando} onClick={() => guardar("")} className="rounded-lg border border-line px-2 py-1 text-xs text-muted hover:text-red" title="Quitar la asignación a mano (vuelve a la regla o a Sin identificar)">
          Quitar
        </button>
      )}
      {error && <span className="text-xs text-red">No se pudo guardar: {error}</span>}
    </div>
  );
}
