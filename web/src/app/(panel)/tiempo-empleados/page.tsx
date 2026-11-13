import { redirect } from "next/navigation";
import { CalendarioUrl } from "@/components/calendario-url";
import { createClient, getUsuario } from "@/lib/supabase/server";
import { etiquetaRango, hoyBogota, leerFiltros, rangosRapidos } from "@/lib/filtros";
import { haceCuanto, nombrePropio } from "@/lib/formato";

// ⏱️ Gestión tiempo empleados (pedido del dueño, 12-nov-2026; antes era el bloque "Rendimiento del equipo" de Inicio):
// quién está en línea y cuánto tiempo tuvo abierto y a la vista el Centro de Control en el periodo. Solo el dueño.
type Miembro = { nombre: string; en_linea: boolean; visto: string | null; segundos: number };

const tiempo = (s: number) => {
  if (s < 60) return "—";
  const min = Math.round(s / 60);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
};

function Equipo({ gente, periodo }: { gente: Miembro[]; periodo: string }) {
  // Tres columnas de lista para que el equipo no ocupe media pantalla.
  const alto = Math.ceil(gente.length / 3);
  const columnas = [gente.slice(0, alto), gente.slice(alto, alto * 2), gente.slice(alto * 2)].filter((c) => c.length);
  return (
    <section className="card min-w-0 p-4 sm:p-5">
      <h2 className="font-display text-base font-semibold tracking-tight">Tiempo conectado <span className="text-xs font-normal text-muted">· {periodo}</span></h2>
      <div className="mt-3 grid items-start gap-x-8 gap-y-0 md:gap-y-4 md:grid-cols-2 xl:grid-cols-3">
        {columnas.map((col, i) => (
          <table key={i} className="w-full text-[13px]">
            {/* En celular las columnas quedan una debajo de otra: un solo encabezado. */}
            <thead className={i ? "max-md:hidden" : undefined}>
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted">
                <th className="pb-1.5 font-medium">Usuario</th>
                <th className="pb-1.5 font-medium">Estado</th>
                <th className="pb-1.5 text-right font-medium" title="Tiempo con el Centro de Control abierto y a la vista">Tiempo</th>
              </tr>
            </thead>
            <tbody>
              {col.map((g) => (
                <tr key={g.nombre + g.visto} className="border-t border-line/60">
                  <td className="max-w-[10rem] truncate py-1.5 pr-2" title={nombrePropio(g.nombre)}>{nombrePropio(g.nombre)}</td>
                  <td className="py-1.5 pr-2" title={g.en_linea ? "Conectado ahora" : g.visto ? `Última vez ${haceCuanto(g.visto)}` : "Aún no ha entrado"}>
                    {g.en_linea
                      ? <span className="rounded-full bg-green/15 px-2 py-0.5 text-[11px] font-medium text-green">Online</span>
                      : <span className="rounded-full bg-red/15 px-2 py-0.5 text-[11px] font-medium text-red">Off</span>}
                  </td>
                  <td className="num whitespace-nowrap py-1.5 text-right">{tiempo(Number(g.segundos))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
    </section>
  );
}

export default async function TiempoEmpleadosPage({ searchParams }: PageProps<"/tiempo-empleados">) {
  const u = await getUsuario();
  if (u?.rol !== "owner") redirect("/");
  const hoy = hoyBogota();
  const sp = await searchParams;
  // Sin fechas en la dirección: hoy.
  const { desde, hasta } = leerFiltros(typeof sp.d === "string" ? sp : { ...sp, d: hoy, h: hoy });
  const supabase = await createClient();
  const { data } = await supabase.rpc("app_inicio_equipo", { p_desde: desde, p_hasta: hasta });
  const gente = (data ?? []) as Miembro[];
  const periodo = desde === hoy && hasta === hoy ? "Hoy" : etiquetaRango(desde, hasta);
  const enLinea = gente.filter((g) => g.en_linea).length;
  const total = gente.reduce((t, g) => t + Number(g.segundos), 0);

  return (
    <>
      <header className="pt-6 lg:pt-8 mb-5 flex flex-wrap items-end justify-between gap-3 lg:pr-28">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Gestión tiempo empleados</h1>
          <p className="mt-0.5 text-sm text-muted">
            {enLinea} en línea ahora · {tiempo(total)} conectados entre todos · {periodo}
          </p>
        </div>
        <CalendarioUrl desde={desde} hasta={hasta} rangos={rangosRapidos(hoy)} hoy={hoy} />
      </header>
      {gente.length ? <Equipo gente={gente} periodo={periodo} /> : <p className="text-sm text-muted">No hay empleados ni socios en esta sociedad.</p>}
    </>
  );
}
