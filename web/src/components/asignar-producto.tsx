"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { entero } from "@/lib/formato";
import { sugerirProducto, type Sugerencia } from "@/lib/sugerir-producto";

// Selector para homologar una campaña: ofrece lo que la tienda ha vendido en su historia (del más vendido al menos, con
// sus guías) o un nombre nuevo. Si la campaña no tiene producto y su nombre se parece a uno vendido ("MELAXIN PEEL SHOT
// HN" → Dr. Melaxin Peel Shot), muestra la sugerencia para aceptarla con un clic. Al guardar, la pantalla se recarga y
// ese gasto ya cuenta para el producto.

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
  const sugerencia = actual ? null : sugerirProducto(campana, productos);

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
      {sugerencia && (
        <button disabled={guardando} onClick={() => guardar(sugerencia.producto)}
          title={`Sugerido por el nombre de la campaña${sugerencia.segura ? "" : " (parecido parcial: revísalo)"}. Clic para asignarlo.`}
          className={`inline-flex max-w-[16rem] items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold disabled:opacity-40 ${
            sugerencia.segura ? "border-green/50 bg-green/10 text-green hover:bg-green/20" : "border-amber/50 bg-amber/10 text-amber hover:bg-amber/20"}`}>
          <span aria-hidden>✓</span><span className="truncate">{sugerencia.producto}</span>
        </button>
      )}
      <select value={sel} onChange={(e) => setSel(e.target.value)} className="max-w-[16rem] rounded-lg border border-line bg-panel px-2 py-1 text-sm">
        <option value="">{actual ? "Cambiar producto…" : sugerencia ? "Otro producto…" : "Elegir producto…"}</option>
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

// Acepta de una vez las sugerencias seguras (todas las palabras del producto o al menos dos completas), una por una.
export function AceptarSugeridas({ cuenta, campanas, productos }: { cuenta: string; campanas: string[]; productos: ProductoHistorico[] }) {
  const router = useRouter();
  const [estado, setEstado] = useState<string | null>(null);
  const lista = [...new Set(campanas)]
    .map((c) => ({ campana: c, s: sugerirProducto(c, productos) }))
    .filter((x): x is { campana: string; s: Sugerencia } => !!x.s?.segura);
  if (!lista.length) return null;

  async function aceptar() {
    if (!confirm(`¿Asignar ${lista.length} campañas a su producto sugerido?\n\n${lista.slice(0, 12).map((x) => `${x.campana} → ${x.s.producto}`).join("\n")}${lista.length > 12 ? "\n…" : ""}`)) return;
    const supabase = createClient();
    let hechas = 0;
    for (const x of lista) {
      setEstado(`Asignando ${hechas + 1} de ${lista.length}…`);
      const { error } = await supabase.rpc("prod_asignar_campana", { p_cuenta: cuenta, p_campana: x.campana, p_producto: x.s.producto });
      if (error) { setEstado(`Se asignaron ${hechas}; falló "${x.campana}": ${error.message}`); router.refresh(); return; }
      hechas++;
    }
    setEstado(null);
    router.refresh();
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button disabled={!!estado} onClick={aceptar} className="rounded-lg border border-green/50 bg-green/10 px-2.5 py-1 text-xs font-semibold text-green hover:bg-green/20 disabled:opacity-50">
        ✓ Aceptar {lista.length} {lista.length === 1 ? "sugerencia segura" : "sugerencias seguras"}
      </button>
      {estado && <span className="text-xs text-muted">{estado}</span>}
    </span>
  );
}
