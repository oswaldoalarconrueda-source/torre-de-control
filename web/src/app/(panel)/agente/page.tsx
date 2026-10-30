import { createClient, exigirModulo } from "@/lib/supabase/server";
import { hoyBogota, leerFiltros, rangoActivo, rangosRapidos, sumarDias } from "@/lib/filtros";
import { infoCuenta } from "@/lib/paises";
import { Encabezado } from "@/components/encabezado";
import { Agente, type DatosAuto, type Transportes } from "@/components/agente";
import { FabricaAgente, type DatosFabrica } from "@/components/fabrica-agente";
import { HuellaGuias } from "@/components/alerta-huella";

// Primer día con órdenes en la vigilancia del agente.
const INICIO_AGENTE = "2026-10-01";

// 🤖 Agente de órdenes de venta, país por país (empieza por Guatemala). Por ahora vigila: muestra cada orden con
// su remisión y su guía, y marca lo que falta o no cumple las reglas. Crear en Effi se activa más adelante.
export default async function AgentePage({ searchParams }: PageProps<"/agente">) {
  await exigirModulo("automatizacion");
  const sp = await searchParams;
  const f = leerFiltros({ ...sp, c: typeof sp.c === "string" ? sp.c : "TIENDA_GT" });
  const cuenta = f.cuentas?.[0] ?? "TIENDA_GT";
  // Calendario: sin fechas en la URL es hoy (en vivo). Otro día o varios = historial, hasta 7 días (Colombia tiene
  // cientos de órdenes por día); un rango más largo muestra sus últimos 7 días.
  const hoy = hoyBogota();
  const hasta = typeof sp.h === "string" ? f.hasta : hoy;
  const desdePedido = typeof sp.d === "string" ? f.desde : hoy;
  const desde = desdePedido < sumarDias(hasta, -6) ? sumarDias(hasta, -6) : desdePedido;
  const esHoy = desde === hoy && hasta === hoy;
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const fecha = (iso: string) => `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1]}`;
  const nombre = rangoActivo(rangosRapidos(hoy, INICIO_AGENTE), desde, hasta)?.label;
  const rango = esHoy ? null : {
    desde, hasta,
    etiqueta: `${nombre ? `${nombre} · ` : ""}${desde === hasta ? fecha(desde) : `${fecha(desde)} – ${fecha(hasta)}`}${desde !== desdePedido ? " (últimos 7 días del rango)" : ""}`,
  };
  const supabase = await createClient();
  const [{ data: config }, { data, error }, { data: fabrica }] = await Promise.all([
    supabase.from("auto_config").select("cuenta,modo,transportes:reglas->transportes").eq("cuenta", cuenta).maybeSingle(),
    supabase.rpc("auto_lista", rango ? { p_cuenta: cuenta, p_dias: 3, p_desde: desde, p_hasta: hasta } : { p_cuenta: cuenta, p_dias: 3 }),
    supabase.rpc("auto_fabrica", rango ? { p_cuenta: cuenta, p_desde: desde, p_hasta: hasta } : { p_cuenta: cuenta }),
  ]);
  const pais = infoCuenta(cuenta);
  // Historial: una semana de Colombia son ~2.200 órdenes (5 MB). A la pantalla solo va lo que muestra la tabla: el
  // resumen del plan y la dirección, sin los cuerpos completos que se enviaron a Effi.
  const datos = rango && data ? {
    ...(data as DatosAuto),
    ordenes: (data as DatosAuto).ordenes.map((o) => ({
      ...o,
      plan: o.plan ? {
        resumen: o.plan.resumen, remision_existente: o.plan.remision_existente,
        remision: o.plan.remision ? { direccion_cliente: o.plan.remision.direccion_cliente } : undefined,
        guia: o.plan.guia ? { direccion_destinatario: o.plan.guia.direccion_destinatario } : undefined,
      } : null,
    })),
  } : (data as DatosAuto | null);

  return (
    <>
      <Encabezado
        titulo="🤖 Agente"
        subtitulo={`${pais.bandera} ${pais.nombre} · cada orden de venta debe pasar a remisión con su convenio y tener guía. Si el cliente empieza con *, va por el centro de costos Recuperado.`}
        f={{ ...f, desde, hasta }}
        inicio={INICIO_AGENTE}
      />
      {/* "vigilar" = solo se traen sus órdenes y remisiones (para En vivo); el agente de ese país sigue en prueba. */}
      {!config || config.modo === "vigilar" ? (
        <div className="space-y-4">
          {/* Los mismos botones que en Guatemala y Ecuador, en prueba: aquí todavía no se ejecuta nada en Effi. */}
          <div className="card p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="relative inline-flex size-3 rounded-full bg-amber" />
              <div>
                <div className="font-semibold">Modo: En prueba</div>
                <div className="text-xs text-muted">El agente de {pais.nombre} todavía no ejecuta nada en Effi.</div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button disabled title="En prueba: todavía no se ejecuta nada en este país"
                className="inline-flex items-center gap-2 rounded-full bg-green/40 px-5 py-2.5 text-sm font-bold text-black/70 cursor-not-allowed">
                ▶ Ejecutar ahora
              </button>
              <button disabled title="En prueba: todavía no se ejecuta nada en este país"
                className="inline-flex items-center gap-2 rounded-full border border-green/30 px-5 py-2.5 text-sm font-bold text-green/60 cursor-not-allowed">
                ▶ Activar automático
              </button>
            </div>
          </div>
          {fabrica && <FabricaAgente d={fabrica as DatosFabrica} periodo={rango?.etiqueta} />}
          <div className="card p-10 text-center">
            <div className="text-4xl">{pais.bandera}</div>
            <p className="font-display text-xl font-semibold mt-3">El agente de {pais.nombre} está en prueba</p>
            <p className="text-sm text-muted mt-1">Cuando definamos las reglas de este país, los botones se activan.</p>
          </div>
        </div>
      ) : (
        <>
          {error && <p className="text-sm text-red mb-4">{error.message}</p>}
          {datos && <Agente key={`${cuenta}-${desde}-${hasta}`} cuenta={cuenta} datos={datos} transportes={(config?.transportes ?? {}) as Transportes}
            fabrica={fabrica as DatosFabrica | null} rango={rango}
            huella={pais.pais === "GT" && !rango ? <HuellaGuias cuenta={cuenta} zona={pais.zona} /> : null} />}
        </>
      )}
    </>
  );
}
