import Link from "next/link";
import { createClient, exigirModulo, getUsuario } from "@/lib/supabase/server";
import { esSocio } from "@/lib/modulos";
import { leerFiltros } from "@/lib/filtros";
import { infoCuenta } from "@/lib/paises";
import { Encabezado } from "@/components/encabezado";
import { HomologarCampanas, type CampanaHomologar } from "@/components/homologar-campanas";

// 📦 Homologación de campañas → producto. Las reglas por palabra asignan casi todo solas; aquí el dueño o un socio
// asigna las que quedan "Sin identificar" (o corrige una regla). Lo asignado a mano manda sobre las reglas.
export default async function HomologarPage({ searchParams }: PageProps<"/productos/homologar">) {
  await exigirModulo("resumen");
  const u = await getUsuario();
  const sp = await searchParams;
  const f = leerFiltros(sp);
  const cuenta = f.cuentas?.[0] ?? "TIENDA_CO";
  const pais = infoCuenta(cuenta);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("prod_campanas", { p_cuenta: cuenta, p_desde: f.desde, p_hasta: f.hasta });
  const d = data as { campanas: CampanaHomologar[]; productos: string[] } | null;

  return (
    <>
      <Encabezado
        titulo="📦 Homologar campañas"
        subtitulo={`${pais.bandera} ${pais.nombre} · a qué producto pertenece cada campaña de Meta con gasto en el periodo. Gasto en COP, como cobra Meta.`}
        f={f}
        inicio="2026-07-01"
      />
      <p className="mb-3 text-sm"><Link href={`/productos?c=${cuenta}&d=${f.desde}&h=${f.hasta}`} className="text-blue-2 hover:underline">← Volver a Productos</Link></p>
      {error || !d ? (
        <p className="text-sm text-red">No se pudieron cargar las campañas: {error?.message ?? "sin datos"}</p>
      ) : (
        <HomologarCampanas cuenta={cuenta} campanas={d.campanas} productos={d.productos} puedeEditar={!!u && esSocio(u)} />
      )}
    </>
  );
}
