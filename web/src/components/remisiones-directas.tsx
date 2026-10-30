"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { dinero, entero } from "@/lib/formato";
import type { Periodo } from "./flujo-agente";

// 📄 Remisiones directas: las que llegan sin orden de venta (en A un clic, las de Lucid: LucidBot crea la remisión y el
// agente solo hace la guía). No salen en las listas de órdenes; aquí va cada una con su guía y quién la hizo. Hoy se
// refresca cada minuto; con el calendario muestra los días elegidos. Si no hay ninguna, no se muestra.
type Directa = {
  id: number; guia: string; remision: number; fecha: string; cliente: string | null; ciudad: string | null; recaudo: number | null;
  centro: string | null; transportadora: string | null; estado: string | null; hecha_por: "agente" | "persona";
};

export function RemisionesDirectas({ cuenta, zona, rango = null }: { cuenta: string; zona: string; rango?: Periodo | null }) {
  const [filas, setFilas] = useState<Directa[] | null>(null);
  const [todas, setTodas] = useState(false);
  useEffect(() => {
    let vivo = true;
    const cargar = async () => {
      const { data } = await createClient().rpc("auto_directas", rango ? { p_cuenta: cuenta, p_desde: rango.desde, p_hasta: rango.hasta } : { p_cuenta: cuenta });
      if (vivo && Array.isArray(data)) setFilas(data as Directa[]);
    };
    cargar();
    if (rango) return () => { vivo = false; };
    const t = setInterval(cargar, 60_000);
    return () => { vivo = false; clearInterval(t); };
  }, [cuenta, rango?.desde, rango?.hasta]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!filas?.length) return null;
  const agente = filas.filter((f) => f.hecha_por === "agente").length;
  const hora = (iso: string) => new Intl.DateTimeFormat("es-CO", { timeZone: zona, ...(rango ? { day: "2-digit", month: "short" } : {}), hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const visibles = todas ? filas : filas.slice(0, 15);
  return (
    <div className="card p-4">
      <div className="mb-2 flex flex-wrap items-baseline gap-2">
        <span className="font-display text-lg font-semibold">📄 Remisiones directas → guía</span>
        <span className="text-xs text-muted">
          Llegan sin orden de venta (por ejemplo, las de Lucid) y solo les falta la guía. {rango ? rango.etiqueta : "Hoy"}: {entero(filas.length)} ·
          🤖 agente {entero(agente)} · 👤 persona {entero(filas.length - agente)}
        </span>
      </div>
      <div className="divide-y divide-line">
        {visibles.map((f) => (
          <div key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2 text-sm">
            <span className="num w-24 text-xs text-muted">{hora(f.fecha)}</span>
            <span className="font-mono text-xs font-semibold">RV {f.remision}</span>
            <span className="min-w-[10rem] font-semibold">{f.cliente ?? "—"}<span className="font-normal text-muted">{f.ciudad ? ` · ${f.ciudad}` : ""}</span></span>
            <span className="font-mono text-xs">{f.guia}</span>
            <span className="text-xs text-muted">{f.transportadora ?? ""}{f.centro ? ` · ${f.centro}` : ""}{f.estado ? ` · ${f.estado}` : ""}</span>
            <span className="ml-auto text-[11px] text-muted">{dinero(f.recaudo, cuenta)} · {f.hecha_por === "agente" ? "🤖 agente" : "👤 persona"}</span>
          </div>
        ))}
      </div>
      {filas.length > 15 && (
        <button onClick={() => setTodas((x) => !x)} className="mt-2 text-xs font-semibold text-blue-2 hover:underline">
          {todas ? "Ver menos" : `Ver las ${entero(filas.length)}`}
        </button>
      )}
    </div>
  );
}
