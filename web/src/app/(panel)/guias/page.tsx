import { createClient, exigirModulo } from "@/lib/supabase/server";
import { leerFiltros, rpcArgs } from "@/lib/filtros";
import { dias, dinero, entero, fechaHora, pct } from "@/lib/formato";
import { infoCuenta, semaforoDevolucion, semaforoEfectividad } from "@/lib/paises";
import { Encabezado } from "@/components/encabezado";
import { Chip, Panel, TablaScroll, Vacio } from "@/components/ui";

type Transp = {
  cuenta: string; transportadora: string; guias: number; entregadas: number; devoluciones: number; abiertas: number;
  efectividad: number | null; pct_devolucion: number | null; flete_promedio: number | null; ticket_promedio: number | null;
  recaudo_entregado: number | null; dias_entrega: number | null; dias_pago: number | null; sin_liquidar: number;
};
type Ciudad = { cuenta: string; provincia: string | null; ciudad: string | null; guias: number; entregadas: number; devoluciones: number; efectividad: number | null };
type Estancada = { cuenta: string; guia: string | null; estado: string | null; transportadora: string | null; destino: string; ultimo_cambio: string; dias: number; valor_recaudo: number | null };

export default async function GuiasPage({ searchParams }: PageProps<"/guias">) {
  await exigirModulo("guias");
  const sp = await searchParams;
  const f = leerFiltros(sp);
  const orden = sp.orden === "mejores" ? "mejores" : "peores";
  const supabase = await createClient();
  const [{ data: tr }, { data: ci }, { data: es }] = await Promise.all([
    supabase.rpc("kpi_transportadoras", rpcArgs(f)),
    supabase.rpc("kpi_ciudades", { ...rpcArgs(f), p_min: 15 }),
    supabase.rpc("kpi_estancadas", { p_cuentas: f.cuentas, p_dias: 5 }),
  ]);
  const transp = (tr ?? []) as Transp[];
  const ciudades = ((ci ?? []) as Ciudad[])
    .filter((c) => c.efectividad != null)
    .sort((a, b) => (orden === "peores" ? Number(a.efectividad) - Number(b.efectividad) : Number(b.efectividad) - Number(a.efectividad)))
    .slice(0, 25);
  const estancadas = (es ?? []) as Estancada[];

  return (
    <>
      <Encabezado titulo="🚚 Transportadoras y ciudades" subtitulo="Transportadoras, ciudades y guías que no se mueven. Solo guías vigentes creadas en el periodo." f={f} />

      <Panel titulo="Por transportadora" detalle="Promedio por guía = valor promedio a recaudar contra entrega · Días a pagar = de la entrega al recaudo en el wallet">
        {transp.length ? (
          <TablaScroll>
            <thead>
              <tr>
                <th>País</th><th>Transportadora</th><th className="text-right">Guías</th><th className="text-right">Entregadas</th>
                <th className="text-right">Devol.</th><th className="text-right">Abiertas</th><th className="text-right">Efectividad</th>
                <th className="text-right">% devolución</th><th className="text-right">Promedio por guía</th><th className="text-right">Flete prom.</th>
                <th className="text-right">Días entrega</th><th className="text-right">Días pago</th><th className="text-right">Sin liquidar</th>
              </tr>
            </thead>
            <tbody>
              {transp.map((t) => (
                <tr key={`${t.cuenta}-${t.transportadora}`}>
                  <td>{infoCuenta(t.cuenta).bandera}</td>
                  <td className="font-medium">{t.transportadora}</td>
                  <td className="text-right num">{entero(t.guias)}</td>
                  <td className="text-right num">{entero(t.entregadas)}</td>
                  <td className="text-right num">{entero(t.devoluciones)}</td>
                  <td className="text-right num text-muted">{entero(t.abiertas)}</td>
                  <td className="text-right num">{pct(t.efectividad)}</td>
                  <td className="text-right"><Chip s={semaforoDevolucion(t.cuenta, t.pct_devolucion)}>{pct(t.pct_devolucion)}</Chip></td>
                  <td className="text-right num">{dinero(t.ticket_promedio, t.cuenta)}</td>
                  <td className="text-right num">{dinero(t.flete_promedio, t.cuenta)}</td>
                  <td className="text-right num">{dias(t.dias_entrega)}</td>
                  <td className="text-right num">{dias(t.dias_pago)}</td>
                  <td className={`text-right num ${t.sin_liquidar ? "text-amber" : "text-muted"}`}>{entero(t.sin_liquidar)}</td>
                </tr>
              ))}
            </tbody>
          </TablaScroll>
        ) : <Vacio>Sin guías en este periodo.</Vacio>}
      </Panel>

      <div className="grid xl:grid-cols-2 gap-3 mt-3">
        <Panel
          titulo={orden === "peores" ? "Ciudades con peor efectividad" : "Ciudades con mejor efectividad"}
          detalle="Mínimo 15 guías · verde ≥ 70 %, amarillo ≥ 50 %"
          accion={
            <a href={`?${new URLSearchParams({ ...(Object.fromEntries(Object.entries(sp).filter(([, v]) => typeof v === "string")) as Record<string, string>), orden: orden === "peores" ? "mejores" : "peores" })}`} className="text-xs text-blue-2 hover:underline whitespace-nowrap">
              Ver {orden === "peores" ? "mejores" : "peores"}
            </a>
          }
        >
          {ciudades.length ? (
            <TablaScroll>
              <thead><tr><th>País</th><th>Ciudad</th><th className="text-right">Guías</th><th className="text-right">Entregadas</th><th className="text-right">Devol.</th><th className="text-right">Efectividad</th></tr></thead>
              <tbody>
                {ciudades.map((c) => (
                  <tr key={`${c.cuenta}-${c.provincia}-${c.ciudad}`}>
                    <td>{infoCuenta(c.cuenta).bandera}</td>
                    <td>{c.ciudad ?? "—"}<span className="text-muted text-xs"> · {c.provincia ?? ""}</span></td>
                    <td className="text-right num">{entero(c.guias)}</td>
                    <td className="text-right num">{entero(c.entregadas)}</td>
                    <td className="text-right num">{entero(c.devoluciones)}</td>
                    <td className="text-right"><Chip s={semaforoEfectividad(c.efectividad)}>{pct(c.efectividad)}</Chip></td>
                  </tr>
                ))}
              </tbody>
            </TablaScroll>
          ) : <Vacio>Sin ciudades con suficientes guías.</Vacio>}
        </Panel>

        <Panel titulo="Guías estancadas" detalle={`Abiertas (tránsito, oficina o novedad) sin cambio de estado hace más de 5 días · ${entero(estancadas.length)} guías`}>
          {estancadas.length ? (
            <div className="max-h-[34rem] overflow-y-auto">
              <TablaScroll>
                <thead><tr><th>País</th><th>Guía</th><th>Estado</th><th>Transportadora</th><th>Destino</th><th className="text-right">Último cambio</th><th className="text-right">Días</th><th className="text-right">Recaudo</th></tr></thead>
                <tbody>
                  {estancadas.map((e) => (
                    <tr key={`${e.cuenta}-${e.guia}`}>
                      <td>{infoCuenta(e.cuenta).bandera}</td>
                      <td className="font-mono text-xs">{e.guia ?? "—"}</td>
                      <td>{e.estado ?? "—"}</td>
                      <td className="text-muted">{e.transportadora ?? "—"}</td>
                      <td className="text-muted">{e.destino}</td>
                      <td className="text-right text-muted">{fechaHora(e.ultimo_cambio)}</td>
                      <td className={`text-right num ${e.dias > 10 ? "text-red" : "text-amber"}`}>{Number(e.dias).toFixed(0)}</td>
                      <td className="text-right num">{dinero(e.valor_recaudo, e.cuenta)}</td>
                    </tr>
                  ))}
                </tbody>
              </TablaScroll>
            </div>
          ) : <Vacio>Ninguna guía estancada. 👌</Vacio>}
        </Panel>
      </div>
    </>
  );
}
