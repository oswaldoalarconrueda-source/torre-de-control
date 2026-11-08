"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { dinero, entero } from "@/lib/formato";

// Lista de campañas con gasto y su producto: a mano (manda), por regla de palabra, o "Sin identificar". El dueño o un
// socio asigna o corrige; al guardar, la pantalla de Productos ya reparte ese gasto en todos los periodos.

export type CampanaHomologar = {
  campana: string; cuentas: string; cop: number; dias: number; desde: string; hasta: string;
  manual: string | null; asignado_por: string | null; regla: string | null; patron: string | null;
};

const OTRO = "__otro__";

export function HomologarCampanas({ cuenta, campanas, productos, puedeEditar }: {
  cuenta: string; campanas: CampanaHomologar[]; productos: string[]; puedeEditar: boolean;
}) {
  const router = useRouter();
  const [vista, setVista] = useState<"sin" | "todas">("sin");
  const [elegido, setElegido] = useState<Record<string, string>>({});
  const [otro, setOtro] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const sinId = campanas.filter((c) => !c.manual && !c.regla);
  const lista = vista === "sin" ? sinId : campanas;
  const total = campanas.reduce((s, c) => s + c.cop, 0);
  const totalSin = sinId.reduce((s, c) => s + c.cop, 0);

  async function guardar(c: CampanaHomologar, producto: string | null) {
    setGuardando(c.campana);
    setAviso(null);
    const { error } = await createClient().rpc("prod_asignar_campana", { p_cuenta: cuenta, p_campana: c.campana, p_producto: producto ?? "" });
    setGuardando(null);
    if (error) { setAviso(`No se pudo guardar: ${error.message}`); return; }
    setElegido((e) => { const n = { ...e }; delete n[c.campana]; return n; });
    router.refresh();
  }

  return (
    <section className="card p-4 sm:p-5 min-w-0">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold">Campañas del periodo</h2>
          <p className="text-xs text-muted mt-0.5">
            {entero(campanas.length)} campañas · {dinero(total, "TIENDA_CO")} · sin identificar: {entero(sinId.length)} ({dinero(totalSin, "TIENDA_CO")}
            {total > 0 ? `, ${((totalSin / total) * 100).toFixed(1).replace(".", ",")} %` : ""})
          </p>
        </div>
        <div className="flex gap-1 rounded-full border border-line p-0.5 text-sm">
          {(["sin", "todas"] as const).map((v) => (
            <button key={v} onClick={() => setVista(v)} className={`rounded-full px-3 py-1 ${vista === v ? "bg-blue-2 text-white" : "text-muted"}`}>
              {v === "sin" ? `Sin identificar (${sinId.length})` : `Todas (${campanas.length})`}
            </button>
          ))}
        </div>
      </header>
      {!puedeEditar && <p className="mt-2 text-xs text-muted">Solo el dueño o un socio pueden asignar productos.</p>}
      {aviso && <p className="mt-2 text-sm text-red">{aviso}</p>}

      <div className="mt-3 overflow-x-auto -mx-4 sm:-mx-5 md:px-5">
        <table className="tabla w-full min-w-max text-sm">
          <thead>
            <tr><th className="text-left">Campaña</th><th className="text-left">Cuenta</th><th className="text-right">Gasto (COP)</th><th className="text-right">Días</th><th className="text-left">Producto</th>{puedeEditar && <th className="text-left">Asignar</th>}</tr>
          </thead>
          <tbody>
            {lista.map((c) => {
              const actual = c.manual ?? c.regla;
              const sel = elegido[c.campana] ?? "";
              const valor = sel === OTRO ? (otro[c.campana] ?? "").trim() : sel;
              return (
                <tr key={c.campana}>
                  <td className="text-left max-w-[22rem] truncate" title={c.campana}>{c.campana}</td>
                  <td className="text-left text-muted max-w-[10rem] truncate" title={c.cuentas}>{c.cuentas}</td>
                  <td className="num text-right">{dinero(c.cop, "TIENDA_CO")}</td>
                  <td className="num text-right">{c.dias}</td>
                  <td className="text-left">
                    {actual ? (
                      <span>
                        {actual}{" "}
                        <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] ${c.manual ? "bg-blue-2/15 text-blue-2" : "bg-tinte/5 text-muted"}`} title={c.manual ? `Asignado por ${c.asignado_por ?? "—"}` : `Regla: ${c.patron}`}>
                          {c.manual ? "a mano" : "regla"}
                        </span>
                      </span>
                    ) : <i className="text-amber">Sin identificar</i>}
                  </td>
                  {puedeEditar && (
                    <td className="text-left">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <select value={sel} onChange={(e) => setElegido((x) => ({ ...x, [c.campana]: e.target.value }))} className="rounded-lg border border-line bg-panel px-2 py-1 text-sm">
                          <option value="">Elegir producto…</option>
                          {productos.map((p) => <option key={p} value={p}>{p}</option>)}
                          <option value={OTRO}>Otro (escribir)…</option>
                        </select>
                        {sel === OTRO && (
                          <input value={otro[c.campana] ?? ""} onChange={(e) => setOtro((x) => ({ ...x, [c.campana]: e.target.value }))} placeholder="Nombre del producto" className="w-40 rounded-lg border border-line bg-panel px-2 py-1 text-sm" />
                        )}
                        <button disabled={!valor || guardando === c.campana} onClick={() => guardar(c, valor)} className="rounded-lg bg-blue-2 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-40">
                          {guardando === c.campana ? "Guardando…" : "Guardar"}
                        </button>
                        {c.manual && (
                          <button disabled={guardando === c.campana} onClick={() => guardar(c, null)} className="rounded-lg border border-line px-2 py-1 text-xs text-muted hover:text-red" title="Quitar la asignación a mano (vuelve a la regla o a Sin identificar)">
                            Quitar
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
            {lista.length === 0 && <tr><td colSpan={puedeEditar ? 6 : 5} className="text-center text-muted">{vista === "sin" ? "✓ Todas las campañas del periodo tienen producto." : "Sin campañas con gasto en el periodo."}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
