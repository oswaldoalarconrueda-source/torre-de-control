"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { entero } from "@/lib/formato";

// Ventana «¿Qué convenio le pongo?» (pedido del dueño, 25-nov-2026): la orden de Joalix que llega sin convenio de
// dropshipping ya no obliga a entrar a Effi. Se escoge el convenio aquí (arriba los que han despachado el producto de la
// orden en los últimos 30 días), queda guardado (auto_poner_convenio) y ValerIA prepara la remisión con ese convenio y la
// guía con su remitente. Se puede aplicar de una vez a las otras órdenes sin convenio con los mismos productos.
type Convenio = { convenio: string; nombre: string | null; remisiones: number; con_producto: number; ultima: string };

export function ConvenioOrden({ cuenta, orden, producto, otras, onCerrar, onListo }: {
  cuenta: string; orden: { sucursal: number; id: number }; producto: string; otras: number;
  onCerrar: () => void; onListo: () => void;
}) {
  const [lista, setLista] = useState<Convenio[] | null>(null);
  const [elegido, setElegido] = useState("");
  const [todas, setTodas] = useState(otras > 0);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    createClient().rpc("auto_convenios_disponibles", { p_cuenta: cuenta, p_sucursal: orden.sucursal, p_id: orden.id })
      .then(({ data, error: e }) => {
        if (e) { setError(e.message); setLista([]); return; }
        const l = (data ?? []) as Convenio[];
        setLista(l);
        // Por defecto, el que más ha despachado este producto.
        if (l[0]?.con_producto > 0) setElegido(l[0].convenio);
      });
  }, [cuenta, orden.sucursal, orden.id]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !guardando) onCerrar(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [guardando, onCerrar]);

  async function guardar() {
    if (!elegido) return;
    setGuardando(true); setError(null);
    const { error: e } = await createClient().rpc("auto_poner_convenio", {
      p_cuenta: cuenta, p_sucursal: orden.sucursal, p_id: orden.id, p_convenio: elegido, p_todas: todas,
    });
    setGuardando(false);
    if (e) setError(e.message); else onListo();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true"
      aria-labelledby="convenio-orden-titulo" onClick={() => !guardando && onCerrar()}>
      <div className="card w-full max-w-md p-5 space-y-3 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div>
          <h2 id="convenio-orden-titulo" className="font-display text-lg font-semibold">¿Qué convenio le pongo?</h2>
          <p className="mt-1 text-xs text-muted">
            La orden <b className="text-text">{orden.id}</b> ({producto}) llegó sin convenio de dropshipping. Escoge el convenio y
            el agente prepara la remisión con ese convenio y la guía con su remitente. No hace falta entrar a Effi.
          </p>
        </div>
        {lista == null ? (
          <p className="text-sm text-muted">Buscando convenios…</p>
        ) : !lista.length ? (
          <p className="text-sm text-red">No hay remisiones con convenio en los últimos 30 días en este país.</p>
        ) : (
          <div className="space-y-1.5">
            {lista.map((c) => (
              <label key={c.convenio} className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2 ${elegido === c.convenio
                ? "border-green/60 bg-green/10" : "border-line hover:bg-tinte/[0.04]"}`}>
                <input type="radio" name="convenio" value={c.convenio} checked={elegido === c.convenio} onChange={() => setElegido(c.convenio)}
                  className="mt-1 accent-[var(--green)]" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{c.nombre ?? c.convenio}</span>
                  <span className={`block text-[11px] ${c.con_producto > 0 ? "text-green" : "text-muted"}`}>
                    {c.con_producto > 0 ? `${entero(c.con_producto)} remisiones de este producto` : "No ha despachado este producto"}
                    <span className="text-muted"> · {entero(c.remisiones)} en total (30 días)</span>
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}
        {otras > 0 && (
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input type="checkbox" checked={todas} onChange={(e) => setTodas(e.target.checked)} className="mt-1 accent-[var(--green)]" />
            <span>Poner este convenio también a las otras <b>{entero(otras)}</b> órdenes de {producto} sin convenio
              <span className="block text-[11px] text-muted">El agente las prepara en sus próximas vueltas (cada 2 minutos, de a 15).</span></span>
          </label>
        )}
        {error && <p className="text-sm text-red">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button onClick={onCerrar} disabled={guardando} className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-muted hover:text-text">Cancelar</button>
          <button onClick={guardar} disabled={!elegido || guardando}
            className="rounded-full bg-green px-4 py-2 text-sm font-bold text-black disabled:opacity-50">
            {guardando ? "Guardando…" : "Poner convenio y preparar"}
          </button>
        </div>
      </div>
    </div>
  );
}
