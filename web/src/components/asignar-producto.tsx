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

const normal = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const guiasTexto = (g: number) => (Number(g) > 0 ? `${entero(g)} ${Number(g) === 1 ? "guía" : "guías"}` : "0 guías (solo publicidad)");

export function AsignarProducto({ cuenta, campana, productos, actual, quitar }: {
  cuenta: string; campana: string; productos: ProductoHistorico[]; actual?: string | null; quitar?: boolean;
}) {
  const router = useRouter();
  const [sel, setSel] = useState("");          // producto elegido (de la lista o uno nuevo confirmado)
  const [q, setQ] = useState("");              // lo que se escribe en el buscador
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);     // opción resaltada con las flechas
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valor = sel;
  const sugerencia = actual ? null : sugerirProducto(campana, productos);
  // Buscador: cada palabra escrita tiene que estar en el nombre (sin importar tildes ni mayúsculas).
  const palabras = normal(q).split(/\s+/).filter(Boolean);
  const hallados = palabras.length ? productos.filter((p) => palabras.every((w) => normal(p.producto).includes(w))) : productos;
  const exacto = productos.some((p) => normal(p.producto) === normal(q));
  const opciones: { producto: string; guias: number | null }[] = [
    ...hallados.slice(0, 8),
    ...(q.trim() && !exacto ? [{ producto: q.trim(), guias: null }] : []),
  ];
  function elegir(producto: string) {
    setSel(producto);
    setQ(producto);
    setAbierto(false);
  }

  async function guardar(producto: string) {
    setGuardando(true);
    setError(null);
    const { error: e } = await createClient().rpc("prod_asignar_campana", { p_cuenta: cuenta, p_campana: campana, p_producto: producto });
    setGuardando(false);
    if (e) { setError(e.message); return; }
    setSel("");
    setQ("");
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
      <div className="w-full max-w-[17rem] sm:w-[17rem]">
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setSel(""); setAbierto(true); setActivo(0); }}
          onFocus={() => setAbierto(true)}
          onBlur={() => setTimeout(() => setAbierto(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setAbierto(true); setActivo((i) => Math.min(i + 1, opciones.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActivo((i) => Math.max(i - 1, 0)); }
            else if (e.key === "Enter" && opciones[activo]) { e.preventDefault(); elegir(opciones[activo].producto); }
            else if (e.key === "Escape") setAbierto(false);
          }}
          placeholder={actual ? "Buscar otro producto…" : sugerencia ? "Buscar otro producto…" : "Buscar producto…"}
          aria-label="Buscar producto"
          className={`w-full rounded-lg border bg-panel px-2 py-1 text-sm ${sel ? "border-blue-2/60" : "border-line"}`}
        />
        {abierto && (
          <ul className="mt-1 max-h-60 overflow-auto rounded-lg border border-line bg-panel text-sm shadow-lg">
            {opciones.map((o, i) => (
              <li key={`${o.producto}-${o.guias ?? "nuevo"}`}>
                <button type="button" onMouseDown={(e) => { e.preventDefault(); elegir(o.producto); }} onMouseEnter={() => setActivo(i)}
                  className={`flex w-full items-baseline justify-between gap-2 px-2 py-1.5 text-left ${i === activo ? "bg-blue-2/15" : ""}`}>
                  {o.guias === null
                    ? <span className="text-blue-2">+ Usar «{o.producto}» como producto nuevo</span>
                    : <><span className="truncate">{o.producto}</span><span className="shrink-0 text-[11px] text-muted">{guiasTexto(o.guias)}</span></>}
                </button>
              </li>
            ))}
            {!opciones.length && <li className="px-2 py-1.5 text-muted">Sin productos</li>}
            {hallados.length > 8 && <li className="px-2 py-1 text-[11px] text-muted">… y {hallados.length - 8} más: escribe más letras</li>}
          </ul>
        )}
      </div>
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
