import { createClient } from "@/lib/supabase/server";
import { leerFiltros, rpcArgs } from "@/lib/filtros";
import { dinero, entero, fechaHora } from "@/lib/formato";
import { infoCuenta } from "@/lib/paises";
import { Encabezado } from "@/components/encabezado";
import { Kpi, Panel, TablaScroll, Vacio } from "@/components/ui";

type SinLiq = { cuenta: string; guia: string | null; transportadora: string | null; destino: string; fecha_entrega: string | null; dias: number | null; valor_recaudo: number | null };

export default async function SinLiquidarPage({ searchParams }: PageProps<"/sin-liquidar">) {
  const f = leerFiltros(await searchParams);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("kpi_sin_liquidar", rpcArgs(f));
  const filas = (data ?? []) as SinLiq[];
  const porCuenta = Object.groupBy(filas, (r) => r.cuenta);

  return (
    <>
      <Encabezado
        titulo="⏳ Guías sin liquidar"
        subtitulo="Guías entregadas sin recaudo acreditado en el wallet, sin excepción por días de rezago (regla de tu dashboard). Más de 1 día suele ser para reclamar al asesor de Effi."
        f={f}
      />
      {error && <p className="text-sm text-red mb-4">{error.message}</p>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        {Object.entries(porCuenta).map(([c, rs]) => {
          const atrasadas = (rs ?? []).filter((r) => Number(r.dias) > 1).length;
          return (
            <Kpi
              key={c}
              etiqueta={`${infoCuenta(c).bandera} ${infoCuenta(c).nombre}`}
              valor={entero(rs?.length ?? 0)}
              nota={`${entero(atrasadas)} con más de 1 día · ${dinero((rs ?? []).reduce((a, r) => a + Number(r.valor_recaudo ?? 0), 0), c, true)} por cobrar`}
              semaforo={atrasadas > 0 ? "rojo" : "verde"}
            />
          );
        })}
      </div>
      {filas.length === 0 && !error && <div className="card p-6"><Vacio>Todo liquidado en este periodo. 👌</Vacio></div>}
      {Object.entries(porCuenta).map(([c, rs]) => (
        <Panel key={c} titulo={`${infoCuenta(c).bandera} ${infoCuenta(c).nombre}`} detalle={`${entero(rs?.length ?? 0)} guías`} className="mb-3">
          <TablaScroll>
            <thead><tr><th>Guía</th><th>Transportadora</th><th>Destino</th><th className="text-right">Entregada</th><th className="text-right">Días sin pago</th><th className="text-right">Recaudo</th></tr></thead>
            <tbody>
              {(rs ?? []).map((r) => (
                <tr key={`${r.cuenta}-${r.guia}`}>
                  <td className="font-mono text-xs">{r.guia ?? "—"}</td>
                  <td className="text-muted">{r.transportadora ?? "—"}</td>
                  <td className="text-muted">{r.destino}</td>
                  <td className="text-right text-muted">{fechaHora(r.fecha_entrega)}</td>
                  <td className={`text-right num ${Number(r.dias) > 3 ? "text-red" : Number(r.dias) > 1 ? "text-amber" : "text-muted"}`}>{r.dias == null ? "—" : Number(r.dias).toFixed(1).replace(".", ",")}</td>
                  <td className="text-right num">{dinero(r.valor_recaudo, c)}</td>
                </tr>
              ))}
            </tbody>
          </TablaScroll>
        </Panel>
      ))}
    </>
  );
}
