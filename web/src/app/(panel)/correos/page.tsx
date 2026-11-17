import { redirect } from "next/navigation";
import { createClient, getUsuario } from "@/lib/supabase/server";
import { DEMO } from "@/lib/demo";
import { cortePendientes, htmlCpa, htmlPendientes, type Cpa, type Pendiente } from "@/lib/correos-demo";
import { dinero, entero } from "@/lib/formato";
import { Panel, TablaScroll } from "@/components/ui";

// ✉️ Informes por correo (modo demostración, 17-nov-2026): los dos correos que manda el Centro de Control, tal como llegan,
// con los datos de un día de septiembre: el CPA real del día (5 a. m., a los socios de la pauta) y las guías pendientes
// por despacho (8 a. m., al hilo de despachos de cada país). Aquí solo se ven; no se envía nada. Solo el dueño.
const PAISES: [string, string][] = [["TIENDA_CO", "Colombia"], ["TIENDA_EC", "Ecuador"], ["TIENDA_GT", "Guatemala"], ["TIENDA_CR", "Costa Rica"]];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const ayer = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

export default async function CorreosPage({ searchParams }: PageProps<"/correos">) {
  const u = await getUsuario();
  if (u?.rol !== "owner") redirect("/");
  const sp = await searchParams;
  const pedido = typeof sp.dia === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.dia) ? sp.dia : "2026-09-23";
  const dia = pedido < "2026-09-02" ? "2026-09-02" : pedido > "2026-10-01" ? "2026-10-01" : pedido;
  const semana = DIAS[new Date(`${dia}T12:00:00Z`).getUTCDay()];
  const domingo = semana === "domingo";
  const corte = cortePendientes(dia);
  const supabase = await createClient();
  const [{ data: cpa }, ...pend] = await Promise.all([
    supabase.rpc("demo_informe_cpa", { p_dia: ayer(dia) }),
    ...PAISES.map(([c]) => supabase.rpc("demo_pendientes_despacho", { p_cuenta: c, p_hoy: dia, p_corte: corte })),
  ]);
  const pendientes = PAISES.map(([c, nombre], i) => ({ c, nombre, guias: ((pend[i]?.data ?? []) as Pendiente[]) }));

  return (
    <>
      <div className="pt-8 mb-6 space-y-3">
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">✉️ Informes por correo</h1>
        <p className="text-sm text-muted">
          Lo que el Centro de Control manda solo cada mañana, tal como llega al correo: el <b>CPA real del día</b> (5 a. m., a los
          socios que manejan la pauta) y las <b>guías pendientes por despacho</b> (8 a. m., al hilo de despachos de cada país, con
          un Excel por proveedor). Con los datos de {DEMO.etiqueta.toLowerCase()}; aquí solo se ven, no se envía nada.
        </p>
        <form className="flex flex-wrap items-center gap-2 text-sm">
          <label htmlFor="dia" className="text-muted">Correos del día</label>
          <input id="dia" name="dia" type="date" defaultValue={dia} min="2026-09-02" max="2026-10-01"
            className="rounded-lg border border-line bg-bg px-3 py-1.5" />
          <button className="rounded-lg border border-line px-3 py-1.5 font-semibold hover:bg-tinte/[0.05]">Ver</button>
          <span className="text-muted">({semana})</span>
        </form>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel titulo="🚨 URGENTE · CPA real del día" detalle={`Llega a las 5 a. m. del ${dia.slice(8)}/${dia.slice(5, 7)} con lo de ayer: gasto de Meta ÷ pedidos de LucidSales`}>
          <iframe title="Correo del CPA real" srcDoc={htmlCpa((cpa ?? []) as Cpa[], ayer(dia))} className="h-[1100px] w-full rounded-xl border border-line bg-[#070b16]" />
        </Panel>

        <div className="space-y-4">
          {domingo && <p className="text-sm text-muted">Los domingos no sale el correo de pendientes por despacho.</p>}
          {!domingo && pendientes.map((p) => (
            <Panel key={p.c} titulo={`📦 Guías pendientes por despacho · ${p.nombre}`}
              detalle={p.guias.length ? `Llega a las 8 a. m. · corte: creadas hasta el ${corte.slice(8)}/${corte.slice(5, 7)}` : "Ese día no tuvo pendientes: el correo no sale"}>
              {p.guias.length > 0 && (
                <>
                  <iframe title={`Correo de pendientes ${p.nombre}`} srcDoc={htmlPendientes(p.nombre, corte, p.guias)}
                    className="w-full rounded-xl border border-line bg-white" style={{ height: 190 + 26 * new Set(p.guias.map((g) => `${g.dia}|${g.proveedor}`)).size }} />
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm font-semibold">Lo que va en los Excel por proveedor · {entero(p.guias.length)} guías</summary>
                    <TablaScroll>
                      <thead><tr><th>Proveedor</th><th>Transportadora</th><th>Guía</th><th>Producto</th><th className="text-right">Valor a recaudar</th></tr></thead>
                      <tbody>
                        {p.guias.map((g, i) => (
                          <tr key={`${g.guia}-${i}`}>
                            <td>{g.proveedor}</td><td>{g.transportadora}</td><td className="font-mono text-xs">{g.guia ?? "—"}</td>
                            <td className="text-muted">{g.producto}</td><td className="text-right num">{dinero(g.valor, p.c)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </TablaScroll>
                  </details>
                </>
              )}
            </Panel>
          ))}
        </div>
      </div>
    </>
  );
}
