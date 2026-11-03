"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { etiquetaRango } from "@/lib/filtros";
import { dinero, entero, nombrePropio } from "@/lib/formato";
import { Panel, TablaScroll, Vacio } from "./ui";

export type Pago = {
  id: number; desde: string; hasta: string; remisiones: number; utilidad: number; comision: number; monto_pagado: number; fecha_pago: string;
  nota: string | null; soporte: string; soporte_nombre: string | null; registro: string | null; creado_en: string; anulado_en: string | null;
};

// Histórico de pagos de la empresa, con su soporte. Anular no borra: el pago sigue aquí, marcado, y deja de sumar.
export function HistoricoLiquidaciones({ cuenta, pagos, enlaces, puedeAnular }: { cuenta: string; pagos: Pago[]; enlaces: Record<string, string>; puedeAnular: boolean }) {
  const router = useRouter();
  const [confirmar, setConfirmar] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const total = pagos.filter((p) => !p.anulado_en).reduce((a, p) => a + Number(p.monto_pagado), 0);

  async function anular(id: number) {
    const { error: e } = await createClient().rpc("prov_liquidacion_anular", { p_id: id });
    setConfirmar(null);
    if (e) return setError(e.message);
    router.refresh();
  }

  return (
    <Panel titulo="Histórico de pagos" detalle={pagos.length ? `Pagado en total: ${dinero(total, cuenta)}` : undefined}>
      {error && <p className="mb-3 text-sm text-red" role="alert">{error}</p>}
      {pagos.length ? (
        <TablaScroll>
          <thead>
            <tr>
              <th>Periodo</th><th>Fecha de pago</th><th className="!text-right">Pagado</th><th className="!text-right">Comisión calculada</th><th className="!text-right">Remisiones</th>
              <th>Soporte</th><th>Registró</th><th>Nota</th>{puedeAnular && <th />}
            </tr>
          </thead>
          <tbody>
            {pagos.map((p) => {
              const url = enlaces[p.soporte];
              const foto = /\.(jpe?g|png|webp)$/i.test(p.soporte);
              return (
                <tr key={p.id} className={p.anulado_en ? "opacity-50" : undefined}>
                  <td className="font-semibold">{etiquetaRango(p.desde, p.hasta)}{p.anulado_en && <span className="ml-2 rounded-full bg-red/15 px-2 py-0.5 text-[11px] font-medium text-red">Anulado</span>}</td>
                  <td className="num">{p.fecha_pago.split("-").reverse().join("/")}</td>
                  <td className="num text-right font-semibold text-green">{dinero(p.monto_pagado, cuenta)}</td>
                  <td className="num text-right">{dinero(p.comision, cuenta)}</td>
                  <td className="num text-right">{entero(p.remisiones)}</td>
                  <td>
                    {url ? (
                      <a href={url} target="_blank" rel="noopener noreferrer" title={p.soporte_nombre ?? "Ver soporte"} className="inline-flex items-center gap-2 text-blue-2 hover:underline">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {foto && <img src={url} alt="" className="size-9 rounded-md object-cover" />}
                        Ver
                      </a>
                    ) : "—"}
                  </td>
                  <td>{p.registro ? nombrePropio(p.registro) : "—"}</td>
                  <td className="max-w-[14rem] truncate text-muted" title={p.nota ?? ""}>{p.nota ?? "—"}</td>
                  {puedeAnular && (
                    <td className="text-right">
                      {p.anulado_en ? null : confirmar === p.id ? (
                        <span className="inline-flex items-center gap-2 text-xs">
                          ¿Anular?
                          <button onClick={() => anular(p.id)} className="rounded-full bg-red px-2.5 py-1 font-semibold text-white">Sí</button>
                          <button onClick={() => setConfirmar(null)} className="rounded-full border border-line px-2.5 py-1 text-muted">No</button>
                        </span>
                      ) : (
                        <button onClick={() => setConfirmar(p.id)} className="text-xs text-muted hover:text-red">Anular</button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </TablaScroll>
      ) : (
        <Vacio>Todavía no hay pagos registrados de esta empresa.</Vacio>
      )}
    </Panel>
  );
}
