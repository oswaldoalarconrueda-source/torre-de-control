import { exigirModulo } from "@/lib/supabase/server";
import { etiquetaRango, hoyBogota } from "@/lib/filtros";
import { dinero, entero } from "@/lib/formato";
import { Dato, Linea, type DatosComisiones } from "@/components/comisiones-proveeduria";
import { EncabezadoComisiones, leerComisiones } from "@/components/encabezado-comisiones";
import { BuzonLiquidacion } from "@/components/buzon-liquidacion";
import { HistoricoLiquidaciones, type Pago } from "@/components/historico-liquidaciones";
import { Vacio } from "@/components/ui";
import type { DatosMayor } from "@/components/comisiones-mayor";

// 🧾 Liquidación del administrador: los totales salen solo cuando se filtra el periodo. Cada pago se registra con la foto del soporte y
// queda en el histórico con los totales de ese momento, una empresa a la vez.
export default async function LiquidacionPage({ searchParams }: PageProps<"/proveeduria/liquidacion">) {
  await exigirModulo("proveeduria");
  const sp = await searchParams;
  const { supabase, cuentas, cuenta, desde, hasta } = await leerComisiones(sp);
  const filtrado = typeof sp.d === "string" && typeof sp.h === "string";
  const args = { p_cuenta: cuenta, p_desde: desde, p_hasta: hasta };
  const [{ data: calc, error }, { data: dm }, { data: lista }, { data: puede }] = await Promise.all([
    filtrado ? supabase.rpc("prov_comisiones", args) : Promise.resolve({ data: null, error: null }),
    filtrado ? supabase.rpc("prov_comisiones_mayor", args) : Promise.resolve({ data: null }),
    supabase.rpc("prov_liquidaciones_lista", { p_cuenta: cuenta }),
    supabase.rpc("prov_puede_pagar", { p_cuenta: cuenta }),
  ]);
  const pagos = (lista ?? []) as Pago[];
  const rutas = pagos.map((p) => p.soporte);
  const { data: firmas } = rutas.length ? await supabase.storage.from("comisiones-soportes").createSignedUrls(rutas, 3600) : { data: null };
  const enlaces = Object.fromEntries((firmas ?? []).map((f) => [f.path ?? "", f.signedUrl ?? ""]));

  const datos = calc as DatosComisiones | null;
  const t = datos?.totales;
  const mayor = (dm as DatosMayor | null)?.totales;
  const comisionTotal = Number(t?.comision ?? 0) + Number(mayor?.comision ?? 0);
  const vigentes = pagos.filter((p) => !p.anulado_en);
  const yaPagado = vigentes.filter((p) => p.desde === desde && p.hasta === hasta).reduce((a, p) => a + Number(p.monto_pagado), 0);
  const cruces = vigentes.filter((p) => p.desde <= hasta && p.hasta >= desde && !(p.desde === desde && p.hasta === hasta));
  const falta = comisionTotal - yaPagado;
  const porPagar = falta >= 0.01 ? falta : 0; // lo que queda por redondeo no es una deuda
  const $ = (v: number) => dinero(v, cuenta);

  return (
    <div className="pt-8 space-y-4">
      <EncabezadoComisiones actual="liquidacion" ruta="/proveeduria/liquidacion" cuentas={cuentas} cuenta={cuenta} desde={desde} hasta={hasta} sinPeriodo={!filtrado}
        subtitulo="Liquidación de la comisión del administrador" />
      {error && <div className="card p-6 text-sm text-red">No se pudieron calcular los totales: {error.message}</div>}
      {!filtrado && <div className="card p-2"><Vacio>Elige la empresa y el periodo en el calendario para ver los totales a liquidar.</Vacio></div>}
      {t && datos && (
        <>
          {datos.sin_costo > 0 && (
            <p className="text-xs text-muted">{entero(datos.sin_costo)} remisiones pagadas sin costo manual no entran en estos totales.</p>
          )}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            <Dato titulo="Remisiones" valor={entero(t.remisiones)} />
            <Dato titulo="Total neto" valor={$(t.total_neto)} />
            <Dato titulo="Costo manual" valor={$(t.costo)} />
            <Dato titulo="IVA" valor={$(t.iva)} />
            <Dato titulo="Comisión Effi" valor={$(t.comision_effi)} />
            <Dato titulo="Utilidad" valor={$(t.utilidad)} />
            <Dato titulo="Comisión administrador" valor={$(comisionTotal)} destacado className="col-span-2 md:col-span-1">
              {Number(mayor?.comision) > 0 && <Linea n={$(t.comision)}>dropshipping</Linea>}
              {Number(mayor?.comision) > 0 && <Linea n={$(Number(mayor?.comision))}>ventas por mayor ({entero(Number(mayor?.remisiones))})</Linea>}
              {yaPagado > 0 && <Linea n={$(yaPagado)}>ya pagado</Linea>}
              {yaPagado > 0 && <Linea n={$(porPagar)}>por pagar</Linea>}
            </Dato>
          </div>
          {cruces.length > 0 && (
            <div className="rounded-xl border border-amber/50 bg-amber/10 px-4 py-3 text-sm">
              <b className="text-amber">Revisa antes de pagar:</b> este periodo se cruza con {cruces.length === 1 ? "el pago" : "los pagos"} de {cruces.map((p) => etiquetaRango(p.desde, p.hasta)).join(", ")}.
            </div>
          )}
          {puede && (t.remisiones > 0 || Number(mayor?.remisiones) > 0) && (
            <BuzonLiquidacion key={`${cuenta}-${desde}-${hasta}-${vigentes.length}`} cuenta={cuenta} desde={desde} hasta={hasta} hoy={hoyBogota()} sugerido={porPagar} periodo={etiquetaRango(desde, hasta)} />
          )}
        </>
      )}
      <HistoricoLiquidaciones cuenta={cuenta} pagos={pagos} enlaces={enlaces} puedeAnular={!!puede} />
    </div>
  );
}
