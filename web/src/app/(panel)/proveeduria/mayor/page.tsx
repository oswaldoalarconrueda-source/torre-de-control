import { exigirModulo } from "@/lib/supabase/server";
import { etiquetaRango, hoyBogota } from "@/lib/filtros";
import { dinero, entero } from "@/lib/formato";
import { Dato, Linea } from "@/components/comisiones-proveeduria";
import { ComisionesMayor, type DatosMayor } from "@/components/comisiones-mayor";
import { EncabezadoComisiones, leerComisiones } from "@/components/encabezado-comisiones";
import { SubirExcelMayor } from "@/components/subir-excel-mayor";
import { BuzonLiquidacion } from "@/components/buzon-liquidacion";
import { HistoricoLiquidaciones, type Pago } from "@/components/historico-liquidaciones";
import { Panel, Vacio } from "@/components/ui";

// 📦 Comisión por mayor: va aparte de la de drop porque se calcula distinto. Drop sale 100 % de Effi; por mayor sale siempre de un Excel
// que el equipo arma y revisa antes de subirlo. Aquí se sube, se ve por periodo y se paga con su propio soporte e histórico.
export default async function MayorPage({ searchParams }: PageProps<"/proveeduria/mayor">) {
  await exigirModulo("proveeduria");
  const { supabase, cuentas, cuenta, desde, hasta } = await leerComisiones(await searchParams);
  const [{ data, error }, { data: lista }, { data: puede }] = await Promise.all([
    supabase.rpc("prov_comisiones_mayor", { p_cuenta: cuenta, p_desde: desde, p_hasta: hasta }),
    supabase.rpc("prov_liquidaciones_lista", { p_cuenta: cuenta, p_tipo: "mayor" }),
    supabase.rpc("prov_puede_pagar", { p_cuenta: cuenta }),
  ]);
  const datos = data as DatosMayor | null;
  const t = datos?.totales;
  const pagos = (lista ?? []) as Pago[];
  const rutas = pagos.map((p) => p.soporte);
  const { data: firmas } = rutas.length ? await supabase.storage.from("comisiones-soportes").createSignedUrls(rutas, 3600) : { data: null };
  const enlaces = Object.fromEntries((firmas ?? []).map((f) => [f.path ?? "", f.signedUrl ?? ""]));

  const vigentes = pagos.filter((p) => !p.anulado_en);
  const yaPagado = vigentes.filter((p) => p.desde === desde && p.hasta === hasta).reduce((a, p) => a + Number(p.monto_pagado), 0);
  const cruces = vigentes.filter((p) => p.desde <= hasta && p.hasta >= desde && !(p.desde === desde && p.hasta === hasta));
  const falta = Number(t?.comision ?? 0) - yaPagado;
  const porPagar = falta >= 0.01 ? falta : 0;
  const $ = (v: number) => dinero(v, cuenta);

  return (
    <div className="pt-8 space-y-4">
      <EncabezadoComisiones actual="mayor" ruta="/proveeduria/mayor" cuentas={cuentas} cuenta={cuenta} desde={desde} hasta={hasta}
        subtitulo="Comisión del administrador por las ventas por mayor pagas, desde el Excel revisado" />
      {puede && <SubirExcelMayor cuenta={cuenta} />}
      {error && <div className="card p-6 text-sm text-red">No se pudo calcular la comisión por mayor: {error.message}</div>}
      {t && datos && (
        t.remisiones > 0 ? (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Dato titulo="Remisiones" valor={entero(t.remisiones)} />
              <Dato titulo="Venta con IVA" valor={$(t.venta_iva)} />
              <Dato titulo="Costo con IVA" valor={$(t.costo_iva)} />
              <Dato titulo="Utilidad" valor={$(t.utilidad)} />
              <Dato titulo="Comisión por mayor" valor={$(t.comision)} destacado className="col-span-2 md:col-span-1">
                {yaPagado > 0 && <Linea n={$(yaPagado)}>ya pagado</Linea>}
                {yaPagado > 0 && <Linea n={$(porPagar)}>por pagar</Linea>}
              </Dato>
            </div>
            <ComisionesMayor cuenta={cuenta} datos={datos} />
            {cruces.length > 0 && (
              <div className="rounded-xl border border-amber/50 bg-amber/10 px-4 py-3 text-sm">
                <b className="text-amber">Revisa antes de pagar:</b> este periodo se cruza con {cruces.length === 1 ? "el pago" : "los pagos"} de {cruces.map((p) => etiquetaRango(p.desde, p.hasta)).join(", ")}.
              </div>
            )}
            {puede && (
              <BuzonLiquidacion key={`${cuenta}-${desde}-${hasta}-${vigentes.length}`} tipo="mayor" cuenta={cuenta} desde={desde} hasta={hasta} hoy={hoyBogota()}
                sugerido={porPagar} periodo={etiquetaRango(desde, hasta)} />
            )}
          </>
        ) : (
          <Panel titulo="Ventas por mayor"><Vacio>No hay ventas por mayor cargadas en este periodo. Elige otro periodo o sube el Excel.</Vacio></Panel>
        )
      )}
      <HistoricoLiquidaciones cuenta={cuenta} pagos={pagos} enlaces={enlaces} puedeAnular={!!puede} />
    </div>
  );
}
