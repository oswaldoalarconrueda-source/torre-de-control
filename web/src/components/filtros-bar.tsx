"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { infoCuenta } from "@/lib/paises";
import type { Rango } from "@/lib/filtros";
import { SelectorFechas } from "./selector-fechas";

export function FiltrosBar({ cuentas, rangos, hoy, desde, hasta, seleccion, conFechas = true }: {
  cuentas: string[]; rangos: Rango[]; hoy: string; desde: string; hasta: string; seleccion: string[] | null; conFechas?: boolean;
}) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [pendiente, start] = useTransition();

  const ir = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(cambios)) (v ? p.set(k, v) : p.delete(k));
    start(() => router.push(`${path}?${p.toString()}`, { scroll: false }));
  };

  // Un solo país a la vez: los países nunca se suman entre sí.
  const elegido = seleccion?.[0] ?? cuentas[0];
  const paises = (
    <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="País">
      {cuentas.map((c) => {
        const i = infoCuenta(c);
        const on = c === elegido;
        return (
          <button
            key={c}
            role="radio"
            aria-checked={on}
            onClick={() => !on && ir({ c })}
            className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${on ? "border-blue/50 bg-blue/15 text-text" : "border-line text-muted hover:text-text"}`}
          >
            {i.bandera} {i.nombre}
          </button>
        );
      })}
    </div>
  );

  // Calendario a la izquierda, países a la derecha.
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        {conFechas && <SelectorFechas desde={desde} hasta={hasta} rangos={rangos} hoy={hoy} onAplicar={(d, h) => ir({ d, h })} />}
        {pendiente && (
          <span className="flex items-center gap-1.5 rounded-full border border-blue/40 bg-blue/10 px-3 py-1.5 text-xs text-blue-2" role="status">
            <span className="size-3 rounded-full border-2 border-blue-2 border-t-transparent animate-spin" />
            Actualizando…
          </span>
        )}
      </div>
      {paises}
    </div>
  );
}
