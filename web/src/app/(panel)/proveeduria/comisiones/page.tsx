import { exigirModulo } from "@/lib/supabase/server";
import { ComisionesProveeduria, type DatosComisiones } from "@/components/comisiones-proveeduria";
import { EncabezadoComisiones, leerComisiones } from "@/components/encabezado-comisiones";

// 💼 Comisiones de la proveeduría: la liquidación que se hacía en Excel cada mes, una empresa a la vez (nunca se suman).
export default async function ComisionesPage({ searchParams }: PageProps<"/proveeduria/comisiones">) {
  await exigirModulo("proveeduria");
  const { supabase, cuentas, cuenta, desde, hasta } = await leerComisiones(await searchParams);
  const { data, error } = await supabase.rpc("prov_comisiones", { p_cuenta: cuenta, p_desde: desde, p_hasta: hasta });
  const datos = data as DatosComisiones | null;

  return (
    <div className="pt-8 space-y-4">
      <EncabezadoComisiones actual="comisiones" ruta="/proveeduria/comisiones" cuentas={cuentas} cuenta={cuenta} desde={desde} hasta={hasta} sinCosto={datos?.sin_costo}
        subtitulo="Comisión del administrador sobre las ventas por dropshipping ya liquidadas en la wallet" />
      {error && <div className="card p-6 text-sm text-red">No se pudieron calcular las comisiones: {error.message}</div>}
      {datos && <ComisionesProveeduria cuenta={cuenta} datos={datos} verSinCosto={`/proveeduria/comisiones/sin-costo?c=${cuenta}&d=${desde}&h=${hasta}`} />}
    </div>
  );
}
