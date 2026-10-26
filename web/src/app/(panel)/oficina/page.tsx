import { createClient, exigirModulo } from "@/lib/supabase/server";
import { leerFiltros } from "@/lib/filtros";
import { infoCuenta } from "@/lib/paises";
import { Encabezado } from "@/components/encabezado";
import { CrmOficina, type Efectividad, type GuiaOficina } from "@/components/crm-oficina";
import { EstadisticasOficina, type Estadisticas } from "@/components/estadisticas-oficina";
import { CuadreHoy, CuadreTablas, QuienHizoQue, ResumenOficina, type Cuadre, type PorUsuario } from "@/components/cuadre-oficina";

// 🏤 Disponible en oficina como CRM: cuadre de hoy arriba, lista para llamar (lo más nuevo arriba) y, al final,
// el cuadre diario, el resultado por día de llegada y la estadística de llamadas.
export default async function OficinaPage({ searchParams }: PageProps<"/oficina">) {
  const u = await exigirModulo("oficina");
  const esDueno = u.rol === "owner";
  const f = leerFiltros(await searchParams);
  const cuenta = f.cuentas?.[0] ?? "TIENDA_CO";
  const supabase = await createClient();
  const [{ data: lista, error }, { data: est }, { data: cuadre }, { data: porUsuario }, { data: efectividad }] = await Promise.all([
    supabase.rpc("oficina_lista", { p_cuenta: cuenta }),
    supabase.rpc("oficina_estadisticas", { p_cuenta: cuenta, p_dias: 14 }),
    supabase.rpc("oficina_cuadre", { p_cuenta: cuenta, p_dias: 14 }),
    esDueno ? supabase.rpc("oficina_por_usuario", { p_cuenta: cuenta, p_dias: 14 }) : Promise.resolve({ data: null }),
    supabase.rpc("oficina_efectividad", { p_cuenta: cuenta }),
  ]);
  const pais = infoCuenta(cuenta);

  return (
    <>
      <Encabezado
        titulo="🏤 Disponible en Oficina"
        subtitulo={`${pais.bandera} ${pais.nombre} · guías que esperan en la oficina de la transportadora. Lo que llegó más reciente va arriba: marca cada llamada (contacto 1, 2 y 3) y la observación.`}
        f={f}
        conFechas={false}
      />
      {error && <p className="text-sm text-red mb-4">{error.message}</p>}
      {cuadre && <CuadreHoy c={cuadre as Cuadre} />}
      {cuadre && <ResumenOficina c={cuadre as Cuadre} dias={14} />}
      <CrmOficina key={cuenta} cuenta={cuenta} guias={(lista ?? []) as GuiaOficina[]} esDueno={esDueno}
        ingresaronHoy={(cuadre as Cuadre | null)?.cuadre[0]?.llegaron} efectividad={efectividad as Efectividad | null} />
      {esDueno && porUsuario && <div className="mt-6"><QuienHizoQue filas={porUsuario as PorUsuario[]} dias={14} /></div>}
      {cuadre && <CuadreTablas c={cuadre as Cuadre} />}
      {est && <EstadisticasOficina e={est as Estadisticas} />}
    </>
  );
}
