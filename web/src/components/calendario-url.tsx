"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import type { Rango } from "@/lib/filtros";
import { SelectorFechas } from "./selector-fechas";

// Calendario tipo Shopify que guarda el periodo en la dirección (?d=…&h=…): la pantalla se vuelve a pedir con esas fechas.
export function CalendarioUrl({ desde, hasta, rangos, hoy }: { desde: string; hasta: string; rangos: Rango[]; hoy: string }) {
  const router = useRouter();
  const path = usePathname();
  const [cargando, start] = useTransition();
  return (
    <div className={cargando ? "opacity-60" : ""}>
      <SelectorFechas desde={desde} hasta={hasta} rangos={rangos} hoy={hoy}
        onAplicar={(d, h) => start(() => router.push(`${path}?d=${d}&h=${h}`, { scroll: false }))} />
    </div>
  );
}
