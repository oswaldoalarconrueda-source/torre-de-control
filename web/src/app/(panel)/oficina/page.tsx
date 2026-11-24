import { createClient, exigirModulo } from "@/lib/supabase/server";
import { veEquipo } from "@/lib/modulos";
import { leerFiltros } from "@/lib/filtros";
import { infoCuenta } from "@/lib/paises";
import { Encabezado } from "@/components/encabezado";
import { CrmOficina, type Efectividad, type GuiaOficina } from "@/components/crm-oficina";
import { AvisoOficina } from "@/components/aviso-oficina";
import { enDemo } from "@/lib/demo-server";
import { EstadisticasOficina, type Estadisticas } from "@/components/estadisticas-oficina";
import { CuadreHoy, CuadreTablas, QuienHizoQue, ResumenOficina, type Cuadre, type PorUsuario } from "@/components/cuadre-oficina";

// 🏤 Disponible en oficina como CRM: cuadre de hoy arriba, lista para llamar (lo más nuevo arriba) y, al final,
// el cuadre diario, el resultado por día de llegada y la estadística de llamadas.
export default async function OficinaPage({ searchParams }: PageProps<"/oficina">) {
  const u = await exigirModulo("oficina");
  // Quién hizo qué (24-nov-2026): el dueño, los socios y la encargada con «Gestiones del equipo» ven a todos; cada
  // empleada ve solo sus propias gestiones.
  const equipo = veEquipo(u);
  const demo = await enDemo(); // la demostración quedó congelada el 17-nov: sin el aviso del 20-nov
  const f = leerFiltros(await searchParams);
  const cuenta = f.cuentas?.[0] ?? "TIENDA_CO";
  const supabase = await createClient();
  // Calendario arriba (pedido del dueño, 11-nov-2026): cambia el cuadre, el resultado por día de llegada, quién hizo qué y
  // la estadística de llamadas. La lista para llamar sigue siendo lo que hoy está en oficina.
  const rango = { p_desde: f.desde, p_hasta: f.hasta };
  const dias = Math.round((Date.parse(f.hasta) - Date.parse(f.desde)) / 86_400_000) + 1;
  const hoyLocal = new Intl.DateTimeFormat("en-CA", { timeZone: infoCuenta(cuenta).zona }).format(new Date());
  const conHoy = f.hasta >= hoyLocal;
  const periodo = dias === 1 ? (conHoy ? "hoy" : f.desde) : `${f.desde} a ${f.hasta}`;
  const [{ data: lista, error }, { data: est }, { data: cuadre }, { data: porUsuario }, { data: efectividad }] = await Promise.all([
    supabase.rpc("oficina_lista", { p_cuenta: cuenta }),
    supabase.rpc("oficina_estadisticas", { p_cuenta: cuenta, ...rango }),
    supabase.rpc("oficina_cuadre", { p_cuenta: cuenta, ...rango }),
    supabase.rpc("oficina_por_usuario", { p_cuenta: cuenta, ...rango }),
    supabase.rpc("oficina_efectividad", { p_cuenta: cuenta }),
  ]);
  const pais = infoCuenta(cuenta);

  return (
    <>
      <Encabezado
        titulo="🏤 Disponible en Oficina"
        subtitulo={`${pais.bandera} ${pais.nombre} · guías que esperan en la oficina de la transportadora. Lo que llegó más reciente va arriba: marca cada llamada (contacto 1, 2 y 3) y la observación.`}
        f={f}
      />
      {!demo && <AvisoOficina />}
      {error && <p className="text-sm text-red mb-4">{error.message}</p>}
      {/* "Hoy en la oficina" solo cuando el rango llega hasta hoy. */}
      {cuadre && conHoy && <CuadreHoy c={cuadre as Cuadre} />}
      {cuadre && <ResumenOficina c={cuadre as Cuadre} periodo={periodo} />}
      <CrmOficina key={cuenta} cuenta={cuenta} guias={(lista ?? []) as GuiaOficina[]} verEquipo={equipo}
        desde={f.desde} hasta={f.hasta} personas={equipo ? (porUsuario as PorUsuario[] | null) ?? [] : undefined}
        ingresaronHoy={conHoy ? (cuadre as Cuadre | null)?.cuadre[0]?.llegaron : undefined} efectividad={efectividad as Efectividad | null} />
      {porUsuario && <div className="mt-6"><QuienHizoQue filas={porUsuario as PorUsuario[]} periodo={periodo} equipo={equipo} /></div>}
      {cuadre && <CuadreTablas c={cuadre as Cuadre} />}
      {est && <EstadisticasOficina key={`est-${cuenta}-${f.desde}-${f.hasta}`} e={est as Estadisticas} cuenta={cuenta} />}
    </>
  );
}
