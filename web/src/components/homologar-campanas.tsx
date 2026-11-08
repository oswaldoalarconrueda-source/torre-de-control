"use client";

import { useState } from "react";
import { dinero, entero } from "@/lib/formato";
import { AsignarProducto, type ProductoHistorico } from "./asignar-producto";

// Lista de campañas con gasto y su producto: a mano (manda), por regla de palabra, o "Sin identificar". El dueño o un
// socio asigna o corrige; al guardar, la pantalla de Productos ya reparte ese gasto en todos los periodos.

export type CampanaHomologar = {
  campana: string; cuentas: string; cop: number; dias: number; desde: string; hasta: string;
  manual: string | null; asignado_por: string | null; regla: string | null; patron: string | null;
};

export function HomologarCampanas({ cuenta, campanas, productos, puedeEditar }: {
  cuenta: string; campanas: CampanaHomologar[]; productos: ProductoHistorico[]; puedeEditar: boolean;
}) {
  const [vista, setVista] = useState<"sin" | "todas">("sin");

  const sinId = campanas.filter((c) => !c.manual && !c.regla);
  const lista = vista === "sin" ? sinId : campanas;
  const total = campanas.reduce((s, c) => s + c.cop, 0);
  const totalSin = sinId.reduce((s, c) => s + c.cop, 0);

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

      <div className="fichas-caja mt-3 overflow-x-auto -mx-4 sm:-mx-5 max-md:mx-0 md:px-5">
        <table className="tabla fichas w-full min-w-max text-sm">
          <thead>
            <tr><th className="text-left">Campaña</th><th className="text-left">Cuenta</th><th className="text-right">Gasto (COP)</th><th className="text-right">Días</th><th className="text-left">Producto</th>{puedeEditar && <th className="text-left">Asignar</th>}</tr>
          </thead>
          <tbody>
            {lista.map((c) => {
              const actual = c.manual ?? c.regla;
              return (
                <tr key={c.campana}>
                  <td data-l="Campaña" className="text-left max-w-[26rem] whitespace-normal break-words font-medium max-md:col-span-6">{c.campana}</td>
                  <td data-l="Cuenta" className="text-left text-muted max-w-[10rem] truncate max-md:col-span-6" title={c.cuentas}>{c.cuentas}</td>
                  <td data-l="Gasto (COP)" className="num text-right max-md:col-span-2 max-md:text-left">{dinero(c.cop, "TIENDA_CO")}</td>
                  <td data-l="Días" className="num text-right max-md:col-span-1 max-md:text-left">{c.dias}</td>
                  <td data-l="Producto" className="text-left">
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
                    <td data-l="Asignar" className="text-left max-md:col-span-6">
                      <AsignarProducto cuenta={cuenta} campana={c.campana} productos={productos} actual={actual} quitar={!!c.manual} />
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
