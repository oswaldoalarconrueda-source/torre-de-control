import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, exigirModulo } from "@/lib/supabase/server";
import { etiquetaRango, hoyBogota, rangosRapidos, sumarDias } from "@/lib/filtros";
import { infoCuenta, ordenCuenta } from "@/lib/paises";
import { CalendarioUrl } from "@/components/calendario-url";
import { ComisionesProveeduria, type DatosComisiones } from "@/components/comisiones-proveeduria";
import { PestanasProveeduria } from "@/components/pestanas-proveeduria";

// 💼 Comisiones de la proveeduría: la liquidación que se hacía en Excel cada mes, una empresa a la vez (nunca se suman).
export default async function ComisionesPage({ searchParams }: PageProps<"/proveeduria/comisiones">) {
  await exigirModulo("proveeduria");
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: cuentasData } = await supabase.from("effi_accounts").select("slug").eq("tipo", "proveeduria").eq("activa", true);
  const cuentas = (cuentasData ?? []).map((c) => c.slug as string).sort((a, b) => ordenCuenta(a) - ordenCuenta(b));
  // Proveeduría es solo de Distrilatam: mirando otra sociedad no hay nada que mostrar aquí.
  if (!cuentas.length) redirect("/inicio");
  const cuenta = typeof sp.c === "string" && cuentas.includes(sp.c) ? sp.c : cuentas[0];
  // Sin fechas en la dirección: el mes anterior completo, que es el que se liquida.
  const hoy = hoyBogota();
  const finMesAnterior = sumarDias(`${hoy.slice(0, 8)}01`, -1);
  const fecha = (v: unknown, otro: string) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : otro);
  const desde = fecha(sp.d, `${finMesAnterior.slice(0, 8)}01`);
  const hasta = fecha(sp.h, finMesAnterior);
  const { data, error } = cuenta ? await supabase.rpc("prov_comisiones", { p_cuenta: cuenta, p_desde: desde, p_hasta: hasta }) : { data: null, error: null };
  const href = (c: string) => `/proveeduria/comisiones?c=${c}&d=${desde}&h=${hasta}`;

  return (
    <div className="pt-8 space-y-4">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">🏭 Proveeduría</h1>
        <p className="text-sm text-muted mt-1.5">Comisión del encargado sobre las ventas por dropshipping ya liquidadas en la wallet · {etiquetaRango(desde, hasta)}.</p>
      </div>
      <PestanasProveeduria actual="comisiones" cuenta={cuenta} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CalendarioUrl desde={desde} hasta={hasta} rangos={rangosRapidos(hoy)} hoy={hoy} extra={cuenta ? `c=${cuenta}&` : ""} />
        <div className="flex flex-wrap items-center gap-2">
          {cuentas.map((c) => (
            <Link key={c} href={href(c)} aria-current={c === cuenta ? "true" : undefined}
              className={`rounded-full border px-3 py-2 sm:py-1.5 text-xs font-semibold transition-colors ${c === cuenta ? "border-blue/50 bg-blue/15 text-text" : "border-line text-muted hover:text-text"}`}>
              {infoCuenta(c).bandera} {infoCuenta(c).nombre}
            </Link>
          ))}
        </div>
      </div>
      {error && <div className="card p-6 text-sm text-red">No se pudieron calcular las comisiones: {error.message}</div>}
      {cuenta && data && <ComisionesProveeduria cuenta={cuenta} datos={data as DatosComisiones} />}
    </div>
  );
}
