import { createClient, exigirModulo } from "@/lib/supabase/server";
import { conDropi as tiendasConDropi } from "@/lib/dropi";
import { hoyBogota, leerFiltros } from "@/lib/filtros";
import { infoCuenta } from "@/lib/paises";
import { Encabezado } from "@/components/encabezado";
import { Panel } from "@/components/ui";
import { DespachoEntregado } from "@/components/despacho-entregado";
import { ResumenDiario } from "@/components/resumen-diario";
import { FeedEstados } from "@/components/feed";
import { EstadoPyG } from "@/components/estado-pyg";
import { CuadrosDatos } from "@/components/cuadros-datos";
import { SelectorPlataforma, leerPlataforma } from "@/components/selector-plataforma";
import { DatosProveeduria } from "@/components/datos-proveeduria";

// 🛒 Datos: un país a la vez (nunca se suman países), como en el Dashboard Joalix.
export default async function DatosPage({ searchParams }: PageProps<"/">) {
  await exigirModulo("resumen");
  const sp = await searchParams;
  const f = leerFiltros(sp);
  const cuenta = f.cuentas?.[0] ?? "";
  const pais = infoCuenta(cuenta);
  // Proveeduría (Distrilatam): su propia vista de Datos, con las banderas de sus empresas.
  const supabase = await createClient();
  const { data: acc } = await supabase.from("effi_accounts").select("tipo").eq("slug", cuenta).maybeSingle();
  const esProveeduria = acc?.tipo === "proveeduria";
  // El selector Ambas / Effi / Dropi solo sale si la tienda tiene datos de Dropi; si no, todo es Effi y no se muestra.
  const conDropi = !esProveeduria && !!cuenta && (await tiendasConDropi(supabase, [cuenta])).length > 0;
  const plataforma = conDropi ? leerPlataforma(sp) : "effi";

  return (
    <>
      <Encabezado
        titulo="🛒 Datos"
        tipos={["tienda", "proveeduria"]}
        subtitulo={`${pais.bandera} ${pais.nombre} · montos en ${pais.divisa}. Guías y órdenes creadas en el periodo con su estado actual; el wallet y la cartera mandan (si hay pago, cuenta como entregada).`}
        f={f}
      />
      {conDropi && <div className="mb-3 flex justify-end"><SelectorPlataforma sp={sp} actual={plataforma} /></div>}
      {/* Proveeduría: el mismo formato; despachado = venta a la tienda que ya tiene guía, entregado por el estado global. */}
      {esProveeduria ? <DatosProveeduria cuenta={cuenta} f={f} /> : <DespachoEntregado f={f} plataforma={plataforma} />}
      <div className="mt-3">
        <ResumenDiario f={f} sp={sp} hoy={hoyBogota()} />
      </div>
      <EstadoPyG f={f} plataforma={plataforma} />
      <CuadrosDatos f={f} plataforma={plataforma} parte="pendientes" />
      <Panel titulo="Cambios de estado en vivo" detalle="Se actualiza solo · Effi se sincroniza cada minuto" className="mt-3">
        <FeedEstados cuentas={f.cuentas} />
      </Panel>
      <CuadrosDatos f={f} plataforma={plataforma} parte="gastos" />
    </>
  );
}
