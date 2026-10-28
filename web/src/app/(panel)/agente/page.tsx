import { createClient, exigirModulo } from "@/lib/supabase/server";
import { leerFiltros } from "@/lib/filtros";
import { infoCuenta } from "@/lib/paises";
import { Encabezado } from "@/components/encabezado";
import { Agente, type DatosAuto, type Transportes } from "@/components/agente";
import { FabricaAgente, type DatosFabrica } from "@/components/fabrica-agente";

// 🤖 Agente de órdenes de venta, país por país (empieza por Guatemala). Por ahora vigila: muestra cada orden con
// su remisión y su guía, y marca lo que falta o no cumple las reglas. Crear en Effi se activa más adelante.
export default async function AgentePage({ searchParams }: PageProps<"/agente">) {
  await exigirModulo("automatizacion");
  const sp = await searchParams;
  const f = leerFiltros({ ...sp, c: typeof sp.c === "string" ? sp.c : "TIENDA_GT" });
  const cuenta = f.cuentas?.[0] ?? "TIENDA_GT";
  const supabase = await createClient();
  const [{ data: config }, { data, error }, { data: fabrica }] = await Promise.all([
    supabase.from("auto_config").select("cuenta,modo,transportes:reglas->transportes").eq("cuenta", cuenta).maybeSingle(),
    supabase.rpc("auto_lista", { p_cuenta: cuenta, p_dias: 3 }),
    supabase.rpc("auto_fabrica", { p_cuenta: cuenta }),
  ]);
  const pais = infoCuenta(cuenta);

  return (
    <>
      <Encabezado
        titulo="🤖 Agente"
        subtitulo={`${pais.bandera} ${pais.nombre} · cada orden de venta debe pasar a remisión con su convenio y tener guía. Si el cliente empieza con *, va por el centro de costos Recuperado.`}
        f={f}
        conFechas={false}
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
          {fabrica && <FabricaAgente d={fabrica as DatosFabrica} />}
          <div className="card p-10 text-center">
            <div className="text-4xl">{pais.bandera}</div>
            <p className="font-display text-xl font-semibold mt-3">El agente de {pais.nombre} está en prueba</p>
            <p className="text-sm text-muted mt-1">Cuando definamos las reglas de este país, los botones se activan.</p>
          </div>
        </div>
      ) : (
        <>
          {error && <p className="text-sm text-red mb-4">{error.message}</p>}
          {data && <Agente key={cuenta} cuenta={cuenta} datos={data as DatosAuto} transportes={(config?.transportes ?? {}) as Transportes}
            fabrica={fabrica as DatosFabrica | null} />}
        </>
      )}
    </>
  );
}
