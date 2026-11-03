import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { etiquetaRango, hoyBogota, rangosRapidos, sumarDias } from "@/lib/filtros";
import { infoCuenta, ordenCuenta } from "@/lib/paises";
import { CalendarioUrl } from "./calendario-url";
import { PestanasProveeduria } from "./pestanas-proveeduria";

type SP = Record<string, string | string[] | undefined>;

// Empresa y periodo de las pantallas de comisiones. Sin fechas en la dirección: el mes anterior completo, que es el que se liquida.
export async function leerComisiones(sp: SP) {
  const supabase = await createClient();
  const { data } = await supabase.from("effi_accounts").select("slug").eq("tipo", "proveeduria").eq("activa", true);
  const cuentas = (data ?? []).map((c) => c.slug as string).sort((a, b) => ordenCuenta(a) - ordenCuenta(b));
  // Proveeduría es solo de Distrilatam: mirando otra sociedad no hay nada que mostrar aquí.
  if (!cuentas.length) redirect("/inicio");
  const cuenta = typeof sp.c === "string" && cuentas.includes(sp.c) ? sp.c : cuentas[0];
  const finMesAnterior = sumarDias(`${hoyBogota().slice(0, 8)}01`, -1);
  const fecha = (v: unknown, otro: string) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : otro);
  return { supabase, cuentas, cuenta, desde: fecha(sp.d, `${finMesAnterior.slice(0, 8)}01`), hasta: fecha(sp.h, finMesAnterior) };
}

export function EncabezadoComisiones({ actual, ruta, subtitulo, cuentas, cuenta, desde, hasta, sinCosto, sinPeriodo }: {
  actual: "comisiones" | "sin-costo" | "liquidacion"; ruta: string; subtitulo: ReactNode; cuentas: string[]; cuenta: string; desde: string; hasta: string; sinCosto?: number;
  sinPeriodo?: boolean; // todavía no se ha filtrado: el calendario invita a elegir y las fechas no van en los enlaces
}) {
  const hoy = hoyBogota();
  const periodo = sinPeriodo ? "" : `d=${desde}&h=${hasta}`;
  return (
    <>
      <div>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">🏭 Proveeduría</h1>
        <p className="text-sm text-muted mt-1.5">{subtitulo}{sinPeriodo ? "" : ` · ${etiquetaRango(desde, hasta)}`}.</p>
      </div>
      <PestanasProveeduria actual={actual} cuenta={cuenta} periodo={periodo} sinCosto={sinCosto} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CalendarioUrl desde={desde} hasta={hasta} rangos={rangosRapidos(hoy)} hoy={hoy} extra={`c=${cuenta}&`} inactivo={sinPeriodo ? "Elegir periodo" : undefined} />
        <div className="flex flex-wrap items-center gap-2">
          {cuentas.map((c) => (
            <Link key={c} href={`${ruta}?c=${c}${periodo && `&${periodo}`}`} aria-current={c === cuenta ? "true" : undefined}
              className={`rounded-full border px-3 py-2 sm:py-1.5 text-xs font-semibold transition-colors ${c === cuenta ? "border-blue/50 bg-blue/15 text-text" : "border-line text-muted hover:text-text"}`}>
              {infoCuenta(c).bandera} {infoCuenta(c).nombre}
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
