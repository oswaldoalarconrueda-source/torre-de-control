import { redirect } from "next/navigation";
import { createClient, getUsuario } from "@/lib/supabase/server";
import { ordenCuenta } from "@/lib/paises";
import { AgenteAdmin, type Cierre, type ConfigAdmin, type NovedadAdmin } from "@/components/agente-admin";

// 🧾 Agente admin (solo el dueño): la wallet de Effi pasa a comprobantes de ingreso y egreso en Effi. Corre martes,
// jueves y sábado a las 8 a. m. y el 1.º de cada mes a la 1 a. m.; en modo "Revisar" deja el cierre listo para que el
// dueño le dé "Crear en Effi". Abajo, las novedades: lo que el agente no pudo cerrar o conviene mirar.
export default async function AgenteAdminPage({ searchParams }: PageProps<"/agente-admin">) {
  const u = await getUsuario();
  if (u?.rol !== "owner") redirect("/");
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: configs } = await supabase.from("admin_config").select("cuenta,modo,ultima_corrida,ultimo_error,remisiones_completas,remisiones_pagina");
  const lista = ((configs ?? []) as ConfigAdmin[]).sort((a, b) => ordenCuenta(a.cuenta) - ordenCuenta(b.cuenta));
  const cuenta = typeof sp.c === "string" && lista.some((x) => x.cuenta === sp.c) ? sp.c : (lista.find((x) => x.modo !== "apagado") ?? lista[0])?.cuenta ?? "TIENDA_GT";
  const [{ data: cierres }, { data: novedades }] = await Promise.all([
    supabase.from("admin_cierres").select("id,desde,hasta,estado,origen,resumen,comprobantes,creado_en,creado_por,aprobado_en,aprobado_por,error")
      .eq("cuenta", cuenta).order("id", { ascending: false }).limit(12),
    supabase.from("admin_novedades").select("id,tipo,guia,valor,detalle,creado_en,actualizado_en")
      .eq("cuenta", cuenta).is("resuelta_en", null).order("actualizado_en", { ascending: false }).limit(300),
  ]);
  // Los cuerpos para Effi (miles de abonos) se quedan en el servidor: la pantalla solo necesita el resumen.
  type Completo = Cierre["comprobantes"][number] & { cuerpo?: unknown; wallet_ids?: unknown; pagos?: unknown };
  const ligeros = ((cierres ?? []) as (Omit<Cierre, "comprobantes"> & { comprobantes: Completo[] })[])
    .map((c) => ({ ...c, comprobantes: c.comprobantes.map(({ cuerpo: _c, wallet_ids: _w, pagos: _p, ...x }) => x) }));
  return <AgenteAdmin cuenta={cuenta} configs={lista} cierres={ligeros} novedades={(novedades ?? []) as NovedadAdmin[]} />;
}
